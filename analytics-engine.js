// Analytics Engine - Comprehensive statistics and performance tracking
// Provides detailed insights into downloads, streams, and user behavior

const AnalyticsEngine = {
  // Analytics data structure
  analytics: {
    downloads: {
      total: 0,
      totalSize: 0,
      totalDuration: 0,
      successful: 0,
      failed: 0,
      cancelled: 0,
      averageSpeed: 0,
      byCategory: {},
      byQuality: {},
      byDomain: {},
      byMethod: {},
      byDay: {},
      byWeek: {},
      byMonth: {}
    },
    streams: {
      total: 0,
      byType: {},
      byDomain: {},
      byCategory: {},
      detectedToday: 0,
      detectedThisWeek: 0,
      detectedThisMonth: 0
    },
    recordings: {
      total: 0,
      totalDuration: 0,
      totalSize: 0,
      byCategory: {},
      successful: 0,
      failed: 0
    },
    performance: {
      averageDownloadSpeed: 0,
      averageResponseTime: 0,
      peakDownloadSpeed: 0,
      slowestDownloadSpeed: 0,
      mostActiveHour: 0,
      mostActiveDay: 0,
      successRate: 0
    },
    usage: {
      totalSessions: 0,
      lastSessionDate: null,
      firstInstallDate: null,
      favoriteCategories: [],
      mostDownloadedDomain: null,
      preferredQuality: null
    }
  },

  // Initialize analytics engine
  async init() {
    // Load existing analytics
    const result = await browser.storage.local.get('analytics');
    if (result.analytics) {
      this.analytics = result.analytics;
    } else {
      // Set first install date
      this.analytics.usage.firstInstallDate = Date.now();
    }

    // Update last session
    this.analytics.usage.lastSessionDate = Date.now();
    this.analytics.usage.totalSessions++;

    await this.saveAnalytics();

    // Schedule periodic analytics updates
    setInterval(() => this.calculateDerivedMetrics(), 60000); // Every minute

    console.log('Analytics Engine initialized');
  },

  // Track download event
  async trackDownload(downloadData, status = 'completed') {
    try {
      this.analytics.downloads.total++;

      // Track by status
      if (status === 'completed') {
        this.analytics.downloads.successful++;

        // Track size and duration
        if (downloadData.totalBytes) {
          this.analytics.downloads.totalSize += downloadData.totalBytes;
        }
        if (downloadData.duration) {
          this.analytics.downloads.totalDuration += downloadData.duration;
        }

        // Track speed
        if (downloadData.speed) {
          this.updateSpeedMetrics(downloadData.speed);
        }

      } else if (status === 'failed') {
        this.analytics.downloads.failed++;
      } else if (status === 'cancelled') {
        this.analytics.downloads.cancelled++;
      }

      // Track by category
      const category = downloadData.category || 'unknown';
      this.incrementCounter(this.analytics.downloads.byCategory, category);

      // Track by quality
      const quality = this.extractQuality(downloadData);
      this.incrementCounter(this.analytics.downloads.byQuality, quality);

      // Track by domain
      const domain = downloadData.domain || 'unknown';
      this.incrementCounter(this.analytics.downloads.byDomain, domain);

      // Track by method
      const method = downloadData.method || 'native';
      this.incrementCounter(this.analytics.downloads.byMethod, method);

      // Track by time period
      this.trackByTimePeriod(downloadData.timestamp || Date.now());

      // Recalculate derived metrics
      this.calculateDerivedMetrics();

      await this.saveAnalytics();

    } catch (error) {
      console.error('Failed to track download:', error);
    }
  },

  // Track stream detection
  async trackStreamDetection(streamData) {
    try {
      this.analytics.streams.total++;

      // Track by type
      const type = streamData.type || 'unknown';
      this.incrementCounter(this.analytics.streams.byType, type);

      // Track by domain
      const domain = streamData.domain || 'unknown';
      this.incrementCounter(this.analytics.streams.byDomain, domain);

      // Track by category
      if (streamData.category) {
        this.incrementCounter(this.analytics.streams.byCategory, streamData.category);
      }

      // Track detection counts by period
      const now = Date.now();
      const today = this.getDateKey(now);
      const thisWeek = this.getWeekKey(now);
      const thisMonth = this.getMonthKey(now);

      if (this.isToday(now)) this.analytics.streams.detectedToday++;
      if (this.isThisWeek(now)) this.analytics.streams.detectedThisWeek++;
      if (this.isThisMonth(now)) this.analytics.streams.detectedThisMonth++;

      await this.saveAnalytics();

    } catch (error) {
      console.error('Failed to track stream detection:', error);
    }
  },

  // Track recording event
  async trackRecording(recordingData, status = 'completed') {
    try {
      this.analytics.recordings.total++;

      if (status === 'completed') {
        this.analytics.recordings.successful++;

        // Track duration and size
        if (recordingData.duration) {
          this.analytics.recordings.totalDuration += recordingData.duration;
        }
        if (recordingData.recordedSize) {
          this.analytics.recordings.totalSize += recordingData.recordedSize;
        }

      } else if (status === 'failed') {
        this.analytics.recordings.failed++;
      }

      // Track by category
      const category = recordingData.streamData?.category || 'unknown';
      this.incrementCounter(this.analytics.recordings.byCategory, category);

      await this.saveAnalytics();

    } catch (error) {
      console.error('Failed to track recording:', error);
    }
  },

  // Extract quality from download data
  extractQuality(downloadData) {
    if (downloadData.quality) {
      if (downloadData.quality.resolution) {
        return downloadData.quality.resolution;
      }
      if (downloadData.quality.height) {
        return `${downloadData.quality.height}p`;
      }
    }

    // Parse from filename
    const filename = downloadData.filename || '';
    const qualityMatch = filename.match(/(\d{3,4})p/);
    if (qualityMatch) {
      return qualityMatch[0];
    }

    return 'unknown';
  },

  // Update speed metrics
  updateSpeedMetrics(speed) {
    const speedMbps = (speed * 8) / (1024 * 1024); // Convert bytes/s to Mbps

    // Update average (running average)
    const count = this.analytics.downloads.successful || 1;
    const currentAvg = this.analytics.performance.averageDownloadSpeed;
    this.analytics.performance.averageDownloadSpeed =
      ((currentAvg * (count - 1)) + speedMbps) / count;

    // Update peak
    if (speedMbps > this.analytics.performance.peakDownloadSpeed) {
      this.analytics.performance.peakDownloadSpeed = speedMbps;
    }

    // Update slowest
    if (this.analytics.performance.slowestDownloadSpeed === 0 ||
        speedMbps < this.analytics.performance.slowestDownloadSpeed) {
      this.analytics.performance.slowestDownloadSpeed = speedMbps;
    }
  },

  // Track by time period
  trackByTimePeriod(timestamp) {
    const date = new Date(timestamp);

    // By day
    const dayKey = this.getDateKey(timestamp);
    this.incrementCounter(this.analytics.downloads.byDay, dayKey);

    // By week
    const weekKey = this.getWeekKey(timestamp);
    this.incrementCounter(this.analytics.downloads.byWeek, weekKey);

    // By month
    const monthKey = this.getMonthKey(timestamp);
    this.incrementCounter(this.analytics.downloads.byMonth, monthKey);

    // Track most active hour
    const hour = date.getHours();
    const hourCounts = {};
    Object.keys(this.analytics.downloads.byDay).forEach(day => {
      // This is simplified - in real implementation, store hour data separately
    });
  },

  // Calculate derived metrics
  calculateDerivedMetrics() {
    // Success rate
    const total = this.analytics.downloads.total || 1;
    this.analytics.performance.successRate =
      (this.analytics.downloads.successful / total) * 100;

    // Favorite categories
    const categoryTotals = [];
    for (const [category, count] of Object.entries(this.analytics.downloads.byCategory)) {
      categoryTotals.push({ category, count });
    }
    categoryTotals.sort((a, b) => b.count - a.count);
    this.analytics.usage.favoriteCategories = categoryTotals.slice(0, 5).map(c => c.category);

    // Most downloaded domain
    const domainTotals = [];
    for (const [domain, count] of Object.entries(this.analytics.downloads.byDomain)) {
      domainTotals.push({ domain, count });
    }
    domainTotals.sort((a, b) => b.count - a.count);
    this.analytics.usage.mostDownloadedDomain = domainTotals[0]?.domain || null;

    // Preferred quality
    const qualityTotals = [];
    for (const [quality, count] of Object.entries(this.analytics.downloads.byQuality)) {
      qualityTotals.push({ quality, count });
    }
    qualityTotals.sort((a, b) => b.count - a.count);
    this.analytics.usage.preferredQuality = qualityTotals[0]?.quality || null;
  },

  // Get analytics summary
  getAnalyticsSummary() {
    this.calculateDerivedMetrics();

    return {
      downloads: {
        ...this.analytics.downloads,
        totalSizeFormatted: this.formatBytes(this.analytics.downloads.totalSize),
        totalDurationFormatted: this.formatDuration(this.analytics.downloads.totalDuration),
        averageSpeedFormatted: `${this.analytics.performance.averageDownloadSpeed.toFixed(2)} Mbps`
      },
      streams: { ...this.analytics.streams },
      recordings: {
        ...this.analytics.recordings,
        totalSizeFormatted: this.formatBytes(this.analytics.recordings.totalSize),
        totalDurationFormatted: this.formatDuration(this.analytics.recordings.totalDuration)
      },
      performance: { ...this.analytics.performance },
      usage: { ...this.analytics.usage }
    };
  },

  // Get detailed breakdown by category
  getCategoryBreakdown() {
    const breakdown = [];

    for (const [category, count] of Object.entries(this.analytics.downloads.byCategory)) {
      const percentage = (count / this.analytics.downloads.total) * 100;
      breakdown.push({
        category: category,
        count: count,
        percentage: percentage.toFixed(1),
        displayName: MetadataExtractor?.getCategoryDisplayName?.(category) || category,
        color: MetadataExtractor?.getCategoryColor?.(category) || '#6c757d'
      });
    }

    // Sort by count
    breakdown.sort((a, b) => b.count - a.count);

    return breakdown;
  },

  // Get quality distribution
  getQualityDistribution() {
    const distribution = [];

    for (const [quality, count] of Object.entries(this.analytics.downloads.byQuality)) {
      const percentage = (count / this.analytics.downloads.total) * 100;
      distribution.push({
        quality: quality,
        count: count,
        percentage: percentage.toFixed(1)
      });
    }

    // Sort by quality (highest to lowest)
    distribution.sort((a, b) => {
      const aHeight = parseInt(a.quality) || 0;
      const bHeight = parseInt(b.quality) || 0;
      return bHeight - aHeight;
    });

    return distribution;
  },

  // Get domain statistics
  getDomainStats() {
    const stats = [];

    for (const [domain, count] of Object.entries(this.analytics.downloads.byDomain)) {
      const percentage = (count / this.analytics.downloads.total) * 100;
      stats.push({
        domain: domain,
        count: count,
        percentage: percentage.toFixed(1)
      });
    }

    // Sort by count
    stats.sort((a, b) => b.count - a.count);

    return stats.slice(0, 10); // Top 10
  },

  // Get time-based trends
  getTimeTrends(period = 'day') {
    let data = {};

    if (period === 'day') {
      data = this.analytics.downloads.byDay;
    } else if (period === 'week') {
      data = this.analytics.downloads.byWeek;
    } else if (period === 'month') {
      data = this.analytics.downloads.byMonth;
    }

    const trends = [];
    for (const [dateKey, count] of Object.entries(data)) {
      trends.push({
        date: dateKey,
        count: count
      });
    }

    // Sort by date
    trends.sort((a, b) => a.date.localeCompare(b.date));

    return trends;
  },

  // Get performance metrics
  getPerformanceMetrics() {
    return {
      averageSpeed: `${this.analytics.performance.averageDownloadSpeed.toFixed(2)} Mbps`,
      peakSpeed: `${this.analytics.performance.peakDownloadSpeed.toFixed(2)} Mbps`,
      slowestSpeed: `${this.analytics.performance.slowestDownloadSpeed.toFixed(2)} Mbps`,
      successRate: `${this.analytics.performance.successRate.toFixed(1)}%`,
      totalDownloads: this.analytics.downloads.total,
      successful: this.analytics.downloads.successful,
      failed: this.analytics.downloads.failed
    };
  },

  // Reset analytics
  async resetAnalytics() {
    const firstInstallDate = this.analytics.usage.firstInstallDate;

    this.analytics = {
      downloads: {
        total: 0,
        totalSize: 0,
        totalDuration: 0,
        successful: 0,
        failed: 0,
        cancelled: 0,
        averageSpeed: 0,
        byCategory: {},
        byQuality: {},
        byDomain: {},
        byMethod: {},
        byDay: {},
        byWeek: {},
        byMonth: {}
      },
      streams: {
        total: 0,
        byType: {},
        byDomain: {},
        byCategory: {},
        detectedToday: 0,
        detectedThisWeek: 0,
        detectedThisMonth: 0
      },
      recordings: {
        total: 0,
        totalDuration: 0,
        totalSize: 0,
        byCategory: {},
        successful: 0,
        failed: 0
      },
      performance: {
        averageDownloadSpeed: 0,
        averageResponseTime: 0,
        peakDownloadSpeed: 0,
        slowestDownloadSpeed: 0,
        mostActiveHour: 0,
        mostActiveDay: 0,
        successRate: 0
      },
      usage: {
        totalSessions: 1,
        lastSessionDate: Date.now(),
        firstInstallDate: firstInstallDate,
        favoriteCategories: [],
        mostDownloadedDomain: null,
        preferredQuality: null
      }
    };

    await this.saveAnalytics();
  },

  // Helper: Increment counter in object
  incrementCounter(obj, key) {
    if (!obj[key]) {
      obj[key] = 0;
    }
    obj[key]++;
  },

  // Helper: Get date key (YYYY-MM-DD)
  getDateKey(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 10);
  },

  // Helper: Get week key (YYYY-WXX)
  getWeekKey(timestamp) {
    const date = new Date(timestamp);
    const week = this.getWeekNumber(date);
    return `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;
  },

  // Helper: Get month key (YYYY-MM)
  getMonthKey(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 7);
  },

  // Helper: Get week number
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  },

  // Helper: Check if timestamp is today
  isToday(timestamp) {
    const today = this.getDateKey(Date.now());
    const dateKey = this.getDateKey(timestamp);
    return today === dateKey;
  },

  // Helper: Check if timestamp is this week
  isThisWeek(timestamp) {
    const thisWeek = this.getWeekKey(Date.now());
    const weekKey = this.getWeekKey(timestamp);
    return thisWeek === weekKey;
  },

  // Helper: Check if timestamp is this month
  isThisMonth(timestamp) {
    const thisMonth = this.getMonthKey(Date.now());
    const monthKey = this.getMonthKey(timestamp);
    return thisMonth === monthKey;
  },

  // Helper: Format bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Helper: Format duration
  formatDuration(milliseconds) {
    if (!milliseconds) return '0s';
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  },

  // Save analytics to storage
  async saveAnalytics() {
    await browser.storage.local.set({ analytics: this.analytics });
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  AnalyticsEngine.init().catch(console.error);
}
