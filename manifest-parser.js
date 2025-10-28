// Manifest Parser - Fetches and parses streaming manifests to extract quality info

const ManifestParser = {
  // Parse M3U8 manifest
  async parseM3U8(url) {
    try {
      const response = await fetch(url);
      const text = await response.text();

      const qualities = [];
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for #EXT-X-STREAM-INF (master playlist with quality variants)
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const quality = {};

          // Extract bandwidth
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          if (bandwidthMatch) {
            quality.bandwidth = parseInt(bandwidthMatch[1]);
            quality.bitrate = Math.round(quality.bandwidth / 1000) + ' Kbps';
          }

          // Extract resolution
          const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          if (resolutionMatch) {
            quality.resolution = resolutionMatch[1];
          }

          // Extract framerate
          const framerateMatch = line.match(/FRAME-RATE=([\d.]+)/);
          if (framerateMatch) {
            quality.framerate = parseFloat(framerateMatch[1]) + ' fps';
          }

          // Extract codecs
          const codecsMatch = line.match(/CODECS="([^"]+)"/);
          if (codecsMatch) {
            quality.codecs = codecsMatch[1];
          }

          // Get the variant URL from next line
          if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
            quality.url = lines[i + 1].trim();
          }

          qualities.push(quality);
        }
      }

      // If no qualities found, it might be a simple playlist
      if (qualities.length === 0) {
        return {
          type: 'simple',
          message: 'Simple M3U8 playlist (no quality variants detected)'
        };
      }

      return {
        type: 'master',
        qualities: qualities,
        count: qualities.length
      };

    } catch (error) {
      console.error('Error parsing M3U8:', error);
      return {
        type: 'error',
        message: 'Failed to fetch or parse manifest: ' + error.message
      };
    }
  },

  // Parse MPD manifest (MPEG-DASH)
  async parseMPD(url) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');

      const qualities = [];
      const representations = xmlDoc.getElementsByTagName('Representation');

      for (let rep of representations) {
        const quality = {};

        // Extract bandwidth
        const bandwidth = rep.getAttribute('bandwidth');
        if (bandwidth) {
          quality.bandwidth = parseInt(bandwidth);
          quality.bitrate = Math.round(quality.bandwidth / 1000) + ' Kbps';
        }

        // Extract width and height
        const width = rep.getAttribute('width');
        const height = rep.getAttribute('height');
        if (width && height) {
          quality.resolution = `${width}x${height}`;
        }

        // Extract framerate
        const framerate = rep.getAttribute('frameRate');
        if (framerate) {
          quality.framerate = framerate + ' fps';
        }

        // Extract codecs
        const codecs = rep.getAttribute('codecs');
        if (codecs) {
          quality.codecs = codecs;
        }

        // Extract ID
        const id = rep.getAttribute('id');
        if (id) {
          quality.id = id;
        }

        qualities.push(quality);
      }

      if (qualities.length === 0) {
        return {
          type: 'simple',
          message: 'MPD manifest with no quality variants detected'
        };
      }

      return {
        type: 'mpd',
        qualities: qualities,
        count: qualities.length
      };

    } catch (error) {
      console.error('Error parsing MPD:', error);
      return {
        type: 'error',
        message: 'Failed to fetch or parse manifest: ' + error.message
      };
    }
  },

  // Parse manifest based on type
  async parseManifest(url, type) {
    if (type === 'm3u8' || type === 'm3u') {
      return await this.parseM3U8(url);
    } else if (type === 'mpd') {
      return await this.parseMPD(url);
    } else {
      return {
        type: 'unsupported',
        message: 'Manifest parsing not supported for this type'
      };
    }
  },

  // Format quality information for display
  formatQuality(quality) {
    const parts = [];

    if (quality.resolution) {
      parts.push(quality.resolution);
    }

    if (quality.bitrate) {
      parts.push(quality.bitrate);
    }

    if (quality.framerate) {
      parts.push(quality.framerate);
    }

    return parts.join(' • ') || 'Unknown';
  },

  // Get summary of qualities
  getQualitySummary(manifestData) {
    if (!manifestData || !manifestData.qualities || manifestData.qualities.length === 0) {
      return null;
    }

    const qualities = manifestData.qualities;

    // Get unique resolutions
    const resolutions = qualities
      .map(q => q.resolution)
      .filter(r => r)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    if (resolutions.length > 0) {
      return resolutions.join(', ');
    }

    // Fall back to bitrate range
    const bitrates = qualities.map(q => q.bandwidth).filter(b => b);
    if (bitrates.length > 0) {
      const min = Math.min(...bitrates);
      const max = Math.max(...bitrates);
      return `${Math.round(min / 1000)}-${Math.round(max / 1000)} Kbps`;
    }

    return null;
  },

  // ========== DOWNLOAD-SPECIFIC METHODS ==========

  // Get downloadable URL for a specific quality
  getDownloadableUrl(manifestUrl, quality) {
    if (!quality || !quality.url) {
      // Return original URL if no quality-specific URL
      return manifestUrl;
    }

    // If quality URL is relative, make it absolute
    if (quality.url.startsWith('http://') || quality.url.startsWith('https://')) {
      return quality.url;
    }

    // Construct absolute URL from base
    try {
      const baseUrl = new URL(manifestUrl);
      const pathParts = baseUrl.pathname.split('/');
      pathParts.pop(); // Remove manifest filename
      const basePath = pathParts.join('/');
      return `${baseUrl.origin}${basePath}/${quality.url}`;
    } catch (e) {
      console.error('Error constructing URL:', e);
      return quality.url;
    }
  },

  // Get best quality from manifest data
  getBestQuality(manifestData) {
    if (!manifestData || !manifestData.qualities || manifestData.qualities.length === 0) {
      return null;
    }

    // Sort by bandwidth (highest first)
    const sorted = [...manifestData.qualities].sort((a, b) => {
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });

    return sorted[0];
  },

  // Find quality by resolution
  findQualityByResolution(manifestData, resolution) {
    if (!manifestData || !manifestData.qualities) {
      return null;
    }

    return manifestData.qualities.find(q => q.resolution === resolution);
  },

  // Find quality by minimum resolution
  findQualityByMinResolution(manifestData, minHeight) {
    if (!manifestData || !manifestData.qualities) {
      return null;
    }

    // Filter qualities that meet minimum height
    const suitable = manifestData.qualities.filter(q => {
      if (!q.resolution) return false;
      const height = parseInt(q.resolution.split('x')[1]);
      return height >= minHeight;
    });

    if (suitable.length === 0) {
      // If none meet minimum, return best available
      return this.getBestQuality(manifestData);
    }

    // Return closest to minimum (most efficient)
    suitable.sort((a, b) => {
      const heightA = parseInt(a.resolution.split('x')[1]);
      const heightB = parseInt(b.resolution.split('x')[1]);
      return heightA - heightB;
    });

    return suitable[0];
  },

  // Estimate file size for a quality
  estimateFileSize(quality, durationMinutes = 10) {
    if (!quality || !quality.bandwidth) {
      return null;
    }

    // bandwidth is in bits per second
    const bytesPerSecond = quality.bandwidth / 8;
    const bytesPerMinute = bytesPerSecond * 60;
    const totalBytes = bytesPerMinute * durationMinutes;
    const megabytes = totalBytes / (1024 * 1024);

    return {
      bytes: Math.round(totalBytes),
      megabytes: Math.round(megabytes * 10) / 10,
      formatted: `${Math.round(megabytes)} MB (${durationMinutes} min)`
    };
  }
};
