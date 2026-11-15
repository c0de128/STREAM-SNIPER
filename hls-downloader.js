// HLS Downloader - downloads HLS (M3U8) streams inside the browser, no external tools needed.
//
// Works in any extension document (Firefox background page, Chrome offscreen document,
// player tab). Segments are fetched with the extension's referer/header rules applied by
// background.js, so hotlink-protected streams download the same way they play.
//
// Supports: master + media playlists, AES-128 (CBC) decryption via WebCrypto, fMP4 init
// segments (#EXT-X-MAP), byte ranges, live streams (records until cancelled or a time cap),
// concurrent segment fetching with in-order assembly.

const HlsDownloader = {
  DEFAULT_CONCURRENCY: 4,
  LIVE_MAX_SECONDS: 4 * 60 * 60,

  // ---------- Playlist parsing ----------

  resolveUrl(ref, baseUrl) {
    try {
      return new URL(ref, baseUrl).href;
    } catch (e) {
      return ref;
    }
  },

  parseAttributes(attrText) {
    const attrs = {};
    const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
    let m;
    while ((m = re.exec(attrText)) !== null) {
      attrs[m[1]] = m[3] !== undefined ? m[3] : m[2];
    }
    return attrs;
  },

  // Returns { type: 'master'|'media', variants, segments, endList, targetDuration, mediaSequence }
  parsePlaylist(text, baseUrl) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0 || !lines[0].startsWith('#EXTM3U')) {
      throw new Error('Not a valid M3U8 playlist');
    }

    const result = {
      type: 'media',
      variants: [],
      segments: [],
      endList: false,
      targetDuration: 0,
      mediaSequence: 0,
      isFmp4: false
    };

    let pendingVariant = null;
    let pendingDuration = 0;
    let pendingTitle = '';
    let pendingByteRange = null;
    let currentKey = null;
    let currentMap = null;
    let lastByteRangeEnd = 0;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        result.type = 'master';
        const attrs = this.parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
        pendingVariant = {
          bandwidth: parseInt(attrs.BANDWIDTH || attrs['AVERAGE-BANDWIDTH'] || '0', 10),
          resolution: attrs.RESOLUTION || '',
          codecs: attrs.CODECS || '',
          frameRate: attrs['FRAME-RATE'] ? parseFloat(attrs['FRAME-RATE']) : null,
          height: attrs.RESOLUTION ? parseInt(attrs.RESOLUTION.split('x')[1], 10) : 0
        };
      } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        result.targetDuration = parseFloat(line.split(':')[1]) || 0;
      } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        result.mediaSequence = parseInt(line.split(':')[1], 10) || 0;
      } else if (line.startsWith('#EXT-X-ENDLIST')) {
        result.endList = true;
      } else if (line.startsWith('#EXT-X-KEY:')) {
        const attrs = this.parseAttributes(line.slice('#EXT-X-KEY:'.length));
        if (!attrs.METHOD || attrs.METHOD === 'NONE') {
          currentKey = null;
        } else {
          currentKey = {
            method: attrs.METHOD,
            uri: attrs.URI ? this.resolveUrl(attrs.URI, baseUrl) : null,
            iv: attrs.IV || null,
            keyFormat: attrs.KEYFORMAT || 'identity'
          };
        }
      } else if (line.startsWith('#EXT-X-MAP:')) {
        const attrs = this.parseAttributes(line.slice('#EXT-X-MAP:'.length));
        currentMap = {
          url: this.resolveUrl(attrs.URI, baseUrl),
          byteRange: attrs.BYTERANGE ? this.parseByteRange(attrs.BYTERANGE, 0) : null
        };
        result.isFmp4 = true;
      } else if (line.startsWith('#EXTINF:')) {
        const body = line.slice('#EXTINF:'.length);
        const comma = body.indexOf(',');
        pendingDuration = parseFloat(comma >= 0 ? body.slice(0, comma) : body) || 0;
        pendingTitle = comma >= 0 ? body.slice(comma + 1) : '';
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        pendingByteRange = this.parseByteRange(line.split(':')[1], lastByteRangeEnd);
      } else if (line.startsWith('#')) {
        // Other tags ignored
      } else {
        // URI line
        const url = this.resolveUrl(line, baseUrl);
        if (pendingVariant) {
          pendingVariant.url = url;
          result.variants.push(pendingVariant);
          pendingVariant = null;
        } else {
          const seg = {
            url,
            duration: pendingDuration,
            title: pendingTitle,
            key: currentKey,
            map: currentMap,
            byteRange: pendingByteRange,
            sequence: result.mediaSequence + result.segments.length
          };
          if (pendingByteRange) lastByteRangeEnd = pendingByteRange.offset + pendingByteRange.length;
          result.segments.push(seg);
          pendingDuration = 0;
          pendingTitle = '';
          pendingByteRange = null;
        }
      }
    }

    if (!result.isFmp4 && result.segments.length > 0) {
      const first = result.segments[0].url.split('?')[0].toLowerCase();
      if (first.endsWith('.m4s') || first.endsWith('.mp4') || first.endsWith('.m4v') || first.endsWith('.m4a')) {
        result.isFmp4 = true;
      }
    }

    return result;
  },

  parseByteRange(text, previousEnd) {
    const [lenStr, offStr] = String(text).split('@');
    const length = parseInt(lenStr, 10);
    const offset = offStr !== undefined ? parseInt(offStr, 10) : previousEnd;
    return { length, offset };
  },

  // ---------- Variant selection ----------

  // preference: 'best' | 'worst' | '1080p' style string | { resolution, bandwidth }
  selectVariant(variants, preference = 'best') {
    if (!variants || variants.length === 0) return null;
    const sorted = [...variants].sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));

    if (!preference || preference === 'best') return sorted[0];
    if (preference === 'worst') return sorted[sorted.length - 1];

    let wantHeight = 0;
    let wantBandwidth = 0;
    if (typeof preference === 'string') {
      const m = preference.match(/(\d+)p/);
      if (m) wantHeight = parseInt(m[1], 10);
    } else if (typeof preference === 'object') {
      if (preference.resolution) wantHeight = parseInt(String(preference.resolution).split('x')[1], 10) || 0;
      if (preference.bandwidth) wantBandwidth = parseInt(preference.bandwidth, 10) || 0;
      if (preference.url) {
        const exact = variants.find(v => v.url === preference.url);
        if (exact) return exact;
      }
    }

    if (wantHeight) {
      const exact = sorted.find(v => v.height === wantHeight);
      if (exact) return exact;
      // Closest not exceeding, otherwise the smallest
      const below = sorted.filter(v => v.height && v.height <= wantHeight);
      return below[0] || sorted[sorted.length - 1];
    }
    if (wantBandwidth) {
      let best = sorted[0];
      let bestDiff = Infinity;
      for (const v of sorted) {
        const diff = Math.abs(v.bandwidth - wantBandwidth);
        if (diff < bestDiff) { bestDiff = diff; best = v; }
      }
      return best;
    }
    return sorted[0];
  },

  // ---------- Fetching ----------

  async fetchText(url, signal) {
    const response = await fetch(url, { signal, credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return response.text();
  },

  async fetchBytes(url, byteRange, signal) {
    const init = { signal, credentials: 'include' };
    if (byteRange) {
      init.headers = { Range: `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}` };
    }
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching segment`);
    return new Uint8Array(await response.arrayBuffer());
  },

  hexToBytes(hex) {
    const clean = hex.replace(/^0x/i, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  },

  sequenceToIv(sequence) {
    const iv = new Uint8Array(16);
    let n = sequence;
    for (let i = 15; i >= 12; i--) {
      iv[i] = n & 0xff;
      n = Math.floor(n / 256);
    }
    return iv;
  },

  async decryptSegment(data, key, segment, keyCache, signal) {
    if (!key) return data;
    if (key.method !== 'AES-128') {
      throw new Error(`Unsupported encryption method ${key.method} (DRM protected stream)`);
    }
    if (!key.uri) throw new Error('Encrypted segment without key URI');

    // Cache the import promise so concurrent segments share one key fetch
    let keyPromise = keyCache.get(key.uri);
    if (!keyPromise) {
      keyPromise = (async () => {
        const keyBytes = await this.fetchBytes(key.uri, null, signal);
        if (keyBytes.length !== 16) throw new Error('Invalid AES-128 key length');
        return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
      })();
      keyCache.set(key.uri, keyPromise);
    }
    const cryptoKey = await keyPromise;
    const iv = key.iv ? this.hexToBytes(key.iv) : this.sequenceToIv(segment.sequence);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
    return new Uint8Array(plain);
  },

  // ---------- Main entry ----------

  // options: { url, quality, signal, onProgress, concurrency, liveMaxSeconds }
  // resolves { blob, container: 'ts'|'mp4', mimeType, segments, bytes, variant, live }
  async download(options) {
    const signal = options.signal;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const concurrency = Math.max(1, options.concurrency || this.DEFAULT_CONCURRENCY);

    let playlistUrl = options.url;
    let text = await this.fetchText(playlistUrl, signal);
    let playlist = this.parsePlaylist(text, playlistUrl);
    let variant = null;

    if (playlist.type === 'master') {
      variant = this.selectVariant(playlist.variants, options.quality);
      if (!variant) throw new Error('Master playlist has no variants');
      playlistUrl = variant.url;
      text = await this.fetchText(playlistUrl, signal);
      playlist = this.parsePlaylist(text, playlistUrl);
      if (playlist.type === 'master') throw new Error('Nested master playlists are not supported');
    }

    if (playlist.segments.length === 0) throw new Error('Playlist contains no segments');

    const keyCache = new Map();
    const chunks = [];
    let totalBytes = 0;
    let lastMapUrl = null;
    const startTime = Date.now();

    const pushMapIfNeeded = async (segment) => {
      if (segment.map && segment.map.url !== lastMapUrl) {
        const init = await this.fetchBytes(segment.map.url, segment.map.byteRange, signal);
        chunks.push(init);
        totalBytes += init.length;
        lastMapUrl = segment.map.url;
      }
    };

    const report = (done, total, live) => {
      const elapsed = Math.max(0.001, (Date.now() - startTime) / 1000);
      onProgress({
        segmentsDone: done,
        segmentsTotal: total,
        bytes: totalBytes,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
        speed: totalBytes / elapsed,
        live: !!live
      });
    };

    // Download a list of segments with bounded concurrency, appending in order
    const downloadSegments = async (segments, progressBase, progressTotal, live) => {
      let nextIndex = 0;
      let appended = 0;
      const results = new Array(segments.length);
      const pending = new Set();

      // Only one worker appends at a time; others return and the final call drains the rest
      let appending = false;
      const appendReady = async () => {
        if (appending) return;
        appending = true;
        try {
          while (appended < segments.length && results[appended] !== undefined && results[appended] !== null) {
            const seg = segments[appended];
            const data = results[appended];
            await pushMapIfNeeded(seg);
            chunks.push(data);
            totalBytes += data.length;
            results[appended] = null;
            appended++;
            report(progressBase + appended, progressTotal, live);
          }
        } finally {
          appending = false;
        }
      };

      const worker = async () => {
        while (nextIndex < segments.length) {
          if (signal && signal.aborted) throw new DOMException('Download cancelled', 'AbortError');
          const idx = nextIndex++;
          const seg = segments[idx];
          let data = await this.fetchBytes(seg.url, seg.byteRange, signal);
          data = await this.decryptSegment(data, seg.key, seg, keyCache, signal);
          results[idx] = data;
          await appendReady();
        }
      };

      for (let i = 0; i < Math.min(concurrency, segments.length); i++) {
        pending.add(worker());
      }
      await Promise.all(pending);
      // Drain anything a worker skipped while another was appending
      while (appended < segments.length) {
        await appendReady();
        if (appended < segments.length && results[appended] == null) throw new Error('Segment assembly stalled');
      }
    };

    const isLive = !playlist.endList;

    if (!isLive) {
      report(0, playlist.segments.length, false);
      await downloadSegments(playlist.segments, 0, playlist.segments.length, false);
    } else {
      // Live: keep polling the playlist and appending new segments until cancelled or time cap
      const maxSeconds = options.liveMaxSeconds || this.LIVE_MAX_SECONDS;
      const seen = new Set();
      let done = 0;
      let recordedSeconds = 0;
      let current = playlist;

      while (true) {
        const fresh = current.segments.filter(s => !seen.has(s.sequence));
        fresh.forEach(s => seen.add(s.sequence));
        if (fresh.length > 0) {
          await downloadSegments(fresh, done, done + fresh.length, true);
          done += fresh.length;
          recordedSeconds += fresh.reduce((a, s) => a + (s.duration || 0), 0);
        }
        if (current.endList || recordedSeconds >= maxSeconds) break;
        if (signal && signal.aborted) break;

        const waitMs = Math.max(1000, Math.min(10000, (current.targetDuration || 4) * 1000 * 0.75));
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, waitMs);
          if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
        if (signal && signal.aborted) break;

        try {
          const refreshed = await this.fetchText(playlistUrl, signal);
          current = this.parsePlaylist(refreshed, playlistUrl);
        } catch (err) {
          if (err.name === 'AbortError') break;
          // Transient playlist fetch failure: keep what we have and retry
          console.warn('Live playlist refresh failed:', err.message);
        }
      }
      if (chunks.length === 0) throw new Error('No live segments were captured');
    }

    const container = playlist.isFmp4 ? 'mp4' : (this.looksLikeAudioOnly(playlist) ? 'aac' : 'ts');
    const mimeType = container === 'mp4' ? 'video/mp4' : container === 'aac' ? 'audio/aac' : 'video/mp2t';
    const blob = new Blob(chunks, { type: mimeType });

    return {
      blob,
      container,
      mimeType,
      segments: chunks.length,
      bytes: totalBytes,
      variant,
      live: isLive
    };
  },

  looksLikeAudioOnly(playlist) {
    const first = playlist.segments[0] && playlist.segments[0].url.split('?')[0].toLowerCase();
    return !!first && (first.endsWith('.aac') || first.endsWith('.mp3'));
  },

  // True when this context can create object URLs for the browser downloads API
  canRunHere() {
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HlsDownloader;
}
