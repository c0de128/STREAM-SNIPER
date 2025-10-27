// Store detected streaming URLs (session storage)
let detectedStreams = {};

// Detection enabled state
let detectionEnabled = true;

// Initialize detection state from storage
browser.storage.local.get('detectionEnabled').then(result => {
  detectionEnabled = result.detectionEnabled !== undefined ? result.detectionEnabled : true;
  console.log('Detection state initialized:', detectionEnabled);
});

// Streaming formats to detect
const STREAM_FORMATS = [
  { pattern: /\.m3u8(\?|$)/i, type: 'm3u8', name: 'HLS (M3U8)' },
  { pattern: /\.m3u(\?|$)/i, type: 'm3u', name: 'M3U' },
  { pattern: /\.mpd(\?|$)/i, type: 'mpd', name: 'MPEG-DASH' },
  { pattern: /\.ism(\?|$)/i, type: 'ism', name: 'Smooth Streaming (ISM)' },
  { pattern: /\.ismc(\?|$)/i, type: 'ismc', name: 'Smooth Streaming (ISMC)' }
];

// Storage Manager (minimal version for background script)
const StorageManager = {
  KEYS: {
    HISTORY: 'streamHistory',
    STATS: 'streamStats',
    SESSION_COUNT: 'sessionCount',
    SETTINGS: 'settings'
  },

  async saveStream(streamData) {
    const history = await this.getHistory();
    const exists = history.some(item => item.url === streamData.url && item.pageUrl === streamData.pageUrl);

    if (!exists) {
      history.unshift(streamData);
      if (history.length > 500) history.length = 500;
      await browser.storage.local.set({ [this.KEYS.HISTORY]: history });
      await this.updateStats(streamData.type, streamData.domain);
      await this.incrementSessionCount();
    }
  },

  async getHistory() {
    const result = await browser.storage.local.get(this.KEYS.HISTORY);
    return result[this.KEYS.HISTORY] || [];
  },

  async updateStats(type, domain) {
    const stats = await this.getStats();
    stats.total++;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
    await browser.storage.local.set({ [this.KEYS.STATS]: stats });
  },

  async getStats() {
    const result = await browser.storage.local.get(this.KEYS.STATS);
    return result[this.KEYS.STATS] || { total: 0, byType: {}, byDomain: {} };
  },

  async incrementSessionCount() {
    const result = await browser.storage.local.get(this.KEYS.SESSION_COUNT);
    const count = (result[this.KEYS.SESSION_COUNT] || 0) + 1;
    await browser.storage.local.set({ [this.KEYS.SESSION_COUNT]: count });
  },

  async getSettings() {
    const result = await browser.storage.local.get(this.KEYS.SETTINGS);
    return result[this.KEYS.SETTINGS] || {
      notifications: true,
      autoValidate: false,
      autoPreview: true
    };
  }
};

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return 'unknown';
  }
}

// Determine stream type from URL
function getStreamType(url) {
  for (const format of STREAM_FORMATS) {
    if (format.pattern.test(url)) {
      return { type: format.type, name: format.name };
    }
  }
  return { type: 'unknown', name: 'Unknown' };
}

// Validate stream URL accessibility
async function validateStreamURL(url) {
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

// Listen for web requests
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Skip if detection is disabled
    if (!detectionEnabled) {
      return;
    }

    const url = details.url;
    const tabId = details.tabId;

    // Check if URL matches any streaming format
    const streamInfo = getStreamType(url);

    if (streamInfo.type !== 'unknown' && tabId >= 0) {
      // Initialize array if needed
      if (!detectedStreams[tabId]) {
        detectedStreams[tabId] = [];
      }

      // Check if already detected in current session
      const alreadyDetected = detectedStreams[tabId].some(s => s.url === url);

      if (!alreadyDetected) {
        console.log(`${streamInfo.name} stream detected:`, url);

        // Create basic stream data immediately
        const streamData = {
          url: url,
          type: streamInfo.type,
          typeName: streamInfo.name,
          domain: extractDomain(url),
          pageUrl: '',
          pageTitle: '',
          timestamp: Date.now()
        };

        detectedStreams[tabId].push(streamData);

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
          streamData.pageUrl = tab.url;
          streamData.pageTitle = tab.title;

          // Save to persistent storage
          await StorageManager.saveStream(streamData);

          // Show notification if enabled
          const settings = await StorageManager.getSettings();
          if (settings.notifications) {
            showNotification(streamInfo.name, url, tab.title);
          }
        }).catch(err => {
          console.error('Error getting tab info:', err);
        });
      }
    }
  },
  {urls: ["<all_urls>"]}
);

// Update badge with stream count
function updateBadge(tabId) {
  const count = detectedStreams[tabId] ? detectedStreams[tabId].length : 0;

  if (count > 0) {
    browser.browserAction.setBadgeText({
      text: count.toString(),
      tabId: tabId
    });
    browser.browserAction.setBadgeBackgroundColor({
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
});

// Clean up when tab is updated (navigates to new page)
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'loading') {
    detectedStreams[tabId] = [];
    browser.browserAction.setBadgeText({
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
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
      const tabId = tabs[0].id;
      const streams = detectedStreams[tabId] || [];
      sendResponse({streams: streams});
    });
    return true;
  }

  if (request.action === 'clearStreams') {
    const tabId = request.tabId;
    detectedStreams[tabId] = [];
    browser.browserAction.setBadgeText({
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
    fetch(request.url, { method: 'HEAD' })
      .then(response => {
        sendResponse({
          valid: response.ok,
          status: response.status,
          statusText: response.statusText
        });
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
          browser.browserAction.setBadgeText({
            text: '',
            tabId: tab.id
          });
        });
      });
    }

    sendResponse({success: true});
  }
});
