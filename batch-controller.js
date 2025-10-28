// Batch Download Controller - Manage multiple simultaneous downloads
// Handles queue priority, concurrency limits, and batch operations

const BatchController = {
  // Batch download state
  selectedStreams: new Set(), // Set of stream URLs selected for batch download
  batchQueue: [], // Array of batch download items
  maxConcurrent: 3, // Maximum simultaneous downloads
  activeBatchDownloads: 0,

  // Priority levels
  Priority: {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    URGENT: 3
  },

  // Initialize batch controller
  async init() {
    // Load settings
    const result = await browser.storage.local.get('batchSettings');
    if (result.batchSettings) {
      this.maxConcurrent = result.batchSettings.maxConcurrent || 3;
    }

    // Load saved batch queue
    const queueResult = await browser.storage.local.get('batchQueue');
    if (queueResult.batchQueue) {
      this.batchQueue = queueResult.batchQueue;
    }

    console.log('Batch Controller initialized');
  },

  // Select/deselect stream for batch download
  toggleStreamSelection(streamUrl, selected) {
    if (selected) {
      this.selectedStreams.add(streamUrl);
    } else {
      this.selectedStreams.delete(streamUrl);
    }

    // Notify UI
    this.notifySelectionChanged();

    return {
      success: true,
      selectedCount: this.selectedStreams.size,
      isSelected: this.selectedStreams.has(streamUrl)
    };
  },

  // Select all streams on current page
  selectAllStreams(streamUrls) {
    streamUrls.forEach(url => this.selectedStreams.add(url));
    this.notifySelectionChanged();

    return {
      success: true,
      selectedCount: this.selectedStreams.size
    };
  },

  // Clear all selections
  clearSelection() {
    this.selectedStreams.clear();
    this.notifySelectionChanged();

    return {
      success: true,
      selectedCount: 0
    };
  },

  // Get selected stream count
  getSelectionCount() {
    return this.selectedStreams.size;
  },

  // Check if stream is selected
  isStreamSelected(streamUrl) {
    return this.selectedStreams.has(streamUrl);
  },

  // Start batch download of selected streams
  async startBatchDownload(streams, options = {}) {
    try {
      if (this.selectedStreams.size === 0) {
        return { success: false, error: 'No streams selected' };
      }

      // Filter to only selected streams
      const selectedStreamData = streams.filter(s => this.selectedStreams.has(s.url));

      if (selectedStreamData.length === 0) {
        return { success: false, error: 'Selected streams not found' };
      }

      // Create batch download items
      const batchId = `batch_${Date.now()}`;
      const priority = options.priority || this.Priority.NORMAL;

      const batchItems = selectedStreamData.map((streamData, index) => ({
        batchId: batchId,
        streamData: streamData,
        priority: priority,
        index: index,
        quality: options.quality || null,
        method: options.method || 'auto',
        state: 'queued',
        downloadId: null
      }));

      // Add to batch queue
      this.batchQueue.push(...batchItems);

      // Sort queue by priority
      this.sortQueue();

      // Save queue
      await this.saveBatchQueue();

      // Start processing queue
      this.processQueue();

      // Clear selection after starting batch
      this.clearSelection();

      // Show notification
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '📦 Batch Download Started',
        message: `Queued ${batchItems.length} streams for download`
      });

      return {
        success: true,
        batchId: batchId,
        count: batchItems.length
      };

    } catch (error) {
      return ErrorHandler.handleError(error, { source: 'batch-controller', action: 'start' });
    }
  },

  // Download all streams from current page (without selection)
  async downloadAllFromPage(streams, options = {}) {
    try {
      if (streams.length === 0) {
        return { success: false, error: 'No streams found on page' };
      }

      // Select all streams
      streams.forEach(s => this.selectedStreams.add(s.url));

      // Start batch download
      const result = await this.startBatchDownload(streams, options);

      return result;

    } catch (error) {
      return ErrorHandler.handleError(error, { source: 'batch-controller', action: 'downloadAll' });
    }
  },

  // Process download queue
  async processQueue() {
    // Check if we can start more downloads
    while (this.activeBatchDownloads < this.maxConcurrent && this.batchQueue.length > 0) {
      // Get next queued item
      const item = this.batchQueue.find(i => i.state === 'queued');

      if (!item) break;

      // Start download
      item.state = 'downloading';
      this.activeBatchDownloads++;

      try {
        // Add to DownloadManager
        const downloadResult = await DownloadManager.addToQueue(
          item.streamData,
          item.quality,
          item.method
        );

        if (downloadResult) {
          item.downloadId = downloadResult.id;
          item.state = 'downloading';
        } else {
          item.state = 'failed';
          item.error = 'Failed to start download';
          this.activeBatchDownloads--;
        }

      } catch (error) {
        item.state = 'failed';
        item.error = error.message;
        this.activeBatchDownloads--;
      }

      // Save queue state
      await this.saveBatchQueue();

      // Notify UI
      this.notifyQueueUpdate();
    }
  },

  // Handle download completion (called by DownloadManager)
  async onDownloadComplete(downloadId) {
    // Find batch item
    const item = this.batchQueue.find(i => i.downloadId === downloadId);

    if (item) {
      item.state = 'completed';
      this.activeBatchDownloads--;

      // Remove from queue after delay
      setTimeout(() => {
        this.removeBatchItem(item);
      }, 5000);

      await this.saveBatchQueue();
      this.notifyQueueUpdate();

      // Process next in queue
      this.processQueue();
    }
  },

  // Handle download failure
  async onDownloadFailed(downloadId, error) {
    // Find batch item
    const item = this.batchQueue.find(i => i.downloadId === downloadId);

    if (item) {
      item.state = 'failed';
      item.error = error;
      this.activeBatchDownloads--;

      await this.saveBatchQueue();
      this.notifyQueueUpdate();

      // Process next in queue
      this.processQueue();
    }
  },

  // Pause entire batch
  async pauseBatch(batchId) {
    const batchItems = this.batchQueue.filter(i => i.batchId === batchId);

    for (const item of batchItems) {
      if (item.state === 'downloading' && item.downloadId) {
        await DownloadManager.pauseDownload(item.downloadId);
        item.state = 'paused';
      } else if (item.state === 'queued') {
        item.state = 'paused';
      }
    }

    await this.saveBatchQueue();
    this.notifyQueueUpdate();

    return { success: true };
  },

  // Resume entire batch
  async resumeBatch(batchId) {
    const batchItems = this.batchQueue.filter(i => i.batchId === batchId);

    for (const item of batchItems) {
      if (item.state === 'paused') {
        if (item.downloadId) {
          await DownloadManager.resumeDownload(item.downloadId);
        }
        item.state = 'queued';
      }
    }

    await this.saveBatchQueue();
    this.notifyQueueUpdate();

    // Process queue to start downloads
    this.processQueue();

    return { success: true };
  },

  // Cancel entire batch
  async cancelBatch(batchId) {
    const batchItems = this.batchQueue.filter(i => i.batchId === batchId);

    for (const item of batchItems) {
      if (item.downloadId) {
        await DownloadManager.cancelDownload(item.downloadId);
      }
    }

    // Remove batch items from queue
    this.batchQueue = this.batchQueue.filter(i => i.batchId !== batchId);

    await this.saveBatchQueue();
    this.notifyQueueUpdate();

    return { success: true };
  },

  // Set priority for batch
  async setBatchPriority(batchId, priority) {
    const batchItems = this.batchQueue.filter(i => i.batchId === batchId);

    batchItems.forEach(item => {
      item.priority = priority;
    });

    // Re-sort queue
    this.sortQueue();

    await this.saveBatchQueue();
    this.notifyQueueUpdate();

    return { success: true };
  },

  // Sort queue by priority
  sortQueue() {
    this.batchQueue.sort((a, b) => {
      // First by priority (high to low)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Then by index (preserve order within same priority)
      return a.index - b.index;
    });
  },

  // Remove batch item from queue
  removeBatchItem(item) {
    const index = this.batchQueue.indexOf(item);
    if (index > -1) {
      this.batchQueue.splice(index, 1);
      this.saveBatchQueue();
      this.notifyQueueUpdate();
    }
  },

  // Get batch statistics
  getBatchStats(batchId) {
    const batchItems = this.batchQueue.filter(i => i.batchId === batchId);

    const stats = {
      total: batchItems.length,
      queued: batchItems.filter(i => i.state === 'queued').length,
      downloading: batchItems.filter(i => i.state === 'downloading').length,
      completed: batchItems.filter(i => i.state === 'completed').length,
      failed: batchItems.filter(i => i.state === 'failed').length,
      paused: batchItems.filter(i => i.state === 'paused').length
    };

    stats.progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return stats;
  },

  // Get all batches
  getAllBatches() {
    const batchIds = [...new Set(this.batchQueue.map(i => i.batchId))];

    return batchIds.map(batchId => {
      const items = this.batchQueue.filter(i => i.batchId === batchId);
      const stats = this.getBatchStats(batchId);

      return {
        batchId: batchId,
        items: items,
        stats: stats,
        priority: items[0]?.priority || this.Priority.NORMAL,
        createdAt: parseInt(batchId.split('_')[1])
      };
    });
  },

  // Update concurrent download limit
  async setMaxConcurrent(limit) {
    if (limit < 1 || limit > 10) {
      return { success: false, error: 'Limit must be between 1 and 10' };
    }

    this.maxConcurrent = limit;

    // Save settings
    await browser.storage.local.set({
      batchSettings: {
        maxConcurrent: limit
      }
    });

    // Process queue with new limit
    this.processQueue();

    return { success: true, maxConcurrent: limit };
  },

  // Get current settings
  getSettings() {
    return {
      maxConcurrent: this.maxConcurrent,
      selectedCount: this.selectedStreams.size,
      activeBatchDownloads: this.activeBatchDownloads,
      queueLength: this.batchQueue.length
    };
  },

  // Clear completed batches
  async clearCompletedBatches() {
    // Get completed batch IDs
    const completedBatchIds = [...new Set(
      this.batchQueue
        .filter(i => i.state === 'completed')
        .map(i => i.batchId)
    )];

    // Check if entire batch is completed
    completedBatchIds.forEach(batchId => {
      const batchItems = this.batchQueue.filter(i => i.batchId === batchId);
      const allCompleted = batchItems.every(i => i.state === 'completed');

      if (allCompleted) {
        this.batchQueue = this.batchQueue.filter(i => i.batchId !== batchId);
      }
    });

    await this.saveBatchQueue();
    this.notifyQueueUpdate();

    return { success: true };
  },

  // Save batch queue to storage
  async saveBatchQueue() {
    await browser.storage.local.set({ batchQueue: this.batchQueue });
  },

  // Notification methods
  notifySelectionChanged() {
    browser.runtime.sendMessage({
      action: 'batchSelectionChanged',
      selectedCount: this.selectedStreams.size
    }).catch(() => {});
  },

  notifyQueueUpdate() {
    browser.runtime.sendMessage({
      action: 'batchQueueUpdate',
      batches: this.getAllBatches(),
      settings: this.getSettings()
    }).catch(() => {});
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  BatchController.init().catch(console.error);
}
