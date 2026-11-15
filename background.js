// Import scripts for MV3 service worker compatibility
if (typeof importScripts === 'function') {
  // BACKGROUND_SCRIPTS must match manifest.json "background.scripts" (minus background.js).
  // build.js verifies this so Chrome never silently misses a module.
  const BACKGROUND_SCRIPTS = [
    'browser-polyfill.js', 'error-handler.js', 'storage-manager.js', 'manifest-parser.js',
    'hls-downloader.js', 'download-manager.js', 'stream-recorder.js', 'batch-controller.js',
    'metadata-extractor.js', 'analytics-engine.js', 'quality-analyzer.js'
  ];
  importScripts(...BACKGROUND_SCRIPTS);
}

// Store detected streaming URLs (session storage)
let detectedStreams = {};

// Detection enabled state
let detectionEnabled = true;

// Badge/action API: browserAction in MV2 (Firefox), action in MV3 (Chrome/Edge)
const actionApi = browser.browserAction || browser.action;

// Referer tracking: maps a stream host to the frame/page URL that loaded it.
// Many CDNs only serve HLS/DASH when the request carries the embedding page as
// Referer/Origin (hotlink protection). Requests made by the extension itself
// (popup preview, player tab, validation, manifest parsing) are rewritten to
// carry that referer so they are accepted like the original player's requests.
const streamReferers = {};
const MAX_REFERER_HOSTS = 200;

// Content types that identify a stream manifest even when the URL has no extension
const STREAM_CONTENT_TYPES = [
  { match: /application\/vnd\.apple\.mpegurl|application\/x-mpegurl|audio\/mpegurl|audio\/x-mpegurl|application\/mpegurl/i, type: 'm3u8', name: 'HLS (M3U8)' },
  { match: /application\/dash\+xml/i, type: 'mpd', name: 'MPEG-DASH' },
  { match: /application\/vnd\.ms-sstr\+xml/i, type: 'ism', name: 'Smooth Streaming (ISM)' }
];

// Direct (progressive) video/audio files detected by Content-Type when large enough
const DIRECT_VIDEO_CONTENT_TYPES = [
  { match: /^video\/mp4/i, type: 'mp4', name: 'MP4 Video' },
  { match: /^video\/webm/i, type: 'webm', name: 'WebM Video' },
  { match: /^video\/x-matroska/i, type: 'mkv', name: 'MKV Video' },
  { match: /^video\/quicktime/i, type: 'mp4', name: 'QuickTime Video' },
  { match: /^video\/x-flv/i, type: 'flv', name: 'FLV Video' },
  { match: /^audio\/(mpeg|mp4|aac|x-m4a)/i, type: 'audio', name: 'Audio File' }
];
const DIRECT_VIDEO_MIN_BYTES = 1024 * 1024; // ignore tiny clips, thumbnails, ads

// Request headers worth capturing from the page's own stream requests so downloads,
// VLC and the preview can reproduce them (cookies, auth tokens, custom CDN headers).
const CAPTURE_HEADER_NAMES = ['cookie', 'authorization', 'user-agent', 'origin', 'referer'];
const CAPTURE_HEADER_PREFIXES = ['x-'];
const streamHeaders = {}; // host -> { headerName: value }

// Segment-only detection: some players never expose a playlist URL to the network
// (inline/blob playlists), only .ts/.m4s segments. Track bursts per tab+directory.
const SEGMENT_PATTERN = /\.(ts|m4s|m4v|m4a|aac|cmfv|cmfa)(\?|$)/i;
const SEGMENT_BURST_THRESHOLD = 3;
const PLAYLIST_GUESSES = ['index.m3u8', 'playlist.m3u8', 'master.m3u8', 'chunklist.m3u8', 'prog_index.m3u8', 'stream.m3u8', 'video.m3u8'];
const segmentTracker = {}; // tabId -> { dirUrl: { count, sample: [], probed } }

// ---------- Session state persistence (service worker survival) ----------
// Chrome MV3 kills the worker after ~30s idle; everything in memory is lost. Mirror the
// per-tab state to storage.session (storage.local fallback) and restore on wake.
const SESSION_STATE_KEY = 'ssSessionState';
const sessionStore = (browser.storage && browser.storage.session) ? browser.storage.session : browser.storage.local;
let persistTimer = null;
let stateRestored = false;

function persistState() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      await sessionStore.set({
        [SESSION_STATE_KEY]: {
          detectedStreams,
          streamReferers,
          streamHeaders,
          savedAt: Date.now()
        }
      });
    } catch (err) {
      console.warn('Failed to persist session state:', err);
    }
  }, 300);
}

async function restoreState() {
  if (stateRestored) return;
  stateRestored = true;
  try {
    const result = await sessionStore.get(SESSION_STATE_KEY);
    const saved = result[SESSION_STATE_KEY];
    if (!saved) return;

    // Drop tabs that no longer exist
    const openTabs = new Set((await browser.tabs.query({})).map(t => t.id));
    for (const [tabId, streams] of Object.entries(saved.detectedStreams || {})) {
      if (openTabs.has(Number(tabId)) && Array.isArray(streams) && streams.length) {
        if (!detectedStreams[tabId] || detectedStreams[tabId].length === 0) {
          detectedStreams[tabId] = streams;
        }
        updateBadge(Number(tabId));
      }
    }
    Object.assign(streamReferers, saved.streamReferers || {});
    Object.assign(streamHeaders, saved.streamHeaders || {});
    if (Object.keys(streamReferers).length) updateRefererRules();
    console.log('Session state restored:', Object.keys(detectedStreams).length, 'tabs');
  } catch (err) {
    console.warn('Failed to restore session state:', err);
  }
}
const stateReady = restoreState();

// Initialize detection state from storage
browser.storage.local.get('detectionEnabled').then(result => {
  detectionEnabled = result.detectionEnabled !== undefined ? result.detectionEnabled : true;
  console.log('Detection state initialized:', detectionEnabled);
});

// Streaming formats to detect
const STREAM_FORMATS = [
  // Traditional file extension patterns
  { pattern: /\.m3u8(\?|$)/i, type: 'm3u8', name: 'HLS (M3U8)' },
  { pattern: /\.m3u(\?|$)/i, type: 'm3u', name: 'M3U' },
  { pattern: /\.mpd(\?|$)/i, type: 'mpd', name: 'MPEG-DASH' },
  { pattern: /\.ism(\?|$)/i, type: 'ism', name: 'Smooth Streaming (ISM)' },
  { pattern: /\.ismc(\?|$)/i, type: 'ismc', name: 'Smooth Streaming (ISMC)' },

  // YouTube-specific patterns (manifest URLs)
  { pattern: /googlevideo\.com\/api\/manifest\/dash/i, type: 'mpd', name: 'YouTube DASH' },
  { pattern: /youtube\.com\/api\/manifest\/dash/i, type: 'mpd', name: 'YouTube DASH' },
  { pattern: /googlevideo\.com.*\/manifest\/hls_(playlist|variant)/i, type: 'm3u8', name: 'YouTube HLS' },
  { pattern: /youtube\.com.*\/manifest\/hls_(playlist|variant)/i, type: 'm3u8', name: 'YouTube HLS' }
];

// StorageManager is provided by storage-manager.js (loaded before this file).

// Cached general settings (kept fresh via storage.onChanged)
let settingsCache = null;
async function getSettingsCached() {
  if (!settingsCache) settingsCache = await StorageManager.getSettings();
  return settingsCache;
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) settingsCache = null;
});

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return 'unknown';
  }
}

// YouTube itag to quality mapping
const YOUTUBE_ITAG_QUALITY = {
  // Video itags (no audio)
  '137': '1080p', '136': '720p', '135': '480p', '134': '360p', '133': '240p', '160': '144p',
  '299': '1080p60', '298': '720p60', '302': '720p60 HDR', '303': '1080p60 HDR',
  '308': '1440p60', '315': '2160p60', '313': '2160p',
  '266': '2160p', '264': '1440p', '271': '1440p', '248': '1080p', '247': '720p', '244': '480p',

  // Combined video+audio (older formats)
  '22': '720p', '18': '360p', '43': '360p', '36': '240p', '17': '144p',
  '37': '1080p', '38': '3072p',

  // Audio-only itags
  '140': 'Audio 128k AAC', '141': 'Audio 256k AAC',
  '251': 'Audio 160k Opus', '250': 'Audio 70k Opus', '249': 'Audio 50k Opus',
  '171': 'Audio 128k Vorbis', '172': 'Audio 192k Vorbis',

  // VP9 video
  '337': '2160p60 VP9', '336': '1440p60 VP9', '335': '1080p60 VP9', '334': '720p60 VP9',
  '272': '2160p VP9', '271': '1440p VP9', '248': '1080p VP9', '247': '720p VP9',
  '244': '480p VP9', '243': '360p VP9', '242': '240p VP9', '278': '144p VP9'
};

// Get YouTube video ID from URL
function getYouTubeVideoId(url) {
  try {
    const urlObj = new URL(url);
    // YouTube video ID is usually in 'id' parameter for videoplayback URLs
    const videoId = urlObj.searchParams.get('id');
    if (videoId) return videoId;

    // Fallback: try 'v' parameter
    const vParam = urlObj.searchParams.get('v');
    if (vParam) return vParam;

    // Extract from path if present
    const pathMatch = urlObj.pathname.match(/\/watch\?v=([^&]+)/);
    if (pathMatch) return pathMatch[1];

    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

// Get quality from YouTube itag parameter
function getQualityFromItag(url) {
  try {
    const urlObj = new URL(url);
    const itag = urlObj.searchParams.get('itag');

    if (itag && YOUTUBE_ITAG_QUALITY[itag]) {
      return YOUTUBE_ITAG_QUALITY[itag];
    }

    return itag ? `itag ${itag}` : 'Unknown Quality';
  } catch (e) {
    return 'Unknown Quality';
  }
}

// Check if URL is a YouTube stream
function isYouTubeStream(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // Check for YouTube/Google Video domains
    const isYouTubeDomain =
      hostname.includes('googlevideo.com') ||
      hostname.includes('youtube.com') ||
      hostname.includes('yt3.ggpht.com');

    if (!isYouTubeDomain) return false;

    // Check for video playback URLs (what YouTube actually uses)
    if (pathname.includes('/videoplayback')) {
      // Only accept if it has video mime type (not thumbnails or other assets)
      const hasVideoMime = url.includes('mime=video') || url.includes('mime=audio');
      const hasItag = url.includes('itag=');
      return hasVideoMime || hasItag;
    }

    // Check for manifest paths (rare but keep for compatibility)
    const isManifest =
      pathname.includes('/manifest/dash') ||
      pathname.includes('/manifest/hls_playlist') ||
      pathname.includes('/manifest/hls_variant') ||
      pathname.includes('/api/manifest/');

    return isManifest;
  } catch (e) {
    return false;
  }
}

// Normalize YouTube URLs by removing dynamic parameters
function normalizeYouTubeURL(url) {
  if (!isYouTubeStream(url)) return url;

  try {
    const urlObj = new URL(url);
    // Remove timestamp parameters that change frequently
    urlObj.searchParams.delete('expire');
    urlObj.searchParams.delete('ei');
    urlObj.searchParams.delete('key');
    urlObj.searchParams.delete('signature');
    urlObj.searchParams.delete('sig');

    return urlObj.origin + urlObj.pathname + '?' + urlObj.searchParams.toString();
  } catch (e) {
    return url;
  }
}

// Determine stream type from URL
function getStreamType(url) {
  // Check YouTube patterns first (priority detection)
  if (isYouTubeStream(url)) {
    // Video playback URLs (actual video segments)
    if (url.includes('/videoplayback')) {
      const quality = getQualityFromItag(url);
      const isAudio = quality.toLowerCase().includes('audio');

      return {
        type: isAudio ? 'youtube-audio' : 'youtube-video',
        name: isAudio ? `YouTube Audio` : `YouTube Video`,
        quality: quality
      };
    }

    // Manifest URLs (rare)
    if (url.includes('/manifest/dash') || url.includes('/dash/')) {
      return { type: 'mpd', name: 'YouTube DASH' };
    }
    if (url.includes('/manifest/hls') || url.includes('/hls_')) {
      return { type: 'm3u8', name: 'YouTube HLS' };
    }
  }

  // Then check traditional file extension patterns
  for (const format of STREAM_FORMATS) {
    if (format.pattern.test(url)) {
      return { type: format.type, name: format.name };
    }
  }
  return { type: 'unknown', name: 'Unknown' };
}

// Validate stream URL accessibility
async function validateStreamURL(url) {
  // Skip validation for YouTube streams - they require authentication
  const isYouTube = url.includes('googlevideo.com') && url.includes('/videoplayback');
  if (isYouTube) {
    return {
      valid: true,
      status: 'youtube',
      statusText: 'YouTube (authenticated)'
    };
  }

  try {
    const response = await fetch(url, { method: 'HEAD' });
    return {
      valid: response.ok,
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

// Get the URL of the document (frame) that issued a request
function getFrameUrl(details) {
  // Firefox: documentUrl = the frame's document, originUrl = the request origin
  // Chrome: initiator = origin of the frame that made the request
  return details.documentUrl || details.originUrl || details.initiator || '';
}

function isExtensionUrl(url) {
  return typeof url === 'string' && (url.startsWith('moz-extension://') || url.startsWith('chrome-extension://'));
}

function extractHost(url) {
  try {
    return new URL(url).host;
  } catch (e) {
    return '';
  }
}

// Remember which page/frame loaded a stream host so our own requests can mimic it
function rememberReferer(streamUrl, frameUrl) {
  if (!frameUrl || isExtensionUrl(frameUrl)) return;
  const host = extractHost(streamUrl);
  if (!host) return;

  // Keep the map bounded
  const hosts = Object.keys(streamReferers);
  if (!streamReferers[host] && hosts.length >= MAX_REFERER_HOSTS) {
    delete streamReferers[hosts[0]];
  }

  if (streamReferers[host] !== frameUrl) {
    streamReferers[host] = frameUrl;
    updateRefererRules();
    persistState();
  }
}

function getRefererForUrl(url) {
  const host = extractHost(url);
  return host ? streamReferers[host] : undefined;
}

// Capture headers from the page's own request to a stream host
function captureHeaders(details) {
  const host = extractHost(details.url);
  if (!host || !details.requestHeaders) return;
  const captured = streamHeaders[host] || {};
  let changed = false;
  for (const h of details.requestHeaders) {
    const name = h.name.toLowerCase();
    const wanted = CAPTURE_HEADER_NAMES.includes(name) || CAPTURE_HEADER_PREFIXES.some(p => name.startsWith(p));
    if (!wanted || !h.value) continue;
    if (captured[name] !== h.value) {
      captured[name] = h.value;
      changed = true;
    }
  }
  if (changed) {
    streamHeaders[host] = captured;
    // Attach to any detected stream objects for this host so the popup can show/copy them
    const tabStreams = detectedStreams[details.tabId] || [];
    for (const st of tabStreams) {
      if (extractHost(st.url) === host) st.headers = { ...captured };
    }
    persistState();
    updateRefererRules();
  }
}

// Headers (beyond Referer/Origin) that extension requests should replay for a host
function getReplayHeaders(host) {
  const captured = streamHeaders[host];
  if (!captured) return [];
  const out = [];
  for (const [name, value] of Object.entries(captured)) {
    if (name === 'referer' || name === 'origin' || name === 'user-agent') continue;
    out.push({ name, value });
  }
  return out;
}

// Everything another component needs to reproduce the page's request for a stream URL
function getStreamContext(url) {
  const host = extractHost(url);
  const captured = (host && streamHeaders[host]) || {};
  const referer = (host && streamReferers[host]) || captured.referer || '';
  let origin = captured.origin || '';
  if (!origin && referer) {
    try { origin = new URL(referer).origin; } catch (e) { /* ignore */ }
  }
  const headers = {};
  for (const [name, value] of Object.entries(captured)) {
    if (name === 'referer' || name === 'origin' || name === 'user-agent') continue;
    headers[name] = value;
  }
  return {
    referer,
    origin,
    userAgent: captured['user-agent'] || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    headers
  };
}

// Chrome/Edge MV3: use declarativeNetRequest session rules to set Referer/Origin
// on requests made by the extension to known stream hosts.
const REFERER_RULE_BASE_ID = 10000;
let refererRulesUpdating = false;
let refererRulesDirty = false;

async function updateRefererRules() {
  if (!browser.declarativeNetRequest || !browser.declarativeNetRequest.updateSessionRules) return;
  if (refererRulesUpdating) {
    refererRulesDirty = true;
    return;
  }
  refererRulesUpdating = true;

  try {
    const existing = await browser.declarativeNetRequest.getSessionRules();
    const removeRuleIds = existing
      .map(r => r.id)
      .filter(id => id >= REFERER_RULE_BASE_ID && id < REFERER_RULE_BASE_ID + MAX_REFERER_HOSTS * 2);

    const addRules = [];
    let id = REFERER_RULE_BASE_ID;
    const resourceTypes = ['xmlhttprequest', 'media', 'other', 'image', 'script', 'object'];

    for (const [host, frameUrl] of Object.entries(streamReferers)) {
      let origin;
      try {
        origin = new URL(frameUrl).origin;
      } catch (e) {
        continue;
      }
      const requestHeaders = [
        { header: 'Referer', operation: 'set', value: frameUrl },
        { header: 'Origin', operation: 'set', value: origin }
      ];
      for (const h of getReplayHeaders(host)) {
        requestHeaders.push({ header: h.name, operation: 'set', value: h.value });
      }
      const action = { type: 'modifyHeaders', requestHeaders };
      // Requests from extension pages (initiator = chrome-extension://<id>)
      addRules.push({
        id: id++,
        priority: 1,
        action,
        condition: { urlFilter: '||' + host + '/', initiatorDomains: [browser.runtime.id], resourceTypes }
      });
      // Requests not associated with a tab (popup, service worker fetch)
      addRules.push({
        id: id++,
        priority: 1,
        action,
        condition: { urlFilter: '||' + host + '/', tabIds: [-1], resourceTypes }
      });
    }

    await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds, addRules });
  } catch (err) {
    console.error('Failed to update referer rules:', err);
  } finally {
    refererRulesUpdating = false;
    if (refererRulesDirty) {
      refererRulesDirty = false;
      updateRefererRules();
    }
  }
}

// Firefox MV2: rewrite headers on the extension's own requests with blocking webRequest
function setupRefererRewriting() {
  if (browser.declarativeNetRequest && browser.declarativeNetRequest.updateSessionRules) {
    // MV3: rewriting handled by updateRefererRules(); still observe page headers for capture
    if (browser.webRequest && browser.webRequest.onBeforeSendHeaders) {
      const extra = ['requestHeaders'];
      // Chrome hides Cookie/Authorization unless extraHeaders is requested
      if (browser.webRequest.OnBeforeSendHeadersOptions && browser.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS) {
        extra.push('extraHeaders');
      }
      try {
        browser.webRequest.onBeforeSendHeaders.addListener(
          function(details) {
            if (details.tabId < 0) return;
            if (isExtensionUrl(details.initiator) || isExtensionUrl(details.documentUrl)) return;
            if (settingsCache && settingsCache.captureHeaders === false) return;
            if (streamReferers[extractHost(details.url)]) captureHeaders(details);
          },
          { urls: ['<all_urls>'] },
          extra
        );
      } catch (err) {
        console.warn('Header capture unavailable:', err);
      }
    }
    return;
  }
  if (!browser.webRequest || !browser.webRequest.onBeforeSendHeaders) return;

  try {
    browser.webRequest.onBeforeSendHeaders.addListener(
      function(details) {
        const fromExtension = isExtensionUrl(details.originUrl) || isExtensionUrl(details.documentUrl) ||
          (details.tabId === -1 && !details.documentUrl);

        // Page request to a known stream host: learn its headers
        if (!fromExtension) {
          if (details.tabId >= 0 && settingsCache && settingsCache.captureHeaders !== false && streamReferers[extractHost(details.url)]) {
            captureHeaders(details);
          }
          return;
        }

        const referer = getRefererForUrl(details.url);
        if (!referer) return;

        let origin;
        try {
          origin = new URL(referer).origin;
        } catch (e) {
          return;
        }

        const replay = getReplayHeaders(extractHost(details.url));
        const replayNames = new Set(replay.map(h => h.name));
        const headers = (details.requestHeaders || []).filter(h => {
          const name = h.name.toLowerCase();
          return name !== 'referer' && name !== 'origin' && !replayNames.has(name);
        });
        headers.push({ name: 'Referer', value: referer });
        headers.push({ name: 'Origin', value: origin });
        for (const h of replay) headers.push({ name: h.name, value: h.value });
        return { requestHeaders: headers };
      },
      { urls: ['<all_urls>'] },
      ['blocking', 'requestHeaders']
    );
    console.log('Referer rewriting enabled (webRequest blocking)');
  } catch (err) {
    console.error('Could not enable referer rewriting:', err);
  }
}
setupRefererRewriting();

// Shared handler for a request identified as a stream (by URL pattern or by Content-Type)
function handleDetectedStream(details, streamInfo) {
  const url = details.url;
  const tabId = details.tabId;

  if (streamInfo.type === 'unknown' || tabId < 0) return;

  const frameUrl = getFrameUrl(details);
  rememberReferer(url, frameUrl);

  // Initialize array if needed
  if (!detectedStreams[tabId]) {
    detectedStreams[tabId] = [];
  }

  // Special handling for YouTube videos to prevent spam
  if (streamInfo.type === 'youtube-video' || streamInfo.type === 'youtube-audio') {
    const videoId = getYouTubeVideoId(url);

    // Check if we already have a stream for this YouTube video
    const existingIndex = detectedStreams[tabId].findIndex(s =>
      (s.type === 'youtube-video' || s.type === 'youtube-audio') &&
      s.videoId === videoId
    );

    if (existingIndex !== -1) {
      // Already have this video - only update if this is higher quality
      const existing = detectedStreams[tabId][existingIndex];
      const existingQuality = existing.quality || '';
      const newQuality = streamInfo.quality || '';

      // Simple quality comparison (prefer higher resolution numbers)
      const existingNum = parseInt(existingQuality.match(/\d+/)?.[0] || '0');
      const newNum = parseInt(newQuality.match(/\d+/)?.[0] || '0');

      if (newNum > existingNum) {
        // Update with higher quality
        detectedStreams[tabId][existingIndex].url = url;
        detectedStreams[tabId][existingIndex].quality = newQuality;
        console.log(`Updated YouTube video ${videoId} to ${newQuality}`);
      }
      return; // Skip adding duplicate
    }
  }

  // Check if already detected in current session (normalize YouTube URLs for comparison)
  const normalizedUrl = normalizeYouTubeURL(url);
  const alreadyDetected = detectedStreams[tabId].some(s =>
    normalizeYouTubeURL(s.url) === normalizedUrl
  );

  if (alreadyDetected) return;

  console.log(`${streamInfo.name} stream detected:`, url, frameUrl ? `(frame: ${frameUrl})` : '');

  // Create basic stream data immediately
  const streamData = {
    url: url,
    type: streamInfo.type,
    typeName: streamInfo.name,
    domain: extractDomain(url),
    pageUrl: '',
    pageTitle: '',
    frameUrl: frameUrl,
    timestamp: Date.now(),
    quality: streamInfo.quality || '',
    inferred: !!streamInfo.inferred,
    size: streamInfo.size || 0,
    headers: streamHeaders[extractHost(url)] ? { ...streamHeaders[extractHost(url)] } : undefined,
    videoId: (streamInfo.type === 'youtube-video' || streamInfo.type === 'youtube-audio') ? getYouTubeVideoId(url) : undefined
  };

  detectedStreams[tabId].push(streamData);
  persistState();

  // Update badge immediately
  updateBadge(tabId);

  // Auto-validate stream immediately (non-blocking)
  validateStreamURL(url).then(validationResult => {
    streamData.validationStatus = validationResult.status;
    streamData.validationValid = validationResult.valid;
    streamData.validationError = validationResult.error;
    streamData.validationStatusText = validationResult.statusText;
  }).catch(err => {
    console.error('Error validating stream:', err);
  });

  // Get tab info and save asynchronously (non-blocking)
  browser.tabs.get(tabId).then(async (tab) => {
    // Update with page info
    streamData.pageUrl = tab.url || frameUrl;
    streamData.pageTitle = tab.title;

    // Extract metadata if available
    try {
      if (typeof MetadataExtractor !== 'undefined') {
        const enriched = await MetadataExtractor.enrichStreamData(streamData, tabId);
        // Merge enriched data
        Object.assign(streamData, enriched);
      }
    } catch (metaError) {
      console.log('Metadata extraction failed (non-critical):', metaError);
    }

    // Save to persistent storage (unless history is disabled in settings)
    const generalSettings = await getSettingsCached();
    if (generalSettings.saveToHistory !== false) {
      await StorageManager.saveStream(streamData);
    }
    persistState();

    // Track stream detection in analytics
    if (typeof AnalyticsEngine !== 'undefined') {
      AnalyticsEngine.trackStreamDetection(streamData).catch(err => {
        console.log('Analytics tracking failed (non-critical):', err);
      });
    }

    // Show notification if enabled
    if (generalSettings.notifications) {
      showNotification(streamInfo.name, url, tab.title);
    }
  }).catch(err => {
    console.error('Error getting tab info:', err);
  });
}

// Listen for web requests: detect streams by URL pattern
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Skip if detection is disabled
    if (!detectionEnabled) {
      return;
    }

    const streamInfo = getStreamType(details.url);
    if (streamInfo.type !== 'unknown') {
      handleDetectedStream(details, streamInfo);
      return;
    }

    // Segment-only streams: count media segments per directory
    if (details.tabId >= 0 && SEGMENT_PATTERN.test(details.url) && !isExtensionUrl(getFrameUrl(details))) {
      trackSegment(details);
    }
  },
  {urls: ["<all_urls>"]}
);

// ---------- Segment-only detection ----------
function segmentDirectory(url) {
  try {
    const u = new URL(url);
    const dir = u.pathname.substring(0, u.pathname.lastIndexOf('/') + 1);
    return u.origin + dir;
  } catch (e) {
    return '';
  }
}

function trackSegment(details) {
  if (settingsCache && settingsCache.detectSegments === false) return;
  const tabId = details.tabId;
  const dir = segmentDirectory(details.url);
  if (!dir) return;

  // If a playlist on this host was already detected, nothing to infer
  const host = extractHost(details.url);
  const tabStreams = detectedStreams[tabId] || [];
  if (tabStreams.some(s => extractHost(s.url) === host && (s.type === 'm3u8' || s.type === 'mpd'))) return;

  if (!segmentTracker[tabId]) segmentTracker[tabId] = {};
  const entry = segmentTracker[tabId][dir] || { count: 0, sample: [], probed: false };
  entry.count++;
  if (entry.sample.length < 3) entry.sample.push(details.url);
  segmentTracker[tabId][dir] = entry;

  if (entry.count >= SEGMENT_BURST_THRESHOLD && !entry.probed) {
    entry.probed = true;
    rememberReferer(details.url, getFrameUrl(details));
    probeForPlaylist(details, dir, entry.sample);
  }
}

// Try common playlist names in the segment directory and its parent; otherwise record the segment base
async function probeForPlaylist(details, dir, sample) {
  const candidates = [];
  const dirs = [dir];
  try {
    const parent = new URL('..', dir).href;
    if (parent !== dir) dirs.push(parent);
  } catch (e) { /* ignore */ }
  for (const d of dirs) for (const name of PLAYLIST_GUESSES) candidates.push(d + name);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { method: 'GET', cache: 'no-store', credentials: 'include' });
      if (!response.ok) continue;
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      const text = await response.text();
      if (ct.includes('mpegurl') || text.trim().startsWith('#EXTM3U')) {
        handleDetectedStream({ ...details, url: candidate }, { type: 'm3u8', name: 'HLS (M3U8, recovered)', inferred: true });
        return;
      }
    } catch (e) {
      // try next
    }
  }

  // No playlist found: expose the segment directory so the user at least knows a stream is there
  handleDetectedStream({ ...details, url: dir }, {
    type: 'hls-segments',
    name: 'HLS Segments (playlist not captured)',
    inferred: true,
    sample
  });
}

// Detect streams by response Content-Type (catches extensionless/tokenized playlist URLs)
if (browser.webRequest && browser.webRequest.onHeadersReceived) {
  browser.webRequest.onHeadersReceived.addListener(
    function(details) {
      if (!detectionEnabled || details.tabId < 0) return;
      if (isExtensionUrl(getFrameUrl(details))) return;

      // Already handled by URL pattern matching
      if (getStreamType(details.url).type !== 'unknown') return;

      const headerMap = {};
      for (const h of details.responseHeaders || []) headerMap[h.name.toLowerCase()] = h.value;
      const contentType = headerMap['content-type'];
      if (!contentType) return;

      for (const ct of STREAM_CONTENT_TYPES) {
        if (ct.match.test(contentType)) {
          handleDetectedStream(details, { type: ct.type, name: ct.name });
          return;
        }
      }

      // Direct progressive video/audio files
      if (settingsCache && settingsCache.detectDirectVideo === false) return;
      if (SEGMENT_PATTERN.test(details.url)) return;
      for (const ct of DIRECT_VIDEO_CONTENT_TYPES) {
        if (!ct.match.test(contentType)) continue;
        // Size: Content-Range total (range requests) or Content-Length
        let size = 0;
        const range = headerMap['content-range'];
        if (range) {
          const m = range.match(/\/(\d+)\s*$/);
          if (m) size = parseInt(m[1], 10);
        }
        if (!size && headerMap['content-length']) size = parseInt(headerMap['content-length'], 10) || 0;
        if (size && size < DIRECT_VIDEO_MIN_BYTES) return;
        if (!size && details.type !== 'media') return; // unknown size and not a <video> load: skip

        // Normalise: drop range-style query params so repeated chunk requests dedupe
        handleDetectedStream(details, { type: ct.type, name: ct.name, size });
        return;
      }
    },
    {urls: ["<all_urls>"]},
    ['responseHeaders']
  );
}


// ========== PLAY IN VLC ==========

// Launch VLC through the native messaging host (ytdlp-bridge.py). Resolves with
// { success, error } and never rejects. Falls back to playlist download if the
// native host is not installed.
function launchVlcNative(url, referer, userAgent) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch (e) { /* ignore */ }
      resolve(result);
    };

    let port;
    try {
      port = browser.runtime.connectNative('com.streamsniper.ytdlp');
    } catch (error) {
      resolve({ success: false, error: error.message });
      return;
    }

    const timer = setTimeout(() => finish({ success: false, error: 'Native host timed out' }), 8000);

    port.onMessage.addListener((message) => {
      if (message.type === 'vlcLaunched') {
        finish({ success: true });
      } else if (message.type === 'error' || message.error) {
        finish({ success: false, error: message.error || 'Native host error' });
      }
    });

    port.onDisconnect.addListener(() => {
      const err = browser.runtime.lastError ? browser.runtime.lastError.message : 'Native host disconnected';
      finish({ success: false, error: err });
    });

    port.postMessage({ type: 'playInVlc', url, referer: referer || '', userAgent: userAgent || '' });
  });
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build an XSPF playlist VLC can open directly. vlc:option entries carry the
// referer and user agent so hotlink-protected streams play outside the browser.
function buildVlcPlaylist(url, referer, userAgent, title) {
  const options = [];
  if (referer) options.push(`http-referrer=${referer}`);
  if (userAgent) options.push(`http-user-agent=${userAgent}`);
  options.push('network-caching=3000');

  const optionXml = options.map(o => `        <vlc:option>${escapeXml(o)}</vlc:option>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<playlist xmlns="http://xspf.org/ns/0/" xmlns:vlc="http://www.videolan.org/vlc/playlist/ns/0/" version="1">
  <title>${escapeXml(title || 'Stream Sniper')}</title>
  <trackList>
    <track>
      <location>${escapeXml(url)}</location>
      <title>${escapeXml(title || 'Stream')}</title>
      <extension application="http://www.videolan.org/vlc/playlist/0">
        <vlc:id>0</vlc:id>
${optionXml}
      </extension>
    </track>
  </trackList>
</playlist>
`;
}

function safeFilename(text) {
  return String(text || 'stream')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'stream';
}

// Wait for a download to reach a final state
function waitForDownload(downloadId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const cleanup = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      resolve(result);
    };
    const listener = (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete') cleanup({ complete: true });
      else if (delta.state.current === 'interrupted') cleanup({ complete: false, error: 'Download interrupted' });
    };
    browser.downloads.onChanged.addListener(listener);
    const timer = setTimeout(() => cleanup({ complete: false, error: 'Download timed out' }), timeoutMs);

    // The download may already be finished
    browser.downloads.search({ id: downloadId }).then(items => {
      if (items && items[0] && items[0].state === 'complete') cleanup({ complete: true });
    }).catch(() => {});
  });
}

// Fallback: save an .xspf playlist and ask the browser to open it with the default app (VLC)
async function downloadVlcPlaylist(url, referer, userAgent, title) {
  const xml = buildVlcPlaylist(url, referer, userAgent, title);
  const filename = `StreamSniper/${safeFilename(title)}.xspf`;

  // Firefox rejects data: URLs in downloads.download ("Access denied"), so use a
  // blob URL where the context can create one (Firefox background page). Chrome's
  // service worker cannot create blob URLs but does accept data: URLs.
  let blobUrl = null;
  let playlistUrl;
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    blobUrl = URL.createObjectURL(new Blob([xml], { type: 'application/xspf+xml' }));
    playlistUrl = blobUrl;
  } else {
    playlistUrl = 'data:application/xspf+xml;charset=utf-8,' + encodeURIComponent(xml);
  }

  let downloadId;
  let status;
  try {
    downloadId = await browser.downloads.download({
      url: playlistUrl,
      filename,
      conflictAction: 'overwrite',
      saveAs: false
    });
    status = await waitForDownload(downloadId, 15000);
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }

  if (!status.complete) {
    return { success: false, downloadId, error: status.error };
  }

  let opened = false;
  let openError = null;
  if (browser.downloads.open) {
    try {
      await browser.downloads.open(downloadId);
      opened = true;
    } catch (error) {
      openError = error.message;
    }
  } else {
    openError = 'downloads.open not available';
  }

  // Report where the browser actually saved it (the download folder is user-configurable)
  let savedPath = null;
  try {
    const items = await browser.downloads.search({ id: downloadId });
    if (items && items[0] && items[0].filename) savedPath = items[0].filename;
  } catch (error) { /* fall back to the relative name */ }

  return { success: true, downloadId, opened, error: openError, filename, savedPath };
}

// Pick the most useful stream on a tab: playlists first, then largest direct file
function pickBestStream(streams) {
  if (!streams || streams.length === 0) return null;
  const rank = { m3u8: 0, mpd: 1, m3u: 2, ism: 3, ismc: 3, mp4: 4, webm: 5, mkv: 5, flv: 6, 'youtube-video': 7, audio: 8, 'hls-segments': 9 };
  return [...streams]
    .filter(s => s.type !== 'hls-segments')
    .sort((a, b) => ((rank[a.type] ?? 50) - (rank[b.type] ?? 50)) || ((b.size || 0) - (a.size || 0)) || (a.timestamp - b.timestamp))[0] || null;
}

async function playBestInVlc(tabId) {
  if (tabId === undefined || tabId === null) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0] && tabs[0].id;
  }
  const stream = pickBestStream(detectedStreams[tabId]);
  if (!stream) {
    browser.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'Stream Sniper', message: 'No stream detected on this page yet.' });
    return { success: false, error: 'No stream detected' };
  }
  const context = getStreamContext(stream.url);
  const native = await launchVlcNative(stream.url, stream.frameUrl || context.referer || stream.pageUrl || '', context.userAgent);
  if (native.success) return { success: true, method: 'native' };
  const playlist = await downloadVlcPlaylist(stream.url, stream.frameUrl || context.referer || '', context.userAgent, stream.pageTitle || stream.domain);
  if (!playlist.opened) {
    browser.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'Stream Sniper', message: `Playlist saved to Downloads/${playlist.filename || 'StreamSniper'}. Open it to play in VLC.` });
  }
  return { ...playlist, method: 'playlist' };
}

// Context menu: play the page's best stream, or a right-clicked stream link, in VLC
const menusApi = browser.contextMenus || browser.menus;
if (menusApi) {
  const createMenus = () => {
    try {
      menusApi.removeAll().then(() => {
        menusApi.create({ id: 'ss-play-best-vlc', title: 'Play detected stream in VLC', contexts: ['page', 'video', 'frame'] });
        menusApi.create({
          id: 'ss-play-link-vlc',
          title: 'Play link in VLC',
          contexts: ['link'],
          targetUrlPatterns: ['*://*/*.m3u8*', '*://*/*.mpd*', '*://*/*.mp4*', '*://*/*.webm*', '*://*/*.mkv*']
        });
      }).catch(() => {});
    } catch (err) {
      console.warn('Context menu setup failed:', err);
    }
  };
  browser.runtime.onInstalled.addListener(createMenus);
  if (browser.runtime.onStartup) browser.runtime.onStartup.addListener(createMenus);
  createMenus();

  menusApi.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'ss-play-best-vlc') {
      playBestInVlc(tab && tab.id).catch(err => console.error('Play in VLC failed:', err));
    } else if (info.menuItemId === 'ss-play-link-vlc' && info.linkUrl) {
      const ctx = getStreamContext(info.linkUrl);
      launchVlcNative(info.linkUrl, ctx.referer || (tab && tab.url) || '', ctx.userAgent).then(native => {
        if (!native.success) return downloadVlcPlaylist(info.linkUrl, ctx.referer || (tab && tab.url) || '', ctx.userAgent, (tab && tab.title) || 'Stream');
      }).catch(err => console.error('Play link in VLC failed:', err));
    }
  });
}

// Update badge with stream count
function updateBadge(tabId) {
  const count = detectedStreams[tabId] ? detectedStreams[tabId].length : 0;

  if (count > 0) {
    actionApi.setBadgeText({
      text: count.toString(),
      tabId: tabId
    });
    actionApi.setBadgeBackgroundColor({
      color: '#4a90e2',
      tabId: tabId
    });
  }
}

// Show notification
function showNotification(streamType, url, pageTitle) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Stream Detected',
    message: `${streamType} stream found on ${pageTitle || 'this page'}`
  });
}

// Clean up when tab is closed
browser.tabs.onRemoved.addListener(function(tabId) {
  delete detectedStreams[tabId];
  delete segmentTracker[tabId];
  persistState();
});

// Clean up when tab is updated (navigates to new page)
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading') {
    detectedStreams[tabId] = [];
    delete segmentTracker[tabId];
    persistState();
    actionApi.setBadgeText({
      text: '',
      tabId: tabId
    });
  }
});

// Reset session count on browser startup
browser.runtime.onStartup.addListener(async function() {
  await browser.storage.local.set({ sessionCount: 0 });
});

// Message handler for popup
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getStreams') {
    stateReady.then(() => browser.tabs.query({active: true, currentWindow: true})).then(tabs => {
      const tabId = tabs[0].id;
      const streams = detectedStreams[tabId] || [];
      sendResponse({streams: streams});
    }).catch(() => sendResponse({streams: []}));
    return true;
  }

  if (request.action === 'getStreamContext') {
    sendResponse(getStreamContext(request.url || ''));
    return;
  }

  if (request.action === 'playBestInVlc') {
    playBestInVlc(request.tabId).then(result => sendResponse(result)).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'clearStreams') {
    const tabId = request.tabId;
    detectedStreams[tabId] = [];
    actionApi.setBadgeText({
      text: '',
      tabId: tabId
    });
    sendResponse({success: true});
  }

  if (request.action === 'clearHistory') {
    browser.storage.local.set({ streamHistory: [] }).then(() => {
      sendResponse({success: true});
    });
    return true;
  }

  if (request.action === 'resetStats') {
    browser.storage.local.set({
      streamStats: { total: 0, byType: {}, byDomain: {} },
      sessionCount: 0
    }).then(() => {
      sendResponse({success: true});
    });
    return true;
  }

  if (request.action === 'validateStream') {
    // Validate if stream URL is accessible
    validateStreamURL(request.url)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({
          valid: false,
          error: error.message
        });
      });
    return true;
  }

  if (request.action === 'setDetection') {
    // Update detection state
    detectionEnabled = request.enabled;
    console.log('Detection state changed:', detectionEnabled);

    // Clear badges on all tabs when disabled
    if (!detectionEnabled) {
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          actionApi.setBadgeText({
            text: '',
            tabId: tab.id
          });
        });
      });
    }

    sendResponse({success: true});
  }

  // ========== DOWNLOAD HANDLERS ==========

  if (request.action === 'startDownload') {
    // Start downloading a stream
    (async () => {
      try {
        const { streamData, quality } = request;

        // If quality is not specified, try to get best quality using intelligent analysis
        let selectedQuality = quality;

        if (!selectedQuality && (streamData.type === 'm3u8' || streamData.type === 'mpd')) {
          // Use QualityAnalyzer for intelligent quality selection
          try {
            if (typeof QualityAnalyzer !== 'undefined') {
              const analysis = await QualityAnalyzer.analyzeStream(streamData);

              if (analysis.success && analysis.recommendation) {
                // Use recommended quality based on connection speed and compatibility
                selectedQuality = analysis.recommendation.quality;
                console.log('Auto-selected quality:', analysis.recommendation.reason);

                // Log warnings if any
                if (analysis.warnings && analysis.warnings.length > 0) {
                  console.log('Quality warnings:', analysis.warnings);
                }
              }
            } else {
              // Fallback to simple best quality selection
              const manifestData = await ManifestParser.parseManifest(streamData.url, streamData.type);
              if (manifestData && manifestData.qualities && manifestData.qualities.length > 0) {
                const sorted = manifestData.qualities.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
                selectedQuality = sorted[0];
              }
            }
          } catch (e) {
            console.log('Could not analyze quality for selection:', e);
          }
        }

        // Add to download queue
        const downloadItem = await DownloadManager.addToQueue(streamData, selectedQuality);

        sendResponse({ success: true, downloadId: downloadItem.id });
      } catch (error) {
        console.error('Error starting download:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  if (request.action === 'addToQueue') {
    // Add to queue without starting immediately
    (async () => {
      try {
        const { streamData } = request;
        const downloadItem = new DownloadItem(streamData);
        downloadItem.setState('queued');

        DownloadManager.downloadQueue.push(downloadItem);
        await DownloadManager.saveQueue();

        sendResponse({ success: true, downloadId: downloadItem.id });
      } catch (error) {
        console.error('Error adding to queue:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'pauseDownload') {
    (async () => {
      try {
        const result = await DownloadManager.pauseDownload(request.downloadId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'resumeDownload') {
    (async () => {
      try {
        const result = await DownloadManager.resumeDownload(request.downloadId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'cancelDownload') {
    (async () => {
      try {
        const result = await DownloadManager.cancelDownload(request.downloadId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'retryDownload') {
    (async () => {
      try {
        const result = await DownloadManager.retryDownload(request.downloadId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getDownloads') {
    // Get all downloads
    const downloads = DownloadManager.getDownloads();
    sendResponse({ downloads });
  }

  if (request.action === 'getActiveDownloads') {
    // Get only active downloads
    const activeDownloads = DownloadManager.getActiveDownloads();
    sendResponse({ downloads: activeDownloads });
  }

  if (request.action === 'clearCompletedDownloads') {
    (async () => {
      try {
        await DownloadManager.clearCompleted();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'playInVlc') {
    (async () => {
      try {
        const { url, referer, title } = request;
        if (!url) {
          sendResponse({ success: false, error: 'No stream URL' });
          return;
        }
        const context = getStreamContext(url);
        const userAgent = context.userAgent || (typeof navigator !== 'undefined' && navigator.userAgent) || '';
        const effectiveReferer = referer || context.referer || '';

        // 1. Native host: launches VLC directly with referer/user-agent options
        const native = await launchVlcNative(url, effectiveReferer, userAgent);
        if (native.success) {
          sendResponse({ success: true, method: 'native' });
          return;
        }
        console.log('VLC native launch unavailable, falling back to playlist:', native.error);

        // 2. Fallback: download an .xspf playlist and open it with the default app
        const playlist = await downloadVlcPlaylist(url, effectiveReferer, userAgent, title);
        sendResponse({ ...playlist, method: 'playlist', nativeError: native.error });
      } catch (error) {
        console.error('Play in VLC failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'isYtDlpAvailable') {
    // Check if yt-dlp is available
    const available = DownloadManager.isYtDlpAvailable();
    sendResponse({ available });
  }

  if (request.action === 'autoConfigureNativeMessaging') {
    // Auto-configure native messaging manifest with extension ID
    (async () => {
      try {
        const extensionId = request.extensionId;

        if (!extensionId) {
          sendResponse({ success: false, error: 'No extension ID provided' });
          return;
        }

        // Send message to native host to update manifest
        const port = browser.runtime.connectNative('com.streamsniper.ytdlp');

        port.postMessage({
          type: 'updateManifest',
          extensionId: extensionId
        });

        port.onMessage.addListener((message) => {
          if (message.type === 'manifestUpdated') {
            sendResponse({ success: true });
          } else if (message.type === 'error') {
            sendResponse({ success: false, error: message.error });
          }
        });

        port.onDisconnect.addListener(() => {
          if (browser.runtime.lastError) {
            sendResponse({ success: false, error: browser.runtime.lastError.message });
          }
        });

      } catch (error) {
        console.error('Error auto-configuring native messaging:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep message channel open for async response
  }

  // ========== RECORDING HANDLERS ==========

  if (request.action === 'startRecording') {
    (async () => {
      try {
        const { streamData, options } = request;
        const result = await StreamRecorder.startRecording(streamData, options);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'pauseRecording') {
    (async () => {
      try {
        const result = await StreamRecorder.pauseRecording(request.recordingId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'resumeRecording') {
    (async () => {
      try {
        const result = await StreamRecorder.resumeRecording(request.recordingId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'stopRecording') {
    (async () => {
      try {
        const result = await StreamRecorder.stopRecording(request.recordingId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getRecordings') {
    const recordings = StreamRecorder.getRecordings();
    sendResponse({ recordings });
  }

  if (request.action === 'getActiveRecordings') {
    const activeRecordings = StreamRecorder.getActiveRecordings();
    sendResponse({ recordings: activeRecordings });
  }

  // ========== BATCH DOWNLOAD HANDLERS ==========

  if (request.action === 'toggleStreamSelection') {
    const result = BatchController.toggleStreamSelection(request.streamUrl, request.selected);
    sendResponse(result);
  }

  if (request.action === 'selectAllStreams') {
    const result = BatchController.selectAllStreams(request.streamUrls);
    sendResponse(result);
  }

  if (request.action === 'clearSelection') {
    const result = BatchController.clearSelection();
    sendResponse(result);
  }

  if (request.action === 'getSelectionCount') {
    const count = BatchController.getSelectionCount();
    sendResponse({ count: count });
  }

  if (request.action === 'isStreamSelected') {
    const isSelected = BatchController.isStreamSelected(request.streamUrl);
    sendResponse({ isSelected: isSelected });
  }

  if (request.action === 'startBatchDownload') {
    (async () => {
      try {
        const { streams, options } = request;
        const result = await BatchController.startBatchDownload(streams, options);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'downloadAllFromPage') {
    (async () => {
      try {
        const { streams, options } = request;
        const result = await BatchController.downloadAllFromPage(streams, options);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'pauseBatch') {
    (async () => {
      try {
        const result = await BatchController.pauseBatch(request.batchId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'resumeBatch') {
    (async () => {
      try {
        const result = await BatchController.resumeBatch(request.batchId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'cancelBatch') {
    (async () => {
      try {
        const result = await BatchController.cancelBatch(request.batchId);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'setBatchPriority') {
    (async () => {
      try {
        const result = await BatchController.setBatchPriority(request.batchId, request.priority);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getAllBatches') {
    const batches = BatchController.getAllBatches();
    sendResponse({ batches: batches });
  }

  if (request.action === 'getBatchStats') {
    const stats = BatchController.getBatchStats(request.batchId);
    sendResponse({ stats: stats });
  }

  if (request.action === 'setMaxConcurrent') {
    (async () => {
      try {
        const result = await BatchController.setMaxConcurrent(request.limit);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getBatchSettings') {
    const settings = BatchController.getSettings();
    sendResponse(settings);
  }

  if (request.action === 'clearCompletedBatches') {
    (async () => {
      try {
        const result = await BatchController.clearCompletedBatches();
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // ========== METADATA EXTRACTION HANDLERS ==========

  if (request.action === 'extractMetadata') {
    (async () => {
      try {
        const { tabId, streamUrl } = request;
        const metadata = await MetadataExtractor.extractFromPage(tabId, streamUrl);
        sendResponse({ success: true, metadata: metadata });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'enrichStreamData') {
    (async () => {
      try {
        const { streamData, tabId } = request;
        const enriched = await MetadataExtractor.enrichStreamData(streamData, tabId);
        sendResponse({ success: true, streamData: enriched });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'enrichMultipleStreams') {
    (async () => {
      try {
        const { streams, tabId } = request;
        const enriched = await MetadataExtractor.enrichMultipleStreams(streams, tabId);
        sendResponse({ success: true, streams: enriched });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'clearMetadataCache') {
    (async () => {
      try {
        await MetadataExtractor.clearCache();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // ========== ANALYTICS HANDLERS ==========

  if (request.action === 'getAnalyticsSummary') {
    const summary = AnalyticsEngine.getAnalyticsSummary();
    sendResponse({ success: true, summary: summary });
  }

  if (request.action === 'getCategoryBreakdown') {
    const breakdown = AnalyticsEngine.getCategoryBreakdown();
    sendResponse({ success: true, breakdown: breakdown });
  }

  if (request.action === 'getQualityDistribution') {
    const distribution = AnalyticsEngine.getQualityDistribution();
    sendResponse({ success: true, distribution: distribution });
  }

  if (request.action === 'getDomainStats') {
    const stats = AnalyticsEngine.getDomainStats();
    sendResponse({ success: true, stats: stats });
  }

  if (request.action === 'getTimeTrends') {
    const trends = AnalyticsEngine.getTimeTrends(request.period || 'day');
    sendResponse({ success: true, trends: trends });
  }

  if (request.action === 'getPerformanceMetrics') {
    const metrics = AnalyticsEngine.getPerformanceMetrics();
    sendResponse({ success: true, metrics: metrics });
  }

  if (request.action === 'resetAnalytics') {
    (async () => {
      try {
        await AnalyticsEngine.resetAnalytics();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // ========== QUALITY ANALYSIS HANDLERS ==========

  if (request.action === 'analyzeStreamQuality') {
    (async () => {
      try {
        const { streamData } = request;
        const analysis = await QualityAnalyzer.analyzeStream(streamData);
        sendResponse(analysis);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getQualityRecommendation') {
    (async () => {
      try {
        const { streamData } = request;
        const analysis = await QualityAnalyzer.analyzeStream(streamData);

        if (analysis.success && analysis.recommendation) {
          sendResponse({
            success: true,
            recommendation: analysis.recommendation,
            warnings: analysis.warnings
          });
        } else {
          sendResponse({ success: false, error: 'No recommendation available' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'compareQualities') {
    try {
      const { quality1, quality2 } = request;
      const comparison = QualityAnalyzer.compareQualities(quality1, quality2);
      sendResponse({ success: true, comparison: comparison });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  if (request.action === 'getConnectionSpeed') {
    (async () => {
      try {
        const speed = await QualityAnalyzer.getConnectionSpeed();
        sendResponse({ success: true, speed: speed });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'setConnectionSpeed') {
    (async () => {
      try {
        const { speedMbps } = request;
        const speed = await QualityAnalyzer.setConnectionSpeed(speedMbps);
        sendResponse({ success: true, speed: speed });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'getQualityByCriteria') {
    (async () => {
      try {
        const { streamData, criteria } = request;
        const analysis = await QualityAnalyzer.analyzeStream(streamData);

        if (analysis.success) {
          const quality = QualityAnalyzer.getQualityByCriteria(analysis.qualities, criteria);
          sendResponse({ success: true, quality: quality });
        } else {
          sendResponse({ success: false, error: 'Failed to analyze stream' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === 'formatQualityAnalysis') {
    (async () => {
      try {
        const { streamData } = request;
        const analysis = await QualityAnalyzer.analyzeStream(streamData);
        const formatted = QualityAnalyzer.formatAnalysisForDisplay(analysis);
        sendResponse({ success: true, formatted: formatted });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }
});

// ========== KEYBOARD COMMAND HANDLERS ==========

browser.commands.onCommand.addListener(async function(command) {
  console.log('Keyboard command received:', command);

  if (command === 'play-in-vlc') {
    playBestInVlc().catch(err => console.error('Play in VLC failed:', err));
    return;
  }

  if (command === 'toggle-detection') {
    // Toggle stream detection on/off
    detectionEnabled = !detectionEnabled;
    await browser.storage.local.set({ detectionEnabled: detectionEnabled });

    // Show notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Stream Detection',
      message: detectionEnabled ? 'Detection enabled' : 'Detection disabled'
    });

    // Clear badges if disabled
    if (!detectionEnabled) {
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          actionApi.setBadgeText({
            text: '',
            tabId: tab.id
          });
        });
      });
    }
  }

  // For other commands, send message to popup (if open)
  // The popup will handle these commands
  browser.runtime.sendMessage({
    action: 'keyboardCommand',
    command: command
  }).catch(() => {
    // Popup not open - show notification
    if (command === 'copy-url' || command === 'download-stream' || command === 'validate-stream') {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Stream Sniper',
        message: 'Please open the popup first to use this shortcut'
      });
    }
  });
});
