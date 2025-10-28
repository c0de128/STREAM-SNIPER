// Metadata Extractor - Extract video titles, thumbnails, and descriptions
// Auto-categorizes content and enriches stream data

const MetadataExtractor = {
  // Metadata cache
  metadataCache: new Map(), // URL -> metadata

  // Content categories
  Categories: {
    LIVE_STREAM: 'live_stream',
    VOD: 'vod',
    SPORTS: 'sports',
    NEWS: 'news',
    MUSIC: 'music',
    GAMING: 'gaming',
    EDUCATION: 'education',
    ENTERTAINMENT: 'entertainment',
    UNKNOWN: 'unknown'
  },

  // Initialize metadata extractor
  async init() {
    // Load cached metadata
    const result = await browser.storage.local.get('metadataCache');
    if (result.metadataCache) {
      this.metadataCache = new Map(Object.entries(result.metadataCache));
    }

    console.log('Metadata Extractor initialized');
  },

  // Extract metadata from page
  async extractFromPage(tabId, streamUrl) {
    try {
      // Check cache first
      const cacheKey = `${tabId}_${streamUrl}`;
      if (this.metadataCache.has(cacheKey)) {
        return this.metadataCache.get(cacheKey);
      }

      // Execute content script to extract metadata
      const results = await browser.tabs.executeScript(tabId, {
        code: `(${this.pageMetadataScript.toString()})()`
      });

      if (!results || results.length === 0) {
        return this.getDefaultMetadata();
      }

      const pageMetadata = results[0];

      // Build metadata object
      const metadata = {
        title: this.extractTitle(pageMetadata),
        description: this.extractDescription(pageMetadata),
        thumbnail: this.extractThumbnail(pageMetadata),
        author: this.extractAuthor(pageMetadata),
        duration: this.extractDuration(pageMetadata),
        category: this.categorizeContent(pageMetadata),
        keywords: this.extractKeywords(pageMetadata),
        publishDate: this.extractPublishDate(pageMetadata),
        siteName: this.extractSiteName(pageMetadata),
        embedUrl: this.extractEmbedUrl(pageMetadata),
        extractedAt: Date.now()
      };

      // Cache metadata
      this.metadataCache.set(cacheKey, metadata);
      await this.saveMetadataCache();

      return metadata;

    } catch (error) {
      console.error('Failed to extract metadata:', error);
      return this.getDefaultMetadata();
    }
  },

  // Content script to run in page context
  pageMetadataScript() {
    // Extract all metadata from page
    const metadata = {
      // Open Graph metadata
      ogTitle: document.querySelector('meta[property="og:title"]')?.content,
      ogDescription: document.querySelector('meta[property="og:description"]')?.content,
      ogImage: document.querySelector('meta[property="og:image"]')?.content,
      ogVideo: document.querySelector('meta[property="og:video"]')?.content,
      ogType: document.querySelector('meta[property="og:type"]')?.content,
      ogSiteName: document.querySelector('meta[property="og:site_name"]')?.content,

      // Twitter Card metadata
      twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content,
      twitterDescription: document.querySelector('meta[name="twitter:description"]')?.content,
      twitterImage: document.querySelector('meta[name="twitter:image"]')?.content,

      // Standard metadata
      metaTitle: document.querySelector('meta[name="title"]')?.content,
      metaDescription: document.querySelector('meta[name="description"]')?.content,
      metaKeywords: document.querySelector('meta[name="keywords"]')?.content,
      metaAuthor: document.querySelector('meta[name="author"]')?.content,

      // Video-specific metadata
      videoTitle: document.querySelector('meta[itemprop="name"]')?.content,
      videoDescription: document.querySelector('meta[itemprop="description"]')?.content,
      videoThumbnail: document.querySelector('meta[itemprop="thumbnailUrl"]')?.content,
      videoDuration: document.querySelector('meta[itemprop="duration"]')?.content,
      videoUploadDate: document.querySelector('meta[itemprop="uploadDate"]')?.content,

      // Page title
      pageTitle: document.title,

      // Schema.org structured data
      jsonLd: this.extractJsonLd(),

      // Video element data
      videoElements: this.getVideoElementData(),

      // Page URL
      pageUrl: window.location.href,

      // Favicon
      favicon: this.getFavicon()
    };

    return metadata;

    // Helper: Extract JSON-LD structured data
    function extractJsonLd() {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const jsonLdData = [];

      scripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          jsonLdData.push(data);
        } catch (e) {
          // Invalid JSON, skip
        }
      });

      return jsonLdData;
    }

    // Helper: Get video element data
    function getVideoElementData() {
      const videos = document.querySelectorAll('video');
      const videoData = [];

      videos.forEach(video => {
        videoData.push({
          src: video.src || video.currentSrc,
          poster: video.poster,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        });
      });

      return videoData;
    }

    // Helper: Get favicon
    function getFavicon() {
      const links = [
        document.querySelector('link[rel="icon"]'),
        document.querySelector('link[rel="shortcut icon"]'),
        document.querySelector('link[rel="apple-touch-icon"]')
      ];

      for (const link of links) {
        if (link && link.href) return link.href;
      }

      return null;
    }
  },

  // Extract title from metadata
  extractTitle(pageMetadata) {
    return pageMetadata.ogTitle ||
           pageMetadata.twitterTitle ||
           pageMetadata.videoTitle ||
           pageMetadata.metaTitle ||
           pageMetadata.pageTitle ||
           'Untitled Stream';
  },

  // Extract description
  extractDescription(pageMetadata) {
    return pageMetadata.ogDescription ||
           pageMetadata.twitterDescription ||
           pageMetadata.videoDescription ||
           pageMetadata.metaDescription ||
           '';
  },

  // Extract thumbnail
  extractThumbnail(pageMetadata) {
    // Priority order: OG image > Twitter image > video thumbnail > video poster > favicon
    return pageMetadata.ogImage ||
           pageMetadata.twitterImage ||
           pageMetadata.videoThumbnail ||
           pageMetadata.videoElements?.[0]?.poster ||
           pageMetadata.favicon ||
           null;
  },

  // Extract author/channel
  extractAuthor(pageMetadata) {
    // Try JSON-LD first
    if (pageMetadata.jsonLd) {
      for (const data of pageMetadata.jsonLd) {
        if (data.author) {
          return typeof data.author === 'string' ? data.author : data.author.name;
        }
      }
    }

    return pageMetadata.metaAuthor || 'Unknown';
  },

  // Extract duration
  extractDuration(pageMetadata) {
    // Try video element duration
    if (pageMetadata.videoElements?.length > 0) {
      const duration = pageMetadata.videoElements[0].duration;
      if (duration && !isNaN(duration) && duration !== Infinity) {
        return Math.floor(duration);
      }
    }

    // Try video metadata duration
    if (pageMetadata.videoDuration) {
      return this.parseDuration(pageMetadata.videoDuration);
    }

    // Try JSON-LD duration
    if (pageMetadata.jsonLd) {
      for (const data of pageMetadata.jsonLd) {
        if (data.duration) {
          return this.parseDuration(data.duration);
        }
      }
    }

    return null;
  },

  // Parse ISO 8601 duration (PT1H30M or similar)
  parseDuration(durationStr) {
    if (!durationStr) return null;

    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    return hours * 3600 + minutes * 60 + seconds;
  },

  // Extract keywords
  extractKeywords(pageMetadata) {
    if (pageMetadata.metaKeywords) {
      return pageMetadata.metaKeywords.split(',').map(k => k.trim()).filter(k => k);
    }

    return [];
  },

  // Extract publish/upload date
  extractPublishDate(pageMetadata) {
    // Try video upload date
    if (pageMetadata.videoUploadDate) {
      return new Date(pageMetadata.videoUploadDate).getTime();
    }

    // Try JSON-LD
    if (pageMetadata.jsonLd) {
      for (const data of pageMetadata.jsonLd) {
        if (data.datePublished) {
          return new Date(data.datePublished).getTime();
        }
        if (data.uploadDate) {
          return new Date(data.uploadDate).getTime();
        }
      }
    }

    return null;
  },

  // Extract site name
  extractSiteName(pageMetadata) {
    if (pageMetadata.ogSiteName) {
      return pageMetadata.ogSiteName;
    }

    // Try to extract from URL
    try {
      const url = new URL(pageMetadata.pageUrl);
      const hostname = url.hostname.replace('www.', '');
      const parts = hostname.split('.');
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    } catch (e) {
      return 'Unknown';
    }
  },

  // Extract embed URL
  extractEmbedUrl(pageMetadata) {
    return pageMetadata.ogVideo || null;
  },

  // Categorize content based on metadata
  categorizeContent(pageMetadata) {
    const title = (this.extractTitle(pageMetadata) + ' ' + this.extractDescription(pageMetadata)).toLowerCase();
    const siteName = this.extractSiteName(pageMetadata).toLowerCase();
    const keywords = this.extractKeywords(pageMetadata).join(' ').toLowerCase();
    const allText = `${title} ${siteName} ${keywords}`;

    // Live stream indicators
    if (allText.match(/\b(live|streaming|stream now|on air|broadcasting)\b/)) {
      return this.Categories.LIVE_STREAM;
    }

    // Sports indicators
    if (allText.match(/\b(sports|football|soccer|basketball|baseball|nfl|nba|mlb|hockey|tennis|golf)\b/)) {
      return this.Categories.SPORTS;
    }

    // News indicators
    if (allText.match(/\b(news|breaking|headlines|reporter|journalism|cnn|bbc|fox news)\b/)) {
      return this.Categories.NEWS;
    }

    // Music indicators
    if (allText.match(/\b(music|song|album|artist|concert|mv|official video|spotify|soundcloud)\b/)) {
      return this.Categories.MUSIC;
    }

    // Gaming indicators
    if (allText.match(/\b(gaming|game|gameplay|playthrough|walkthrough|twitch|esports|streamer)\b/)) {
      return this.Categories.GAMING;
    }

    // Education indicators
    if (allText.match(/\b(tutorial|lesson|course|lecture|education|learn|how to|guide)\b/)) {
      return this.Categories.EDUCATION;
    }

    // Entertainment (default for video content)
    if (pageMetadata.ogType === 'video' || pageMetadata.videoElements?.length > 0) {
      return this.Categories.ENTERTAINMENT;
    }

    return this.Categories.UNKNOWN;
  },

  // Get default metadata when extraction fails
  getDefaultMetadata() {
    return {
      title: 'Unknown Stream',
      description: '',
      thumbnail: null,
      author: 'Unknown',
      duration: null,
      category: this.Categories.UNKNOWN,
      keywords: [],
      publishDate: null,
      siteName: 'Unknown',
      embedUrl: null,
      extractedAt: Date.now()
    };
  },

  // Enrich stream data with metadata
  async enrichStreamData(streamData, tabId) {
    try {
      // Extract metadata
      const metadata = await this.extractFromPage(tabId, streamData.url);

      // Merge with stream data
      const enrichedData = {
        ...streamData,
        metadata: metadata,
        // Override basic fields with richer metadata
        pageTitle: metadata.title,
        description: metadata.description,
        thumbnail: metadata.thumbnail,
        author: metadata.author,
        category: metadata.category,
        duration: metadata.duration
      };

      return enrichedData;

    } catch (error) {
      console.error('Failed to enrich stream data:', error);
      return streamData;
    }
  },

  // Batch enrich multiple streams
  async enrichMultipleStreams(streams, tabId) {
    const enrichedStreams = [];

    for (const stream of streams) {
      const enriched = await this.enrichStreamData(stream, tabId);
      enrichedStreams.push(enriched);
    }

    return enrichedStreams;
  },

  // Save metadata cache
  async saveMetadataCache() {
    // Convert Map to object for storage
    const cacheObj = Object.fromEntries(this.metadataCache);

    // Keep only last 200 entries
    if (Object.keys(cacheObj).length > 200) {
      const entries = Array.from(this.metadataCache.entries());
      // Sort by extractedAt (newest first)
      entries.sort((a, b) => b[1].extractedAt - a[1].extractedAt);
      // Keep only 200 newest
      this.metadataCache = new Map(entries.slice(0, 200));
    }

    await browser.storage.local.set({ metadataCache: cacheObj });
  },

  // Clear metadata cache
  async clearCache() {
    this.metadataCache.clear();
    await browser.storage.local.remove('metadataCache');
  },

  // Format duration for display
  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return 'Unknown';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  },

  // Get category display name
  getCategoryDisplayName(category) {
    const names = {
      [this.Categories.LIVE_STREAM]: '🔴 Live Stream',
      [this.Categories.VOD]: '📹 Video on Demand',
      [this.Categories.SPORTS]: '⚽ Sports',
      [this.Categories.NEWS]: '📰 News',
      [this.Categories.MUSIC]: '🎵 Music',
      [this.Categories.GAMING]: '🎮 Gaming',
      [this.Categories.EDUCATION]: '📚 Education',
      [this.Categories.ENTERTAINMENT]: '🎬 Entertainment',
      [this.Categories.UNKNOWN]: '❓ Unknown'
    };

    return names[category] || names[this.Categories.UNKNOWN];
  },

  // Get category color
  getCategoryColor(category) {
    const colors = {
      [this.Categories.LIVE_STREAM]: '#dc3545',
      [this.Categories.VOD]: '#6c757d',
      [this.Categories.SPORTS]: '#28a745',
      [this.Categories.NEWS]: '#17a2b8',
      [this.Categories.MUSIC]: '#e83e8c',
      [this.Categories.GAMING]: '#6f42c1',
      [this.Categories.EDUCATION]: '#fd7e14',
      [this.Categories.ENTERTAINMENT]: '#ffc107',
      [this.Categories.UNKNOWN]: '#6c757d'
    };

    return colors[category] || colors[this.Categories.UNKNOWN];
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  MetadataExtractor.init().catch(console.error);
}
