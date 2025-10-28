// Import scripts for MV3 service worker compatibility
if (typeof importScripts === 'function') {
  importScripts('browser-polyfill.js', 'manifest-parser.js', 'download-manager.js');
}

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
      autoPreview: true,
      previewQuality: 'medium'
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

// Check if URL is a YouTube stream (manifest/master playlist)
function isYouTubeStream(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // Check for YouTube/Google Video domains
    const isYouTubeDomain =
      hostname.includes('googlevideo.com') ||
      hostname.includes('youtube.com');

    if (!isYouTubeDomain) return false;

    // Check for manifest paths (master playlists only, not individual segments)
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

      // Check if already detected in current session (normalize YouTube URLs for comparison)
      const normalizedUrl = normalizeYouTubeURL(url);
      const alreadyDetected = detectedStreams[tabId].some(s =>
        normalizeYouTubeURL(s.url) === normalizedUrl
      );

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

          // Save to persistent storage
          await StorageManager.saveStream(streamData);

          // Track stream detection in analytics
          if (typeof AnalyticsEngine !== 'undefined') {
            AnalyticsEngine.trackStreamDetection(streamData).catch(err => {
              console.log('Analytics tracking failed (non-critical):', err);
            });
          }

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
          browser.browserAction.setBadgeText({
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
