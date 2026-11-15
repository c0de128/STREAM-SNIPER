const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, readSource, createBrowserMock } = require('./helpers');

function loadStorageManager() {
  const mock = createBrowserMock();
  const ctx = { browser: mock.browser, console };
  vm.createContext(ctx);
  vm.runInContext(readSource('storage-manager.js'), ctx);
  return { sm: vm.runInContext('StorageManager', ctx), local: mock.local };
}

test('saveStream keeps title, frame, headers and dedupes by url+page', async () => {
  const { sm, local } = loadStorageManager();
  const stream = { url: 'https://c/x.m3u8', type: 'm3u8', typeName: 'HLS', domain: 'c', pageUrl: 'https://p/1', pageTitle: 'Game', frameUrl: 'https://e/f', headers: { cookie: 'a=1' }, size: 0 };
  await sm.saveStream(stream);
  await sm.saveStream(stream);
  await sm.saveStream({ ...stream, pageUrl: 'https://p/2' });
  const history = local.streamHistory;
  assert.equal(history.length, 2);
  assert.equal(history[1].pageTitle, 'Game');
  assert.equal(history[1].frameUrl, 'https://e/f');
  assert.deepEqual(JSON.parse(JSON.stringify(history[1].headers)), { cookie: 'a=1' });
  assert.equal(local.streamStats.total, 2);
  assert.equal(local.streamStats.byDomain.c, 2);
});

test('getSettings merges stored values over defaults', async () => {
  const { sm, local } = loadStorageManager();
  const defaults = await sm.getSettings();
  assert.equal(defaults.captureHeaders, true);
  assert.equal(defaults.detectDirectVideo, true);
  local.settings = { captureHeaders: false, previewQuality: 'high' };
  const merged = await sm.getSettings();
  assert.equal(merged.captureHeaders, false);
  assert.equal(merged.previewQuality, 'high');
  assert.equal(merged.notifications, true);
});

test('filterHistory applies text, domain, type and date filters; historyDomains sorts by count', () => {
  const { sm } = loadStorageManager();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const history = [
    { url: 'https://a.com/1.m3u8', domain: 'a.com', type: 'm3u8', pageTitle: 'Alpha', timestamp: now - 1 * day },
    { url: 'https://b.com/2.mpd', domain: 'b.com', type: 'mpd', pageTitle: 'Beta', timestamp: now - 10 * day },
    { url: 'https://a.com/3.mp4', domain: 'a.com', type: 'mp4', pageTitle: undefined, timestamp: now - 40 * day }
  ];
  assert.equal(sm.filterHistory(history, { query: 'alpha' }).length, 1);
  assert.equal(sm.filterHistory(history, { domain: 'a.com' }).length, 2);
  assert.equal(sm.filterHistory(history, { type: 'mpd' }).length, 1);
  assert.equal(sm.filterHistory(history, { days: 7 }).length, 1);
  assert.equal(sm.filterHistory(history, { days: 30 }).length, 2);
  assert.equal(sm.filterHistory(history, { query: 'zzz' }).length, 0, 'missing pageTitle must not throw');
  assert.deepEqual(JSON.parse(JSON.stringify(sm.historyDomains(history))), ['a.com', 'b.com']);
});

test('manifest.json and Chrome importScripts list name the same background modules', () => {
  const manifest = JSON.parse(readSource('manifest.json'));
  const manifestScripts = manifest.background.scripts.filter(f => f !== 'background.js');
  const match = readSource('background.js').match(/const BACKGROUND_SCRIPTS = \[([\s\S]*?)\];/);
  assert.ok(match, 'BACKGROUND_SCRIPTS list present');
  const importScripts = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(importScripts, manifestScripts);
  for (const f of manifestScripts) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
});

test('every script/style referenced by extension pages exists and is shipped by build.js', () => {
  const build = readSource('build.js');
  const common = [...build.split('const COMMON_FILES = [')[1].split('];')[0].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const pages = ['popup.html', 'options.html', 'player.html', 'quality-selector.html', 'setup-wizard.html', 'offscreen.html'];
  for (const page of pages) {
    assert.ok(common.includes(page), `${page} shipped`);
    const html = readSource(page);
    const refs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"?]+)"/g)].map(m => m[1]).filter(r => !r.startsWith('http'));
    for (const ref of refs) {
      assert.ok(fs.existsSync(path.join(ROOT, ref)), `${page} references ${ref} which exists`);
      assert.ok(common.includes(ref), `${ref} (from ${page}) is in COMMON_FILES`);
    }
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'popup.js')), 'popup.js was split into popup-*.js modules');
});

test('both manifests declare the permissions the code relies on', () => {
  const ff = JSON.parse(readSource('manifest.json'));
  const cr = JSON.parse(readSource('manifest-v3.json'));
  for (const p of ['webRequest', 'webRequestBlocking', 'downloads', 'downloads.open', 'contextMenus', 'nativeMessaging']) {
    assert.ok(ff.permissions.includes(p), `Firefox has ${p}`);
  }
  for (const p of ['webRequest', 'declarativeNetRequest', 'downloads', 'downloads.open', 'contextMenus', 'scripting', 'offscreen', 'nativeMessaging', 'storage']) {
    assert.ok(cr.permissions.includes(p), `Chrome has ${p}`);
  }
  assert.equal(ff.browser_specific_settings.gecko.id, 'stream-sniper@c0de128.github.io');
  const native = JSON.parse(readSource('com.streamsniper.ytdlp.firefox.json'));
  assert.deepEqual(native.allowed_extensions, [ff.browser_specific_settings.gecko.id]);
  assert.ok(ff.commands['play-in-vlc'] && cr.commands['play-in-vlc']);
});

test('popup modules declare each function exactly once across the set', () => {
  const html = readSource('popup.html');
  const modules = [...html.matchAll(/<script src="(popup-[^"]+)"/g)].map(m => m[1]);
  assert.ok(modules.length >= 6);
  const seen = new Map();
  for (const m of modules) {
    for (const match of readSource(m).matchAll(/^(?:async )?function\s+([A-Za-z0-9_]+)/gm)) {
      seen.set(match[1], (seen.get(match[1]) || 0) + 1);
    }
  }
  // openQualitySelector is intentionally overridden by popup-quality.js (modal version)
  const dupes = [...seen.entries()].filter(([name, n]) => n > 1 && name !== 'openQualitySelector');
  assert.deepEqual(dupes, []);
});
