// Storage Manager - Handles persistent storage for streams and statistics

const StorageManager = {
  // Storage keys
  KEYS: {
    HISTORY: 'streamHistory',
    STATS: 'streamStats',
    SESSION_COUNT: 'sessionCount',
    FAVORITES: 'streamFavorites'
  },

  // Initialize storage
  async init() {
    const result = await browser.storage.local.get([this.KEYS.STATS, this.KEYS.SESSION_COUNT]);

    if (!result[this.KEYS.STATS]) {
      await this.resetStats();
    }

    if (!result[this.KEYS.SESSION_COUNT]) {
      await browser.storage.local.set({ [this.KEYS.SESSION_COUNT]: 0 });
    }
  },

  // Save stream to history
  async saveStream(streamData) {
    const history = await this.getHistory();

    // Check if stream already exists (avoid duplicates)
    const exists = history.some(item =>
      item.url === streamData.url &&
      item.pageUrl === streamData.pageUrl
    );

    if (!exists) {
      const newStream = {
        url: streamData.url,
        type: streamData.type,
        pageUrl: streamData.pageUrl,
        domain: streamData.domain,
        timestamp: Date.now(),
        quality: streamData.quality || null
      };

      history.unshift(newStream); // Add to beginning

      // Keep only last 500 streams to prevent storage bloat
      if (history.length > 500) {
        history.length = 500;
      }

      await browser.storage.local.set({ [this.KEYS.HISTORY]: history });
      await this.updateStats(streamData.type, streamData.domain);
      await this.incrementSessionCount();
    }
  },

  // Get all history
  async getHistory() {
    const result = await browser.storage.local.get(this.KEYS.HISTORY);
    return result[this.KEYS.HISTORY] || [];
  },

  // Search history
  async searchHistory(query) {
    const history = await this.getHistory();
    const lowerQuery = query.toLowerCase();

    return history.filter(item =>
      item.url.toLowerCase().includes(lowerQuery) ||
      item.domain.toLowerCase().includes(lowerQuery) ||
      item.type.toLowerCase().includes(lowerQuery)
    );
  },

  // Clear history
  async clearHistory() {
    await browser.storage.local.set({ [this.KEYS.HISTORY]: [] });
  },

  // Update statistics
  async updateStats(type, domain) {
    const stats = await this.getStats();

    // Increment total
    stats.total++;

    // Update by type
    if (!stats.byType[type]) {
      stats.byType[type] = 0;
    }
    stats.byType[type]++;

    // Update by domain
    if (!stats.byDomain[domain]) {
      stats.byDomain[domain] = 0;
    }
    stats.byDomain[domain]++;

    await browser.storage.local.set({ [this.KEYS.STATS]: stats });
  },

  // Get statistics
  async getStats() {
    const result = await browser.storage.local.get(this.KEYS.STATS);
    return result[this.KEYS.STATS] || {
      total: 0,
      byType: {},
      byDomain: {}
    };
  },

  // Get session count
  async getSessionCount() {
    const result = await browser.storage.local.get(this.KEYS.SESSION_COUNT);
    return result[this.KEYS.SESSION_COUNT] || 0;
  },

  // Increment session count
  async incrementSessionCount() {
    const count = await this.getSessionCount();
    await browser.storage.local.set({ [this.KEYS.SESSION_COUNT]: count + 1 });
  },

  // Reset session count
  async resetSessionCount() {
    await browser.storage.local.set({ [this.KEYS.SESSION_COUNT]: 0 });
  },

  // Reset all statistics
  async resetStats() {
    await browser.storage.local.set({
      [this.KEYS.STATS]: {
        total: 0,
        byType: {},
        byDomain: {}
      }
    });
    await this.resetSessionCount();
  },

  // Export data
  async exportData(format = 'json') {
    const history = await this.getHistory();
    const stats = await this.getStats();

    if (format === 'json') {
      return JSON.stringify({
        history: history,
        statistics: stats,
        exportedAt: new Date().toISOString()
      }, null, 2);
    } else if (format === 'txt') {
      let text = 'Stream History Export\n';
      text += '====================\n\n';

      history.forEach((item, index) => {
        text += `${index + 1}. ${item.url}\n`;
        text += `   Type: ${item.type}\n`;
        text += `   Domain: ${item.domain}\n`;
        text += `   Page: ${item.pageUrl}\n`;
        text += `   Date: ${new Date(item.timestamp).toLocaleString()}\n`;
        if (item.quality) {
          text += `   Quality: ${item.quality}\n`;
        }
        text += '\n';
      });

      return text;
    }
  },

  // Get top domains (sorted by count)
  async getTopDomains(limit = 10) {
    const stats = await this.getStats();
    const domains = Object.entries(stats.byDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return domains;
  },

  // Get stats by type
  async getStatsByType() {
    const stats = await this.getStats();
    return Object.entries(stats.byType);
  },

  // ========== FAVORITES MANAGEMENT ==========

  // Add stream to favorites
  async addFavorite(streamData) {
    const favorites = await this.getFavorites();

    // Check if already in favorites
    const exists = favorites.some(item => item.url === streamData.url);

    if (!exists) {
      const favorite = {
        url: streamData.url,
        type: streamData.type,
        typeName: streamData.typeName || streamData.type.toUpperCase(),
        domain: streamData.domain,
        pageUrl: streamData.pageUrl || '',
        pageTitle: streamData.pageTitle || '',
        timestamp: Date.now(),
        addedAt: Date.now()
      };

      favorites.unshift(favorite); // Add to beginning
      await browser.storage.local.set({ [this.KEYS.FAVORITES]: favorites });
      return true;
    }

    return false;
  },

  // Remove stream from favorites
  async removeFavorite(url) {
    const favorites = await this.getFavorites();
    const filtered = favorites.filter(item => item.url !== url);

    if (filtered.length !== favorites.length) {
      await browser.storage.local.set({ [this.KEYS.FAVORITES]: filtered });
      return true;
    }

    return false;
  },

  // Get all favorites
  async getFavorites() {
    const result = await browser.storage.local.get(this.KEYS.FAVORITES);
    return result[this.KEYS.FAVORITES] || [];
  },

  // Check if stream is in favorites
  async isFavorite(url) {
    const favorites = await this.getFavorites();
    return favorites.some(item => item.url === url);
  },

  // Clear all favorites
  async clearFavorites() {
    await browser.storage.local.set({ [this.KEYS.FAVORITES]: [] });
  },

  // Toggle favorite status
  async toggleFavorite(streamData) {
    const isFav = await this.isFavorite(streamData.url);

    if (isFav) {
      await this.removeFavorite(streamData.url);
      return false;
    } else {
      await this.addFavorite(streamData);
      return true;
    }
  }
};

// Initialize storage when script loads
StorageManager.init();
