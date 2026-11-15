// Test harness: loads extension scripts into a sandboxed VM with a mocked `browser` API.
// Run with `npm test` (Node's built-in test runner, no dependencies).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

// Minimal event emitter matching browser.*.onX.addListener
function makeEvent(registry, name) {
  const listeners = [];
  registry[name] = listeners;
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (fn) => listeners.includes(fn)
  };
}

// In-memory storage area
function makeStorageArea(backing) {
  return {
    _data: backing,
    async get(keys) {
      if (keys === undefined || keys === null) return { ...backing };
      if (typeof keys === 'string') return { [keys]: backing[keys] };
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) out[k] = backing[k];
        return out;
      }
      const out = {};
      for (const [k, v] of Object.entries(keys)) out[k] = backing[k] === undefined ? v : backing[k];
      return out;
    },
    async set(obj) { Object.assign(backing, JSON.parse(JSON.stringify(obj))); },
    async remove(keys) { for (const k of [].concat(keys)) delete backing[k]; },
    async clear() { for (const k of Object.keys(backing)) delete backing[k]; }
  };
}

/**
 * Create a mocked browser environment.
 * options.chrome = true simulates Chrome MV3 (declarativeNetRequest present, action API).
 */
function createBrowserMock(options = {}) {
  const events = {};
  const calls = { notifications: [], downloads: [], badge: [], dnrRules: [], menus: [] };
  const local = {};
  const session = {};
  const tabs = options.tabs || [{ id: 7, url: 'https://site.example/watch', title: 'Example Page' }];

  const browser = {
    storage: {
      local: makeStorageArea(local),
      session: makeStorageArea(session),
      onChanged: makeEvent(events, 'storage.onChanged')
    },
    webRequest: {
      onBeforeRequest: makeEvent(events, 'onBeforeRequest'),
      onHeadersReceived: makeEvent(events, 'onHeadersReceived'),
      onBeforeSendHeaders: makeEvent(events, 'onBeforeSendHeaders'),
      OnBeforeSendHeadersOptions: options.chrome ? { EXTRA_HEADERS: 'extraHeaders' } : undefined
    },
    tabs: {
      onRemoved: makeEvent(events, 'tabs.onRemoved'),
      onUpdated: makeEvent(events, 'tabs.onUpdated'),
      query: async () => tabs,
      get: async (id) => {
        const t = tabs.find(t => t.id === id);
        if (!t) throw new Error('No tab');
        return t;
      },
      create: async (o) => ({ id: 99, ...o }),
      executeScript: async () => [{}]
    },
    runtime: {
      id: 'ext-id-abc',
      onStartup: makeEvent(events, 'runtime.onStartup'),
      onInstalled: makeEvent(events, 'runtime.onInstalled'),
      onMessage: makeEvent(events, 'runtime.onMessage'),
      getURL: (p) => (options.chrome ? 'chrome-extension://ext-id-abc/' : 'moz-extension://ext-id-abc/') + p,
      sendMessage: async () => { throw new Error('no receiver'); },
      connectNative: () => { throw new Error('native host not installed'); },
      lastError: null
    },
    notifications: { create: async (o) => { calls.notifications.push(o); return 'n1'; } },
    downloads: {
      download: async (o) => { calls.downloads.push(o); return calls.downloads.length; },
      search: async () => [{ state: 'complete' }],
      open: async () => {},
      show: async () => {},
      onChanged: makeEvent(events, 'downloads.onChanged'),
      onCreated: makeEvent(events, 'downloads.onCreated')
    },
    commands: { onCommand: makeEvent(events, 'commands.onCommand') },
    contextMenus: {
      removeAll: async () => {},
      create: (o) => { calls.menus.push(o); return o.id; },
      onClicked: makeEvent(events, 'contextMenus.onClicked')
    },
    alarms: { onAlarm: makeEvent(events, 'alarms.onAlarm'), create: () => {} },
    windows: { create: async () => ({}) }
  };

  if (options.chrome) {
    browser.action = {
      setBadgeText: async (o) => calls.badge.push(o),
      setBadgeBackgroundColor: async () => {}
    };
    browser.scripting = { executeScript: async () => [{ result: {} }] };
    browser.offscreen = { hasDocument: async () => false, createDocument: async () => {} };
    browser.declarativeNetRequest = {
      _rules: [],
      async getSessionRules() { return this._rules; },
      async updateSessionRules({ removeRuleIds = [], addRules = [] }) {
        this._rules = this._rules.filter(r => !removeRuleIds.includes(r.id)).concat(addRules);
        calls.dnrRules.push({ removeRuleIds, addRules });
      }
    };
  } else {
    browser.browserAction = {
      setBadgeText: async (o) => calls.badge.push(o),
      setBadgeBackgroundColor: async () => {}
    };
  }

  return { browser, events, calls, local, session, tabs };
}

/**
 * Load the background (plus storage-manager) into a VM context.
 * Returns { ctx, events, calls, fire, get, browser, fetchLog }
 */
function loadBackground(options = {}) {
  const mock = createBrowserMock(options);
  const fetchLog = [];
  const fetchImpl = options.fetch || (async (url, init) => {
    fetchLog.push({ url, init });
    return { ok: true, status: 200, statusText: 'OK', headers: new Map(), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  });

  const ctx = {
    browser: mock.browser,
    console: options.quiet === false ? console : { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    fetch: (url, init) => { fetchLog.push({ url, init }); return fetchImpl(url, init); },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { userAgent: 'TestBrowser/1.0' },
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    Blob,
    AbortController,
    DOMException
  };
  if (options.chrome) {
    // Service worker: importScripts exists; we load the modules ourselves
    ctx.importScripts = () => {};
  }
  vm.createContext(ctx);

  for (const file of ['storage-manager.js', 'hls-downloader.js', 'background.js']) {
    vm.runInContext(readSource(file), ctx, { filename: file });
  }

  const fire = (name, details) => {
    let out;
    for (const fn of mock.events[name] || []) {
      const r = fn(details);
      if (r !== undefined) out = r;
    }
    return out;
  };
  const get = (expr) => vm.runInContext(expr, ctx);
  const sendMessage = (request) => new Promise((resolve) => {
    let async = false;
    for (const fn of mock.events['runtime.onMessage'] || []) {
      const r = fn(request, { id: 'ext-id-abc' }, (resp) => resolve(resp));
      if (r === true) async = true;
    }
    if (!async) setTimeout(() => resolve(undefined), 20);
  });

  return { ctx, events: mock.events, calls: mock.calls, fire, get, browser: mock.browser, fetchLog, local: mock.local, session: mock.session, sendMessage };
}

const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

module.exports = { ROOT, readSource, createBrowserMock, loadBackground, tick };
