// Download Manager - Handles all download operations for Stream Sniper

// ==================== DOWNLOAD ITEM CLASS ====================
class DownloadItem {
  constructor(streamData, quality = null) {
    this.id = this.generateId();
    this.url = streamData.url;
    this.type = streamData.type;
    this.domain = streamData.domain;
    this.pageTitle = streamData.pageTitle || 'Unknown';
    this.pageUrl = streamData.pageUrl || '';
    this.quality = quality;
    this.filename = null; // Will be set asynchronously
    this.state = 'queued'; // queued, downloading, completed, failed, cancelled, paused
    this.progress = 0; // 0-100
    this.bytesReceived = 0;
    this.totalBytes = 0;
    this.speed = 0; // bytes per second
    this.eta = 0; // seconds remaining
    this.error = null;
    this.downloadId = null; // Browser download ID or yt-dlp process ID
    this.method = 'native'; // 'native' or 'ytdlp'
    this.timestamp = Date.now();
    this.startTime = null;
    this.endTime = null;

    // Initialize filename asynchronously
    this.generateFilename(streamData, quality).then(filename => {
      this.filename = filename;
    }).catch(error => {
      console.error('Error generating filename:', error);
      this.filename = this.generateDefaultFilename(streamData, quality, this.getExtension(streamData.type));
    });
  }

  generateId() {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async generateFilename(streamData, quality) {
    // Load template settings
    const result = await browser.storage.local.get('downloadSettings');
    const settings = result.downloadSettings || {};

    // Extension based on type
    const extension = this.getExtension(streamData.type);

    // If custom templates not enabled, use default format
    if (!settings.useCustomFilenameTemplate) {
      return this.generateDefaultFilename(streamData, quality, extension);
    }

    try {
      // Get template string
      let template;
      if (settings.filenameTemplatePreset === 'custom') {
        template = settings.customFilenameTemplate || '{domain}_{title}_{quality}_{date}';
      } else {
        // Use preset template
        const presets = {
          'default': '{domain}_{title}_{quality}_{date}',
          'simple': '{title}_{quality}',
          'dated': '{date}_{time}_{title}',
          'organized': '{domain}/{date}_{title}_{quality}'
        };
        template = presets[settings.filenameTemplatePreset] || presets['default'];
      }

      // Build template data
      const domainParts = streamData.domain.split('.');
      const siteName = domainParts[domainParts.length - 2] || 'stream';
      const title = (streamData.pageTitle || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const qualityStr = quality ? (quality.resolution || quality.bitrate || 'default') : 'default';
      const now = new Date();

      const templateData = {
        title: title,
        domain: siteName,
        quality: qualityStr,
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 8).replace(/:/g, '-'),
        type: streamData.type || 'stream',
        timestamp: Date.now().toString()
      };

      // Replace template variables
      let filename = template;
      for (const [key, value] of Object.entries(templateData)) {
        filename = filename.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }

      // Sanitize filename
      filename = filename.replace(/[^a-z0-9\-_./]/gi, '_');

      return `${filename}.${extension}`;

    } catch (error) {
      console.error('Error generating filename from template:', error);
      return this.generateDefaultFilename(streamData, quality, extension);
    }
  }

  generateDefaultFilename(streamData, quality, extension) {
    // Extract domain name without TLD
    const domainParts = streamData.domain.split('.');
    const siteName = domainParts[domainParts.length - 2] || 'stream';

    // Sanitize page title
    let title = streamData.pageTitle || 'video';
    title = title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

    // Quality string
    const qualityStr = quality ? `_${quality.resolution || quality.bitrate || 'default'}` : '';

    // Date string
    const date = new Date().toISOString().slice(0, 10);

    return `${siteName}_${title}${qualityStr}_${date}.${extension}`;
  }

  getExtension(type) {
    const extensionMap = {
      'm3u8': 'mp4',
      'm3u': 'mp4',
      'mpd': 'mp4',
      'ism': 'mp4',
      'ismc': 'mp4'
    };
    return extensionMap[type] || 'mp4';
  }

  updateProgress(bytesReceived, totalBytes) {
    this.bytesReceived = bytesReceived;
    this.totalBytes = totalBytes;
    this.progress = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;
  }

  updateSpeed(speed) {
    this.speed = speed;
    if (speed > 0 && this.totalBytes > 0) {
      const remainingBytes = this.totalBytes - this.bytesReceived;
      this.eta = Math.round(remainingBytes / speed);
    }
  }

  setState(state, error = null) {
    this.state = state;
    this.error = error;

    if (state === 'downloading' && !this.startTime) {
      this.startTime = Date.now();
    } else if (['completed', 'failed', 'cancelled'].includes(state)) {
      this.endTime = Date.now();
    }
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      type: this.type,
      domain: this.domain,
      pageTitle: this.pageTitle,
      pageUrl: this.pageUrl,
      quality: this.quality,
      filename: this.filename,
      state: this.state,
      progress: this.progress,
      bytesReceived: this.bytesReceived,
      totalBytes: this.totalBytes,
      speed: this.speed,
      eta: this.eta,
      error: this.error,
      method: this.method,
      timestamp: this.timestamp,
      startTime: this.startTime,
      endTime: this.endTime
    };
  }
}

// ==================== NATIVE DOWNLOADER CLASS ====================
class NativeDownloader {
  constructor() {
    this.activeDownloads = new Map(); // downloadId -> DownloadItem
    this.setupListeners();
  }

  setupListeners() {
    // Listen for download progress
    if (browser.downloads && browser.downloads.onChanged) {
      browser.downloads.onChanged.addListener((delta) => {
        this.handleDownloadChange(delta);
      });
    }
  }

  async download(downloadItem) {
    try {
      downloadItem.setState('downloading');
      downloadItem.method = 'native';

      // Start download using browser API
      const downloadId = await browser.downloads.download({
        url: downloadItem.url,
        filename: downloadItem.filename,
        saveAs: false, // Don't prompt for save location
        conflictAction: 'uniquify' // Auto-rename if file exists
      });

      downloadItem.downloadId = downloadId;
      this.activeDownloads.set(downloadId, downloadItem);

      return { success: true, downloadId };

    } catch (error) {
      console.error('Native download failed:', error);
      downloadItem.setState('failed', error.message);
      return { success: false, error: error.message };
    }
  }

  async handleDownloadChange(delta) {
    const downloadId = delta.id;
    const downloadItem = this.activeDownloads.get(downloadId);

    if (!downloadItem) return;

    // Update state
    if (delta.state) {
      if (delta.state.current === 'complete') {
        downloadItem.setState('completed');
        downloadItem.progress = 100;
        this.notifyCompletion(downloadItem);
        this.activeDownloads.delete(downloadId);

        // Save to download history
        await DownloadManager.saveToHistory(downloadItem);

      } else if (delta.state.current === 'interrupted') {
        const error = delta.error ? delta.error.current : 'Download interrupted';
        downloadItem.setState('failed', error);
        this.notifyFailure(downloadItem);
        this.activeDownloads.delete(downloadId);
      }
    }

    // Update progress
    if (delta.bytesReceived && delta.bytesReceived.current !== undefined) {
      const bytesReceived = delta.bytesReceived.current;

      // Get total size if available
      const downloadInfo = await browser.downloads.search({ id: downloadId });
      if (downloadInfo && downloadInfo.length > 0) {
        const totalBytes = downloadInfo[0].totalBytes || 0;
        downloadItem.updateProgress(bytesReceived, totalBytes);

        // Calculate speed
        if (downloadItem.startTime) {
          const elapsedSeconds = (Date.now() - downloadItem.startTime) / 1000;
          const speed = bytesReceived / elapsedSeconds;
          downloadItem.updateSpeed(speed);
        }
      }

      // Notify listeners about progress
      this.notifyProgress(downloadItem);
    }
  }

  async pause(downloadItem) {
    try {
      if (downloadItem.downloadId) {
        await browser.downloads.pause(downloadItem.downloadId);
        downloadItem.setState('paused');
        return { success: true };
      }
    } catch (error) {
      console.error('Failed to pause download:', error);
      return { success: false, error: error.message };
    }
  }

  async resume(downloadItem) {
    try {
      if (downloadItem.downloadId) {
        await browser.downloads.resume(downloadItem.downloadId);
        downloadItem.setState('downloading');
        return { success: true };
      }
    } catch (error) {
      console.error('Failed to resume download:', error);
      return { success: false, error: error.message };
    }
  }

  async cancel(downloadItem) {
    try {
      if (downloadItem.downloadId) {
        await browser.downloads.cancel(downloadItem.downloadId);
        downloadItem.setState('cancelled');
        this.activeDownloads.delete(downloadItem.downloadId);
        return { success: true };
      }
    } catch (error) {
      console.error('Failed to cancel download:', error);
      return { success: false, error: error.message };
    }
  }

  notifyProgress(downloadItem) {
    // Send message to UI to update progress
    browser.runtime.sendMessage({
      action: 'downloadProgress',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {
      // Popup might be closed, that's okay
    });
  }

  notifyCompletion(downloadItem) {
    // Show notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Download Complete',
      message: `${downloadItem.filename} has finished downloading.`
    });

    // Send message to UI
    browser.runtime.sendMessage({
      action: 'downloadComplete',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {});

    // Notify BatchController if available
    if (typeof BatchController !== 'undefined') {
      BatchController.onDownloadComplete(downloadItem.id);
    }
  }

  notifyFailure(downloadItem) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Download Failed',
      message: `Failed to download ${downloadItem.filename}: ${downloadItem.error}`
    });

    browser.runtime.sendMessage({
      action: 'downloadFailed',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {});

    // Notify BatchController if available
    if (typeof BatchController !== 'undefined') {
      BatchController.onDownloadFailed(downloadItem.id, downloadItem.error);
    }
  }
}

// ==================== YT-DLP DOWNLOADER CLASS ====================
class YtDlpDownloader {
  constructor() {
    this.nativePort = null;
    this.available = false;
    this.checkAvailability();
  }

  async checkAvailability() {
    try {
      // Try to connect to native messaging host
      const port = browser.runtime.connectNative('com.streamsniper.ytdlp');

      port.onMessage.addListener((message) => {
        if (message.type === 'ready') {
          this.available = true;
        }
      });

      port.onDisconnect.addListener(() => {
        this.available = false;
      });

      this.nativePort = port;

      // Send ready check
      port.postMessage({ type: 'check' });

    } catch (error) {
      console.log('yt-dlp native host not available:', error);
      this.available = false;
    }
  }

  async download(downloadItem) {
    if (!this.available) {
      return {
        success: false,
        error: 'yt-dlp is not installed or configured. Please run the setup wizard.'
      };
    }

    try {
      downloadItem.setState('downloading');
      downloadItem.method = 'ytdlp';

      // Build yt-dlp command
      const command = {
        type: 'download',
        url: downloadItem.url,
        output: downloadItem.filename,
        format: downloadItem.quality ? downloadItem.quality.id : 'best',
        downloadId: downloadItem.id
      };

      // Send command to native host
      this.nativePort.postMessage(command);

      // Listen for progress updates
      const progressListener = (message) => {
        if (message.downloadId === downloadItem.id) {
          this.handleYtDlpProgress(message, downloadItem);
        }
      };

      this.nativePort.onMessage.addListener(progressListener);

      return { success: true, downloadId: downloadItem.id };

    } catch (error) {
      console.error('yt-dlp download failed:', error);
      downloadItem.setState('failed', error.message);
      return { success: false, error: error.message };
    }
  }

  handleYtDlpProgress(message, downloadItem) {
    switch (message.type) {
      case 'progress':
        downloadItem.progress = message.progress || 0;
        downloadItem.speed = message.speed || 0;
        downloadItem.eta = message.eta || 0;
        this.notifyProgress(downloadItem);
        break;

      case 'complete':
        downloadItem.setState('completed');
        downloadItem.progress = 100;
        this.notifyCompletion(downloadItem);
        DownloadManager.saveToHistory(downloadItem);
        break;

      case 'error':
        downloadItem.setState('failed', message.error);
        this.notifyFailure(downloadItem);
        break;
    }
  }

  notifyProgress(downloadItem) {
    browser.runtime.sendMessage({
      action: 'downloadProgress',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {});
  }

  notifyCompletion(downloadItem) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Download Complete',
      message: `${downloadItem.filename} has finished downloading.`
    });

    browser.runtime.sendMessage({
      action: 'downloadComplete',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {});
  }

  notifyFailure(downloadItem) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Download Failed',
      message: `Failed to download ${downloadItem.filename}: ${downloadItem.error}`
    });

    browser.runtime.sendMessage({
      action: 'downloadFailed',
      downloadId: downloadItem.id,
      data: downloadItem.toJSON()
    }).catch(() => {});

    // Notify BatchController if available
    if (typeof BatchController !== 'undefined') {
      BatchController.onDownloadFailed(downloadItem.id, downloadItem.error);
    }
  }
}

// ==================== DOWNLOAD MANAGER (MAIN) ====================
const DownloadManager = {
  nativeDownloader: new NativeDownloader(),
  ytdlpDownloader: new YtDlpDownloader(),
  downloadQueue: [],

  // Initialize download manager
  async init() {
    // Load existing queue from storage
    const result = await browser.storage.local.get('downloadQueue');
    if (result.downloadQueue) {
      this.downloadQueue = result.downloadQueue.map(data => {
        const item = Object.assign(new DownloadItem({
          url: data.url,
          type: data.type,
          domain: data.domain,
          pageTitle: data.pageTitle
        }), data);
        return item;
      });
    }

    // Resume any interrupted downloads
    await this.resumeInterruptedDownloads();
  },

  // Add download to queue
  async addToQueue(streamData, quality = null, method = 'auto') {
    const downloadItem = new DownloadItem(streamData, quality);

    // Determine download method
    if (method === 'auto') {
      // Use yt-dlp for complex streams, native for simple ones
      method = (streamData.type === 'mpd' || quality) ? 'ytdlp' : 'native';

      // Fall back to native if yt-dlp not available
      if (method === 'ytdlp' && !this.ytdlpDownloader.available) {
        method = 'native';
      }
    }

    downloadItem.method = method;
    this.downloadQueue.push(downloadItem);

    // Save queue to storage
    await this.saveQueue();

    // Start download immediately
    await this.startDownload(downloadItem);

    return downloadItem;
  },

  // Start a specific download
  async startDownload(downloadItem) {
    if (downloadItem.method === 'ytdlp' && this.ytdlpDownloader.available) {
      return await this.ytdlpDownloader.download(downloadItem);
    } else {
      return await this.nativeDownloader.download(downloadItem);
    }
  },

  // Pause download
  async pauseDownload(downloadId) {
    const downloadItem = this.findDownload(downloadId);
    if (!downloadItem) return { success: false, error: 'Download not found' };

    if (downloadItem.method === 'native') {
      return await this.nativeDownloader.pause(downloadItem);
    } else {
      // yt-dlp doesn't support pause/resume easily
      return { success: false, error: 'Pause not supported for yt-dlp downloads' };
    }
  },

  // Resume download
  async resumeDownload(downloadId) {
    const downloadItem = this.findDownload(downloadId);
    if (!downloadItem) return { success: false, error: 'Download not found' };

    if (downloadItem.method === 'native') {
      return await this.nativeDownloader.resume(downloadItem);
    } else {
      return await this.startDownload(downloadItem);
    }
  },

  // Cancel download
  async cancelDownload(downloadId) {
    const downloadItem = this.findDownload(downloadId);
    if (!downloadItem) return { success: false, error: 'Download not found' };

    let result;
    if (downloadItem.method === 'native') {
      result = await this.nativeDownloader.cancel(downloadItem);
    } else {
      // Send cancel message to yt-dlp
      downloadItem.setState('cancelled');
      result = { success: true };
    }

    // Remove from queue
    this.downloadQueue = this.downloadQueue.filter(item => item.id !== downloadId);
    await this.saveQueue();

    return result;
  },

  // Retry failed download
  async retryDownload(downloadId) {
    const downloadItem = this.findDownload(downloadId);
    if (!downloadItem) return { success: false, error: 'Download not found' };

    downloadItem.setState('queued');
    downloadItem.error = null;
    downloadItem.progress = 0;
    downloadItem.downloadId = null;

    return await this.startDownload(downloadItem);
  },

  // Clear completed downloads
  async clearCompleted() {
    this.downloadQueue = this.downloadQueue.filter(
      item => !['completed', 'failed', 'cancelled'].includes(item.state)
    );
    await this.saveQueue();
  },

  // Get all downloads
  getDownloads() {
    return this.downloadQueue.map(item => item.toJSON());
  },

  // Get active downloads
  getActiveDownloads() {
    return this.downloadQueue.filter(
      item => ['queued', 'downloading', 'paused'].includes(item.state)
    ).map(item => item.toJSON());
  },

  // Find download by ID
  findDownload(downloadId) {
    return this.downloadQueue.find(item => item.id === downloadId);
  },

  // Save queue to storage
  async saveQueue() {
    await browser.storage.local.set({
      downloadQueue: this.downloadQueue.map(item => item.toJSON())
    });
  },

  // Save completed download to history
  async saveToHistory(downloadItem) {
    const result = await browser.storage.local.get('downloadHistory');
    const history = result.downloadHistory || [];

    history.unshift(downloadItem.toJSON());

    // Keep only last 200 downloads in history
    if (history.length > 200) {
      history.length = 200;
    }

    await browser.storage.local.set({ downloadHistory: history });
  },

  // Resume interrupted downloads after extension restart
  async resumeInterruptedDownloads() {
    const interrupted = this.downloadQueue.filter(
      item => item.state === 'downloading' || item.state === 'queued'
    );

    for (const item of interrupted) {
      // Reset to queued state
      item.setState('queued');
      // Will be started by user action or auto-resume
    }

    await this.saveQueue();
  },

  // Check if yt-dlp is available
  isYtDlpAvailable() {
    return this.ytdlpDownloader.available;
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  DownloadManager.init().catch(console.error);
}
