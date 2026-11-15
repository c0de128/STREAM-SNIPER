const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackground, tick } = require('./helpers');
// Values created inside the VM have foreign prototypes; clone before deep comparisons
const j = (v) => JSON.parse(JSON.stringify(v));

const FRAME = 'https://embed.example/player?id=1';
const pageReq = (url, extra = {}) => ({ url, tabId: 7, frameId: 1, type: 'xmlhttprequest', documentUrl: FRAME, originUrl: FRAME, ...extra });

test('detects HLS playlist by URL pattern and records frame/referer', async () => {
  const bg = loadBackground();
  bg.fire('onBeforeRequest', pageReq('https://cdn.example/live/abc/index.m3u8?token=1'));
  const streams = bg.get('detectedStreams')[7];
  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'm3u8');
  assert.equal(streams[0].frameUrl, FRAME);
  assert.equal(bg.get('streamReferers')['cdn.example'], FRAME);
});

test('detects extensionless playlist by Content-Type and ignores non-stream responses', async () => {
  const bg = loadBackground();
  bg.fire('onHeadersReceived', pageReq('https://cdn.example/play/992?sig=zz', {
    responseHeaders: [{ name: 'Content-Type', value: 'application/vnd.apple.mpegurl' }]
  }));
  bg.fire('onHeadersReceived', pageReq('https://cdn.example/style.css', {
    responseHeaders: [{ name: 'Content-Type', value: 'text/css' }]
  }));
  const streams = bg.get('detectedStreams')[7];
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/play/992?sig=zz');
});

test('detects direct MP4 over 1MB, skips small files and tiny unknown-size XHRs', async () => {
  const bg = loadBackground();
  bg.fire('onHeadersReceived', pageReq('https://files.example/big', {
    type: 'media', responseHeaders: [{ name: 'Content-Type', value: 'video/mp4' }, { name: 'Content-Length', value: String(50 * 1024 * 1024) }]
  }));
  bg.fire('onHeadersReceived', pageReq('https://files.example/small', {
    type: 'media', responseHeaders: [{ name: 'Content-Type', value: 'video/mp4' }, { name: 'Content-Length', value: '2048' }]
  }));
  bg.fire('onHeadersReceived', pageReq('https://files.example/ranged', {
    type: 'media', responseHeaders: [{ name: 'Content-Type', value: 'video/webm' }, { name: 'Content-Range', value: 'bytes 0-1023/73400320' }]
  }));
  const streams = bg.get('detectedStreams')[7];
  assert.deepEqual(j(streams.map(s => [s.type, s.size])), [['mp4', 50 * 1024 * 1024], ['webm', 73400320]]);
});

test('segment burst recovers a hidden playlist by probing common names', async () => {
  const bg = loadBackground({
    fetch: async (url) => {
      if (url.endsWith('/live/abc/index.m3u8')) {
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/vnd.apple.mpegurl']]), text: async () => '#EXTM3U\n#EXTINF:4,\nseg1.ts\n' };
      }
      return { ok: false, status: 404, headers: new Map(), text: async () => '' };
    }
  });
  for (let i = 1; i <= 3; i++) {
    bg.fire('onBeforeRequest', pageReq(`https://cdn.example/live/abc/seg${i}.ts`, { type: 'media' }));
  }
  await tick(50);
  const streams = bg.get('detectedStreams')[7];
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/live/abc/index.m3u8');
  assert.equal(streams[0].inferred, true);
});

test('segment burst with no playlist exposes the segment directory', async () => {
  const bg = loadBackground({ fetch: async () => ({ ok: false, status: 404, headers: new Map(), text: async () => '' }) });
  for (let i = 1; i <= 3; i++) bg.fire('onBeforeRequest', pageReq(`https://cdn.example/v/x/chunk-${i}.m4s`));
  await tick(50);
  const streams = bg.get('detectedStreams')[7];
  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'hls-segments');
  assert.equal(streams[0].url, 'https://cdn.example/v/x/');
});

test('Firefox: extension requests get Referer, Origin and captured Cookie; page requests untouched', async () => {
  const bg = loadBackground();
  bg.get('settingsCache = { captureHeaders: true }');
  bg.fire('onBeforeRequest', pageReq('https://cdn.example/live/abc/index.m3u8'));

  // Page request to the stream host: headers captured
  bg.fire('onBeforeSendHeaders', pageReq('https://cdn.example/live/abc/index.m3u8', {
    requestHeaders: [{ name: 'Cookie', value: 'session=xyz' }, { name: 'User-Agent', value: 'PageUA/9' }, { name: 'X-Token', value: 't1' }, { name: 'Accept', value: '*/*' }]
  }));
  const captured = bg.get('streamHeaders')['cdn.example'];
  assert.equal(captured.cookie, 'session=xyz');
  assert.equal(captured['x-token'], 't1');
  assert.equal(bg.get('detectedStreams')[7][0].headers.cookie, 'session=xyz');

  // Extension request: rewritten
  const out = bg.fire('onBeforeSendHeaders', {
    url: 'https://cdn.example/live/abc/seg1.ts', tabId: -1, originUrl: 'moz-extension://ext-id-abc/popup.html',
    requestHeaders: [{ name: 'Origin', value: 'moz-extension://ext-id-abc' }, { name: 'Accept', value: '*/*' }]
  });
  const h = Object.fromEntries(out.requestHeaders.map(x => [x.name.toLowerCase(), x.value]));
  assert.equal(h.referer, FRAME);
  assert.equal(h.origin, 'https://embed.example');
  assert.equal(h.cookie, 'session=xyz');
  assert.equal(h['x-token'], 't1');
  assert.equal(out.requestHeaders.filter(x => x.name.toLowerCase() === 'origin').length, 1);

  // Page request: untouched (no return value)
  const untouched = bg.fire('onBeforeSendHeaders', pageReq('https://cdn.example/live/abc/seg1.ts', { requestHeaders: [] }));
  assert.equal(untouched, undefined);

  // Unknown host: untouched
  const unknown = bg.fire('onBeforeSendHeaders', { url: 'https://other.example/x.m3u8', tabId: -1, originUrl: 'moz-extension://ext-id-abc/popup.html', requestHeaders: [] });
  assert.equal(unknown, undefined);

  const ctx = bg.get('getStreamContext("https://cdn.example/live/abc/index.m3u8")');
  assert.equal(ctx.referer, FRAME);
  assert.equal(ctx.userAgent, 'PageUA/9');
  assert.deepEqual(j(ctx.headers), { cookie: 'session=xyz', 'x-token': 't1' });
});

test('Chrome: declarativeNetRequest session rules carry referer and captured headers', async () => {
  const bg = loadBackground({ chrome: true });
  bg.get('settingsCache = { captureHeaders: true }');
  bg.fire('onBeforeRequest', pageReq('https://cdn.example/live/abc/index.m3u8', { initiator: 'https://embed.example' }));
  bg.fire('onBeforeSendHeaders', pageReq('https://cdn.example/live/abc/index.m3u8', {
    initiator: 'https://embed.example', requestHeaders: [{ name: 'Cookie', value: 'c=1' }]
  }));
  await tick(30);
  const rules = await bg.browser.declarativeNetRequest.getSessionRules();
  assert.ok(rules.length >= 2, 'expected session rules');
  const rule = rules.find(r => r.condition.initiatorDomains);
  assert.deepEqual(j(rule.condition.initiatorDomains), ['ext-id-abc']);
  const headers = Object.fromEntries(rule.action.requestHeaders.map(h => [h.header.toLowerCase(), h.value]));
  assert.equal(headers.referer, FRAME);
  assert.equal(headers.cookie, 'c=1');
  // Badge uses the MV3 action API without throwing
  assert.ok(bg.calls.badge.length >= 1);
});

test('session state persists and restores for open tabs only', async () => {
  const bg = loadBackground({ chrome: true });
  bg.fire('onBeforeRequest', pageReq('https://cdn.example/live/abc/index.m3u8'));
  bg.fire('onBeforeRequest', { ...pageReq('https://cdn.example/other.m3u8'), tabId: 404 });
  await tick(400);
  const saved = bg.session.ssSessionState;
  assert.ok(saved, 'state saved to storage.session');
  assert.equal(saved.detectedStreams[7].length, 1);

  // New worker instance with the same storage: tab 7 exists, tab 404 does not
  const { loadBackground: load2 } = require('./helpers');
  const bg2 = load2({ chrome: true });
  Object.assign(bg2.session, JSON.parse(JSON.stringify(saved)) ? { ssSessionState: saved } : {});
  await bg2.get('restoreState.call(null)'); // no-op: already ran at load with empty store
  bg2.get('stateRestored = false');
  await bg2.get('restoreState()');
  const restored = bg2.get('detectedStreams');
  assert.equal(restored[7].length, 1);
  assert.equal(restored[404], undefined);
  assert.equal(bg2.get('streamReferers')['cdn.example'], FRAME);
});

test('XSPF playlist escapes XML and carries referer/user-agent options', () => {
  const bg = loadBackground();
  const xml = bg.get('buildVlcPlaylist("https://cdn.x/a.m3u8?t=1&u=2", "https://embed.host/p?a=1", "Mozilla <UA>", "NE vs GB & more")');
  assert.ok(xml.includes('<location>https://cdn.x/a.m3u8?t=1&amp;u=2</location>'));
  assert.ok(xml.includes('<vlc:option>http-referrer=https://embed.host/p?a=1</vlc:option>'));
  assert.ok(xml.includes('http-user-agent=Mozilla &lt;UA&gt;'));
  assert.ok(xml.includes('<title>NE vs GB &amp; more</title>'));
  assert.equal(bg.get('safeFilename("a/b:c*d?e\\"f<g>h|i")'), 'a-b-c-d-e-f-g-h-i');
});

test('pickBestStream prefers playlists over direct files and skips segment-only entries', () => {
  const bg = loadBackground();
  const best = bg.get(`pickBestStream([
    { type: 'hls-segments', url: 'https://a/dir/', timestamp: 1 },
    { type: 'mp4', url: 'https://a/v.mp4', size: 900, timestamp: 2 },
    { type: 'm3u8', url: 'https://a/i.m3u8', timestamp: 3 }
  ])`);
  assert.equal(best.type, 'm3u8');
  assert.equal(bg.get('pickBestStream([])'), null);
});

test('getStreams message waits for restore and returns the active tab streams', async () => {
  const bg = loadBackground();
  bg.fire('onBeforeRequest', pageReq('https://cdn.example/live/abc/index.m3u8'));
  const resp = await bg.sendMessage({ action: 'getStreams' });
  assert.equal(resp.streams.length, 1);
  const ctx = await bg.sendMessage({ action: 'getStreamContext', url: 'https://cdn.example/live/abc/index.m3u8' });
  assert.equal(ctx.referer, FRAME);
});

test('context menu entries are registered and play-in-vlc command exists', async () => {
  const bg = loadBackground();
  await tick(20);
  const ids = bg.calls.menus.map(m => m.id);
  assert.ok(ids.includes('ss-play-best-vlc'));
  assert.ok(ids.includes('ss-play-link-vlc'));
  assert.ok((bg.events['commands.onCommand'] || []).length >= 1);
});
