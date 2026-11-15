const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const HlsDownloader = require('../hls-downloader.js');

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,FRAME-RATE=30
mid/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
https://other-cdn.example/high/index.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:10
#EXTINF:4.0,
seg10.ts
#EXTINF:4.0,
seg11.ts
#EXT-X-BYTERANGE:100@0
#EXTINF:4.0,
range.ts
#EXT-X-BYTERANGE:100
#EXTINF:4.0,
range.ts
#EXT-X-ENDLIST
`;

test('parses master playlists with absolute and relative variant URLs', () => {
  const pl = HlsDownloader.parsePlaylist(MASTER, 'https://cdn.example/live/master.m3u8');
  assert.equal(pl.type, 'master');
  assert.equal(pl.variants.length, 3);
  assert.equal(pl.variants[0].url, 'https://cdn.example/live/low/index.m3u8');
  assert.equal(pl.variants[2].url, 'https://other-cdn.example/high/index.m3u8');
  assert.equal(pl.variants[1].height, 720);
  assert.equal(pl.variants[1].frameRate, 30);
  assert.equal(pl.variants[0].codecs, 'avc1.4d401e,mp4a.40.2');
});

test('parses media playlists with sequence numbers, byte ranges and end list', () => {
  const pl = HlsDownloader.parsePlaylist(MEDIA, 'https://cdn.example/live/mid/index.m3u8');
  assert.equal(pl.type, 'media');
  assert.equal(pl.endList, true);
  assert.equal(pl.targetDuration, 4);
  assert.equal(pl.segments.length, 4);
  assert.equal(pl.segments[0].sequence, 10);
  assert.equal(pl.segments[0].url, 'https://cdn.example/live/mid/seg10.ts');
  assert.deepEqual(pl.segments[2].byteRange, { length: 100, offset: 0 });
  assert.deepEqual(pl.segments[3].byteRange, { length: 100, offset: 100 });
});

test('parses encryption keys and fMP4 init maps', () => {
  const text = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x000102030405060708090a0b0c0d0e0f
#EXTINF:2,
s1.m4s
#EXT-X-KEY:METHOD=NONE
#EXTINF:2,
s2.m4s
#EXT-X-ENDLIST`;
  const pl = HlsDownloader.parsePlaylist(text, 'https://c.example/v/p.m3u8');
  assert.equal(pl.isFmp4, true);
  assert.equal(pl.segments[0].map.url, 'https://c.example/v/init.mp4');
  assert.equal(pl.segments[0].key.method, 'AES-128');
  assert.equal(pl.segments[0].key.uri, 'https://c.example/v/key.bin');
  assert.equal(pl.segments[1].key, null);
});

test('rejects non-playlist content', () => {
  assert.throws(() => HlsDownloader.parsePlaylist('<html>nope</html>', 'https://x/'), /Not a valid M3U8/);
});

test('selects variants by preference', () => {
  const { variants } = HlsDownloader.parsePlaylist(MASTER, 'https://cdn.example/live/master.m3u8');
  assert.equal(HlsDownloader.selectVariant(variants, 'best').height, 1080);
  assert.equal(HlsDownloader.selectVariant(variants, 'worst').height, 360);
  assert.equal(HlsDownloader.selectVariant(variants, '720p').height, 720);
  assert.equal(HlsDownloader.selectVariant(variants, '900p').height, 720, 'closest not exceeding');
  assert.equal(HlsDownloader.selectVariant(variants, { resolution: '1920x1080' }).height, 1080);
  assert.equal(HlsDownloader.selectVariant(variants, { bandwidth: 2400000 }).height, 720);
  assert.equal(HlsDownloader.selectVariant([], 'best'), null);
});

// Build a fake fetch serving a master -> media -> segments tree, with optional AES-128 encryption
function makeFetch(files) {
  const log = [];
  const fetchImpl = async (url, init = {}) => {
    log.push({ url, init });
    if (init.signal && init.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const body = files[url];
    if (body === undefined) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    let bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    const range = init.headers && init.headers.Range;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d+)/);
      bytes = bytes.subarray(parseInt(m[1], 10), parseInt(m[2], 10) + 1);
    }
    return { ok: true, status: 200, text: async () => bytes.toString('utf8'), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  return { fetchImpl, log };
}

test('downloads a VOD stream: picks best variant, fetches segments in order, concatenates', async () => {
  const files = {
    'https://cdn.example/live/master.m3u8': MASTER,
    'https://other-cdn.example/high/index.m3u8': '#EXTM3U\n#EXTINF:4,\na.ts\n#EXTINF:4,\nb.ts\n#EXTINF:4,\nc.ts\n#EXT-X-ENDLIST\n',
    'https://other-cdn.example/high/a.ts': 'AAAA',
    'https://other-cdn.example/high/b.ts': 'BB',
    'https://other-cdn.example/high/c.ts': 'CCCCCC'
  };
  const { fetchImpl } = makeFetch(files);
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const progress = [];
    const result = await HlsDownloader.download({ url: 'https://cdn.example/live/master.m3u8', quality: 'best', concurrency: 2, onProgress: p => progress.push(p) });
    assert.equal(result.container, 'ts');
    assert.equal(result.segments, 3);
    assert.equal(result.bytes, 12);
    assert.equal(result.variant.height, 1080);
    const text = Buffer.from(await result.blob.arrayBuffer()).toString('utf8');
    assert.equal(text, 'AAAABBCCCCCC', 'segments assembled in playlist order even with concurrency');
    assert.equal(progress[progress.length - 1].percent, 100);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('decrypts AES-128 segments and prepends the fMP4 init segment once', async () => {
  const key = nodeCrypto.randomBytes(16);
  const iv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const encrypt = (plain) => {
    const c = nodeCrypto.createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([c.update(Buffer.from(plain)), c.final()]);
  };
  const files = {
    'https://c.example/v/p.m3u8': `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x000102030405060708090a0b0c0d0e0f\n#EXTINF:2,\ns1.m4s\n#EXTINF:2,\ns2.m4s\n#EXT-X-ENDLIST`,
    'https://c.example/v/init.mp4': 'INIT',
    'https://c.example/v/key.bin': key,
    'https://c.example/v/s1.m4s': encrypt('hello '),
    'https://c.example/v/s2.m4s': encrypt('world')
  };
  const { fetchImpl, log } = makeFetch(files);
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await HlsDownloader.download({ url: 'https://c.example/v/p.m3u8' });
    assert.equal(result.container, 'mp4');
    const text = Buffer.from(await result.blob.arrayBuffer()).toString('utf8');
    assert.equal(text, 'INIThello world');
    assert.equal(log.filter(l => l.url.endsWith('key.bin')).length, 1, 'key fetched once');
    assert.equal(log.filter(l => l.url.endsWith('init.mp4')).length, 1, 'init fetched once');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('honours byte ranges and aborts cleanly', async () => {
  const files = {
    'https://c.example/r.m3u8': MEDIA.replace('seg10.ts', 'seg10.ts').replace(/seg1[01]\.ts/g, 'r.ts'),
    'https://cdn.example/live/mid/r.ts': 'x'.repeat(300),
    'https://cdn.example/live/mid/range.ts': 'A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100)
  };
  files['https://cdn.example/live/mid/index.m3u8'] = files['https://c.example/r.m3u8'];
  const { fetchImpl } = makeFetch(files);
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const result = await HlsDownloader.download({ url: 'https://cdn.example/live/mid/index.m3u8', concurrency: 1 });
    const text = Buffer.from(await result.blob.arrayBuffer()).toString('utf8');
    assert.equal(text, 'x'.repeat(600) + 'A'.repeat(100) + 'B'.repeat(100));

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(HlsDownloader.download({ url: 'https://cdn.example/live/mid/index.m3u8', signal: controller.signal }), (e) => e.name === 'AbortError');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('unsupported DRM methods fail with a clear error', async () => {
  const files = {
    'https://c.example/drm.m3u8': '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"\n#EXTINF:2,\ns1.ts\n#EXT-X-ENDLIST',
    'https://c.example/s1.ts': 'data'
  };
  const { fetchImpl } = makeFetch(files);
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await assert.rejects(HlsDownloader.download({ url: 'https://c.example/drm.m3u8' }), /DRM protected/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
