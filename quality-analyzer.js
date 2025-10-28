// Quality Analyzer - Intelligent quality detection, recommendations, and bandwidth analysis
// Provides quality recommendations based on connection speed and compatibility checks

const QualityAnalyzer = {
  // Quality levels (standard definitions)
  QualityLevels: {
    ULTRA_LOW: { name: 'Ultra Low', minBandwidth: 0, maxBandwidth: 500000, label: '144p' },
    LOW: { name: 'Low', minBandwidth: 500000, maxBandwidth: 1000000, label: '240p' },
    MEDIUM: { name: 'Medium', minBandwidth: 1000000, maxBandwidth: 2500000, label: '360p-480p' },
    HIGH: { name: 'High', minBandwidth: 2500000, maxBandwidth: 5000000, label: '720p' },
    FULL_HD: { name: 'Full HD', minBandwidth: 5000000, maxBandwidth: 10000000, label: '1080p' },
    QUAD_HD: { name: 'Quad HD', minBandwidth: 10000000, maxBandwidth: 20000000, label: '1440p' },
    ULTRA_HD: { name: 'Ultra HD', minBandwidth: 20000000, maxBandwidth: 50000000, label: '4K' },
    ULTRA_HD_8K: { name: '8K', minBandwidth: 50000000, maxBandwidth: Infinity, label: '8K' }
  },

  // Connection speed categories
  ConnectionTypes: {
    SLOW_2G: { name: 'Slow 2G', minSpeed: 0, maxSpeed: 0.25, recommendedQuality: 'ULTRA_LOW' },
    FAST_2G: { name: 'Fast 2G', minSpeed: 0.25, maxSpeed: 0.5, recommendedQuality: 'LOW' },
    SLOW_3G: { name: 'Slow 3G', minSpeed: 0.5, maxSpeed: 1.5, recommendedQuality: 'LOW' },
    FAST_3G: { name: 'Fast 3G', minSpeed: 1.5, maxSpeed: 3, recommendedQuality: 'MEDIUM' },
    SLOW_4G: { name: 'Slow 4G', minSpeed: 3, maxSpeed: 6, recommendedQuality: 'HIGH' },
    FAST_4G: { name: 'Fast 4G', minSpeed: 6, maxSpeed: 12, recommendedQuality: 'FULL_HD' },
    WIFI: { name: 'WiFi', minSpeed: 12, maxSpeed: 50, recommendedQuality: 'QUAD_HD' },
    FIBER: { name: 'Fiber', minSpeed: 50, maxSpeed: Infinity, recommendedQuality: 'ULTRA_HD' }
  },

  // Codec compatibility matrix (browser support)
  CodecCompatibility: {
    // Video codecs
    'avc1': { name: 'H.264', browsers: ['firefox', 'chrome', 'safari', 'edge'], compatibility: 100 },
    'avc3': { name: 'H.264', browsers: ['firefox', 'chrome', 'safari', 'edge'], compatibility: 100 },
    'hvc1': { name: 'H.265/HEVC', browsers: ['safari', 'edge'], compatibility: 40 },
    'hev1': { name: 'H.265/HEVC', browsers: ['safari', 'edge'], compatibility: 40 },
    'vp8': { name: 'VP8', browsers: ['firefox', 'chrome', 'edge'], compatibility: 80 },
    'vp9': { name: 'VP9', browsers: ['firefox', 'chrome', 'edge'], compatibility: 90 },
    'vp09': { name: 'VP9', browsers: ['firefox', 'chrome', 'edge'], compatibility: 90 },
    'av01': { name: 'AV1', browsers: ['firefox', 'chrome', 'edge'], compatibility: 70 },

    // Audio codecs
    'mp4a': { name: 'AAC', browsers: ['firefox', 'chrome', 'safari', 'edge'], compatibility: 100 },
    'opus': { name: 'Opus', browsers: ['firefox', 'chrome', 'edge'], compatibility: 85 },
    'vorbis': { name: 'Vorbis', browsers: ['firefox', 'chrome', 'edge'], compatibility: 80 },
    'ac-3': { name: 'AC-3', browsers: ['safari'], compatibility: 30 },
    'ec-3': { name: 'E-AC-3', browsers: ['safari'], compatibility: 30 }
  },

  // Cached connection speed
  cachedSpeed: null,
  lastSpeedCheck: null,
  speedCheckInterval: 300000, // 5 minutes

  // Initialize analyzer
  async init() {
    // Load cached speed if available
    const result = await browser.storage.local.get('connectionSpeed');
    if (result.connectionSpeed) {
      this.cachedSpeed = result.connectionSpeed;
      this.lastSpeedCheck = Date.now();
    }

    console.log('Quality Analyzer initialized');
  },

  // Analyze stream quality with recommendations
  async analyzeStream(streamData) {
    try {
      // Parse manifest to get quality variants
      const manifestData = await ManifestParser.parseManifest(streamData.url, streamData.type);

      if (manifestData.type === 'error' || !manifestData.qualities) {
        return {
          success: false,
          error: 'Failed to parse manifest or no qualities found',
          streamData: streamData
        };
      }

      // Get connection speed
      const speed = await this.getConnectionSpeed();

      // Analyze each quality variant
      const analyzedQualities = manifestData.qualities.map(quality =>
        this.analyzeQuality(quality, speed)
      );

      // Get recommendations
      const recommendation = this.getRecommendedQuality(analyzedQualities, speed);
      const warnings = this.generateWarnings(analyzedQualities, speed);

      // Calculate statistics
      const stats = this.calculateQualityStats(analyzedQualities);

      return {
        success: true,
        streamData: streamData,
        qualities: analyzedQualities,
        recommendation: recommendation,
        warnings: warnings,
        stats: stats,
        connectionSpeed: speed
      };

    } catch (error) {
      console.error('Quality analysis failed:', error);
      return {
        success: false,
        error: error.message,
        streamData: streamData
      };
    }
  },

  // Analyze individual quality variant
  analyzeQuality(quality, connectionSpeed) {
    const analysis = {
      ...quality,
      qualityLevel: this.getQualityLevel(quality),
      codecCompatibility: this.analyzeCodecCompatibility(quality),
      bandwidthScore: this.calculateBandwidthScore(quality, connectionSpeed),
      suitability: this.calculateSuitability(quality, connectionSpeed),
      estimatedBuffering: this.estimateBufferingTime(quality, connectionSpeed),
      fileSize: this.estimateFileSize(quality)
    };

    return analysis;
  },

  // Get quality level from bandwidth/resolution
  getQualityLevel(quality) {
    if (!quality.bandwidth) {
      // Try to infer from resolution
      if (quality.resolution) {
        const height = parseInt(quality.resolution.split('x')[1]);

        if (height <= 144) return 'ULTRA_LOW';
        if (height <= 240) return 'LOW';
        if (height <= 480) return 'MEDIUM';
        if (height <= 720) return 'HIGH';
        if (height <= 1080) return 'FULL_HD';
        if (height <= 1440) return 'QUAD_HD';
        if (height <= 2160) return 'ULTRA_HD';
        return 'ULTRA_HD_8K';
      }

      return 'UNKNOWN';
    }

    // Determine from bandwidth
    for (const [level, data] of Object.entries(this.QualityLevels)) {
      if (quality.bandwidth >= data.minBandwidth && quality.bandwidth < data.maxBandwidth) {
        return level;
      }
    }

    return 'UNKNOWN';
  },

  // Analyze codec compatibility
  analyzeCodecCompatibility(quality) {
    if (!quality.codecs) {
      return {
        compatible: true,
        score: 100,
        details: 'Unknown codecs (assuming compatible)'
      };
    }

    const codecs = quality.codecs.split(',').map(c => c.trim());
    const compatibilityScores = [];
    const codecNames = [];

    for (const codec of codecs) {
      // Extract codec identifier (first part before .)
      const codecId = codec.split('.')[0].toLowerCase();

      const codecInfo = this.CodecCompatibility[codecId];
      if (codecInfo) {
        compatibilityScores.push(codecInfo.compatibility);
        codecNames.push(codecInfo.name);
      } else {
        // Unknown codec - assume moderate compatibility
        compatibilityScores.push(50);
        codecNames.push(codec);
      }
    }

    const averageScore = compatibilityScores.reduce((a, b) => a + b, 0) / compatibilityScores.length;

    return {
      compatible: averageScore >= 60,
      score: Math.round(averageScore),
      codecs: codecNames.join(' + '),
      details: averageScore >= 80 ? 'Excellent compatibility' :
               averageScore >= 60 ? 'Good compatibility' :
               averageScore >= 40 ? 'Limited compatibility' :
               'Poor compatibility'
    };
  },

  // Calculate bandwidth score (how well quality matches connection)
  calculateBandwidthScore(quality, connectionSpeed) {
    if (!quality.bandwidth || !connectionSpeed) {
      return 50; // Neutral score if unknown
    }

    const qualityBandwidthMbps = quality.bandwidth / 1000000;
    const speedMbps = connectionSpeed.downloadSpeed;

    // Ideal: quality bandwidth is 50-80% of connection speed
    const ratio = qualityBandwidthMbps / speedMbps;

    if (ratio <= 0.5) {
      // Quality well below connection - good
      return 100;
    } else if (ratio <= 0.8) {
      // Quality optimal for connection - excellent
      return 100;
    } else if (ratio <= 1.0) {
      // Quality at connection limit - acceptable
      return 70;
    } else if (ratio <= 1.5) {
      // Quality exceeds connection - poor
      return 40;
    } else {
      // Quality far exceeds connection - very poor
      return 10;
    }
  },

  // Calculate overall suitability score
  calculateSuitability(quality, connectionSpeed) {
    const bandwidthScore = this.calculateBandwidthScore(quality, connectionSpeed);
    const codecScore = this.analyzeCodecCompatibility(quality).score;

    // Weighted average (bandwidth 70%, codec 30%)
    const overall = (bandwidthScore * 0.7) + (codecScore * 0.3);

    return {
      score: Math.round(overall),
      rating: overall >= 80 ? 'Excellent' :
              overall >= 60 ? 'Good' :
              overall >= 40 ? 'Fair' :
              overall >= 20 ? 'Poor' : 'Very Poor',
      recommended: overall >= 60
    };
  },

  // Estimate buffering time
  estimateBufferingTime(quality, connectionSpeed) {
    if (!quality.bandwidth || !connectionSpeed) {
      return null;
    }

    const qualityBandwidthMbps = quality.bandwidth / 1000000;
    const speedMbps = connectionSpeed.downloadSpeed;

    if (speedMbps >= qualityBandwidthMbps * 2) {
      return { time: 0, description: 'No buffering expected' };
    } else if (speedMbps >= qualityBandwidthMbps * 1.5) {
      return { time: 1, description: 'Minimal buffering' };
    } else if (speedMbps >= qualityBandwidthMbps * 1.2) {
      return { time: 3, description: 'Occasional buffering' };
    } else if (speedMbps >= qualityBandwidthMbps) {
      return { time: 5, description: 'Frequent buffering' };
    } else {
      return { time: 10, description: 'Constant buffering' };
    }
  },

  // Estimate file size for different durations
  estimateFileSize(quality) {
    if (!quality.bandwidth) {
      return null;
    }

    const bytesPerSecond = quality.bandwidth / 8;

    return {
      perMinute: Math.round((bytesPerSecond * 60) / (1024 * 1024) * 10) / 10, // MB
      perHour: Math.round((bytesPerSecond * 3600) / (1024 * 1024) * 10) / 10, // MB
      per10Minutes: Math.round((bytesPerSecond * 600) / (1024 * 1024) * 10) / 10 // MB
    };
  },

  // Get recommended quality based on connection speed
  getRecommendedQuality(analyzedQualities, connectionSpeed) {
    if (!analyzedQualities || analyzedQualities.length === 0) {
      return null;
    }

    // Filter qualities with good suitability
    const suitable = analyzedQualities.filter(q => q.suitability.recommended);

    if (suitable.length === 0) {
      // No suitable qualities - return lowest
      const sorted = [...analyzedQualities].sort((a, b) =>
        (a.bandwidth || 0) - (b.bandwidth || 0)
      );
      return {
        quality: sorted[0],
        reason: 'Best available for slow connection',
        confidence: 'low'
      };
    }

    // Return highest suitable quality
    const sorted = suitable.sort((a, b) =>
      (b.bandwidth || 0) - (a.bandwidth || 0)
    );

    return {
      quality: sorted[0],
      reason: sorted.length === analyzedQualities.length
        ? 'Best quality for your connection'
        : 'Optimal balance of quality and reliability',
      confidence: 'high'
    };
  },

  // Generate warnings for quality issues
  generateWarnings(analyzedQualities, connectionSpeed) {
    const warnings = [];

    if (!connectionSpeed) {
      warnings.push({
        severity: 'info',
        message: 'Connection speed unknown - quality recommendations may be inaccurate'
      });
      return warnings;
    }

    // Check if any qualities exceed connection speed significantly
    const problematic = analyzedQualities.filter(q =>
      q.bandwidth && (q.bandwidth / 1000000) > (connectionSpeed.downloadSpeed * 1.5)
    );

    if (problematic.length > 0) {
      warnings.push({
        severity: 'warning',
        message: `${problematic.length} quality option(s) may cause buffering on your connection`,
        affectedQualities: problematic.map(q => q.resolution || q.bitrate)
      });
    }

    // Check for codec compatibility issues
    const incompatible = analyzedQualities.filter(q =>
      q.codecCompatibility && !q.codecCompatibility.compatible
    );

    if (incompatible.length > 0) {
      warnings.push({
        severity: 'warning',
        message: `${incompatible.length} quality option(s) may have limited browser support`,
        affectedQualities: incompatible.map(q => q.resolution || q.bitrate)
      });
    }

    // Check for very large file sizes
    const largeSizes = analyzedQualities.filter(q =>
      q.fileSize && q.fileSize.perHour > 5000 // > 5GB per hour
    );

    if (largeSizes.length > 0) {
      warnings.push({
        severity: 'info',
        message: 'Some qualities will result in very large file sizes (>5GB/hour)',
        affectedQualities: largeSizes.map(q => q.resolution || q.bitrate)
      });
    }

    // Check if connection is very slow
    if (connectionSpeed.downloadSpeed < 1) {
      warnings.push({
        severity: 'error',
        message: 'Very slow connection detected - streaming may be unreliable',
        suggestion: 'Consider downloading for offline viewing'
      });
    }

    return warnings;
  },

  // Calculate quality statistics
  calculateQualityStats(analyzedQualities) {
    if (!analyzedQualities || analyzedQualities.length === 0) {
      return null;
    }

    const bandwidths = analyzedQualities.map(q => q.bandwidth).filter(b => b);
    const resolutions = analyzedQualities.map(q => q.resolution).filter(r => r);

    const stats = {
      totalQualities: analyzedQualities.length,
      bandwidthRange: bandwidths.length > 0 ? {
        min: Math.min(...bandwidths),
        max: Math.max(...bandwidths),
        average: Math.round(bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length),
        minFormatted: `${Math.round(Math.min(...bandwidths) / 1000)} Kbps`,
        maxFormatted: `${Math.round(Math.max(...bandwidths) / 1000)} Kbps`
      } : null,
      resolutions: resolutions,
      uniqueResolutions: [...new Set(resolutions)],
      qualityLevels: this.groupByQualityLevel(analyzedQualities),
      averageCompatibility: Math.round(
        analyzedQualities.reduce((sum, q) => sum + (q.codecCompatibility?.score || 50), 0) /
        analyzedQualities.length
      ),
      recommendedCount: analyzedQualities.filter(q => q.suitability?.recommended).length
    };

    return stats;
  },

  // Group qualities by level
  groupByQualityLevel(analyzedQualities) {
    const groups = {};

    for (const quality of analyzedQualities) {
      const level = quality.qualityLevel;
      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push(quality);
    }

    return groups;
  },

  // Get connection speed (with caching)
  async getConnectionSpeed() {
    // Check if cached speed is still valid
    if (this.cachedSpeed && this.lastSpeedCheck) {
      const elapsed = Date.now() - this.lastSpeedCheck;
      if (elapsed < this.speedCheckInterval) {
        return this.cachedSpeed;
      }
    }

    // Detect new speed
    const speed = await this.detectConnectionSpeed();

    // Cache it
    this.cachedSpeed = speed;
    this.lastSpeedCheck = Date.now();
    await browser.storage.local.set({ connectionSpeed: speed });

    return speed;
  },

  // Detect connection speed using Network Information API
  async detectConnectionSpeed() {
    // Try Network Information API first (Chrome/Edge)
    if (navigator.connection) {
      const connection = navigator.connection;

      const speed = {
        downloadSpeed: connection.downlink || 10, // Mbps
        effectiveType: connection.effectiveType || '4g',
        rtt: connection.rtt || 100, // Round-trip time in ms
        saveData: connection.saveData || false,
        detected: true,
        method: 'NetworkInformation'
      };

      // Map effective type to download speed if downlink not available
      if (!connection.downlink) {
        speed.downloadSpeed = this.mapEffectiveTypeToSpeed(connection.effectiveType);
      }

      return speed;
    }

    // Fallback: estimate from browser/storage
    const stored = await browser.storage.local.get('userConnectionSpeed');
    if (stored.userConnectionSpeed) {
      return {
        downloadSpeed: stored.userConnectionSpeed,
        effectiveType: 'unknown',
        detected: false,
        method: 'stored'
      };
    }

    // Default assumption (WiFi)
    return {
      downloadSpeed: 20, // Mbps (moderate WiFi)
      effectiveType: 'unknown',
      detected: false,
      method: 'default'
    };
  },

  // Map effective connection type to speed estimate
  mapEffectiveTypeToSpeed(effectiveType) {
    const mapping = {
      'slow-2g': 0.1,
      '2g': 0.3,
      '3g': 2,
      '4g': 10,
      '5g': 50
    };

    return mapping[effectiveType] || 10;
  },

  // Set manual connection speed (user override)
  async setConnectionSpeed(speedMbps) {
    await browser.storage.local.set({ userConnectionSpeed: speedMbps });

    this.cachedSpeed = {
      downloadSpeed: speedMbps,
      effectiveType: 'manual',
      detected: false,
      method: 'manual'
    };
    this.lastSpeedCheck = Date.now();

    return this.cachedSpeed;
  },

  // Compare two qualities
  compareQualities(quality1, quality2) {
    const comparison = {
      resolution: {
        q1: quality1.resolution || 'Unknown',
        q2: quality2.resolution || 'Unknown',
        better: this.compareResolutions(quality1.resolution, quality2.resolution)
      },
      bandwidth: {
        q1: quality1.bandwidth || 0,
        q2: quality2.bandwidth || 0,
        better: quality1.bandwidth > quality2.bandwidth ? 'q1' :
                quality2.bandwidth > quality1.bandwidth ? 'q2' : 'equal',
        difference: Math.abs((quality1.bandwidth || 0) - (quality2.bandwidth || 0))
      },
      compatibility: {
        q1: quality1.codecCompatibility?.score || 50,
        q2: quality2.codecCompatibility?.score || 50,
        better: (quality1.codecCompatibility?.score || 50) > (quality2.codecCompatibility?.score || 50) ? 'q1' :
                (quality2.codecCompatibility?.score || 50) > (quality1.codecCompatibility?.score || 50) ? 'q2' : 'equal'
      },
      fileSize: {
        q1: quality1.fileSize?.perHour || 0,
        q2: quality2.fileSize?.perHour || 0,
        smaller: (quality1.fileSize?.perHour || Infinity) < (quality2.fileSize?.perHour || Infinity) ? 'q1' : 'q2'
      }
    };

    // Overall winner
    let q1Score = 0;
    let q2Score = 0;

    if (comparison.resolution.better === 'q1') q1Score++;
    if (comparison.resolution.better === 'q2') q2Score++;
    if (comparison.bandwidth.better === 'q1') q1Score++;
    if (comparison.bandwidth.better === 'q2') q2Score++;
    if (comparison.compatibility.better === 'q1') q1Score++;
    if (comparison.compatibility.better === 'q2') q2Score++;

    comparison.overall = q1Score > q2Score ? 'q1' : q2Score > q1Score ? 'q2' : 'equal';

    return comparison;
  },

  // Compare resolutions
  compareResolutions(res1, res2) {
    if (!res1 || !res2) return 'unknown';

    const height1 = parseInt(res1.split('x')[1]);
    const height2 = parseInt(res2.split('x')[1]);

    return height1 > height2 ? 'q1' : height2 > height1 ? 'q2' : 'equal';
  },

  // Get quality by criteria
  getQualityByCriteria(analyzedQualities, criteria) {
    if (!analyzedQualities || analyzedQualities.length === 0) {
      return null;
    }

    let filtered = [...analyzedQualities];

    // Filter by resolution
    if (criteria.minHeight) {
      filtered = filtered.filter(q => {
        if (!q.resolution) return false;
        const height = parseInt(q.resolution.split('x')[1]);
        return height >= criteria.minHeight;
      });
    }

    if (criteria.maxHeight) {
      filtered = filtered.filter(q => {
        if (!q.resolution) return true;
        const height = parseInt(q.resolution.split('x')[1]);
        return height <= criteria.maxHeight;
      });
    }

    // Filter by bandwidth
    if (criteria.maxBandwidth) {
      filtered = filtered.filter(q =>
        !q.bandwidth || q.bandwidth <= criteria.maxBandwidth
      );
    }

    // Filter by compatibility
    if (criteria.minCompatibility) {
      filtered = filtered.filter(q =>
        (q.codecCompatibility?.score || 0) >= criteria.minCompatibility
      );
    }

    if (filtered.length === 0) {
      return null;
    }

    // Sort by preference
    const sorted = filtered.sort((a, b) => {
      if (criteria.prefer === 'highest') {
        return (b.bandwidth || 0) - (a.bandwidth || 0);
      } else if (criteria.prefer === 'lowest') {
        return (a.bandwidth || 0) - (b.bandwidth || 0);
      } else if (criteria.prefer === 'optimal') {
        return (b.suitability?.score || 0) - (a.suitability?.score || 0);
      }
      return 0;
    });

    return sorted[0];
  },

  // Format analysis result for display
  formatAnalysisForDisplay(analysis) {
    if (!analysis.success) {
      return {
        error: analysis.error,
        streamUrl: analysis.streamData?.url
      };
    }

    return {
      streamTitle: analysis.streamData.pageTitle || 'Unknown Stream',
      streamUrl: analysis.streamData.url,
      qualityCount: analysis.qualities.length,
      recommended: analysis.recommendation ? {
        resolution: analysis.recommendation.quality.resolution || 'Unknown',
        bitrate: analysis.recommendation.quality.bitrate || 'Unknown',
        reason: analysis.recommendation.reason,
        confidence: analysis.recommendation.confidence
      } : null,
      connectionSpeed: `${analysis.connectionSpeed.downloadSpeed} Mbps (${analysis.connectionSpeed.effectiveType})`,
      warnings: analysis.warnings,
      stats: analysis.stats
    };
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  QualityAnalyzer.init().catch(console.error);
}
