// Stream Deduplicator - Identifies and filters duplicate streams, keeping only the best quality

// Cache for parsed manifests to avoid re-fetching
const manifestCache = new Map();

/**
 * Main function to filter duplicates from a stream list
 * @param {Array} streams - Array of stream objects
 * @returns {Promise<Array>} - Deduplicated array with only best quality streams
 */
async function filterDuplicates(streams) {
  if (!streams || streams.length === 0) {
    return streams;
  }

  // Only process M3U8 and MPD streams (others pass through)
  const processable = streams.filter(s => s.type === 'm3u8' || s.type === 'm3u' || s.type === 'mpd');
  const other = streams.filter(s => s.type !== 'm3u8' && s.type !== 'm3u' && s.type !== 'mpd');

  if (processable.length === 0) {
    return streams; // No streamsto deduplicate
  }

  // Group streams by content identity
  const duplicateGroups = await identifyDuplicates(processable);

  // Select best quality from each group
  const bestStreams = [];
  for (const [contentId, group] of duplicateGroups.entries()) {
    const best = selectBestQuality(group);
    if (best) {
      bestStreams.push(best);
    }
  }

  // Combine with non-processable streams and return
  return [...bestStreams, ...other];
}

/**
 * Identify duplicate streams by analyzing manifests and URLs
 * @param {Array} streams - Array of streams to analyze
 * @returns {Promise<Map>} - Map of {contentId: [stream1, stream2, ...]}
 */
async function identifyDuplicates(streams) {
  const groups = new Map();

  for (const stream of streams) {
    const contentId = await getContentIdentifier(stream);

    if (!groups.has(contentId)) {
      groups.set(contentId, []);
    }
    groups.get(contentId).push(stream);
  }

  return groups;
}

/**
 * Generate a content identifier for a stream
 * Streams with the same identifier are considered duplicates
 * @param {Object} stream - Stream object
 * @returns {Promise<string>} - Content identifier
 */
async function getContentIdentifier(stream) {
  // Try to get from cache first
  if (manifestCache.has(stream.url)) {
    const cached = manifestCache.get(stream.url);
    if (cached.contentId) {
      return cached.contentId;
    }
  }

  // Parse manifest to extract content fingerprint
  const manifest = await fetchAndParseManifest(stream);

  if (manifest && manifest.segments && manifest.segments.length > 0) {
    // Create fingerprint from segment patterns
    const segmentPattern = extractSegmentPattern(manifest.segments);
    const contentId = `${stream.domain}_${segmentPattern}`;

    // Cache the result
    manifestCache.set(stream.url, {
      ...manifest,
      contentId: contentId
    });

    return contentId;
  }

  // Fallback: use base URL pattern
  const baseUrl = getBaseUrl(stream.url);
  return `${stream.domain}_${baseUrl}`;
}

/**
 * Fetch and parse stream manifest
 * @param {Object} stream - Stream object
 * @returns {Promise<Object|null>} - Parsed manifest data
 */
async function fetchAndParseManifest(stream) {
  // Check cache first
  if (manifestCache.has(stream.url)) {
    return manifestCache.get(stream.url);
  }

  try {
    const response = await fetch(stream.url, {
      method: 'GET',
      headers: { 'Accept': '*/*' }
    });

    if (!response.ok) {
      console.warn(`Failed to fetch manifest: ${stream.url}`);
      return null;
    }

    const text = await response.text();

    let manifest = null;
    if (stream.type === 'm3u8' || stream.type === 'm3u') {
      manifest = parseM3U8Manifest(text, stream.url);
    } else if (stream.type === 'mpd') {
      manifest = parseMPDManifest(text);
    }

    // Cache the result
    if (manifest) {
      manifestCache.set(stream.url, manifest);
    }

    return manifest;
  } catch (error) {
    console.error(`Error fetching manifest for ${stream.url}:`, error);
    return null;
  }
}

/**
 * Parse M3U8 manifest
 * @param {string} content - Manifest content
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {Object} - Parsed manifest data
 */
function parseM3U8Manifest(content, baseUrl) {
  const lines = content.split('\n').map(line => line.trim());
  const qualities = [];
  const segments = [];
  let currentQuality = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse quality variant
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const bandwidth = line.match(/BANDWIDTH=(\d+)/)?.[1];
      const resolution = line.match(/RESOLUTION=(\d+x\d+)/)?.[1];
      const framerate = line.match(/FRAME-RATE=([\d.]+)/)?.[1];

      currentQuality = {
        bandwidth: bandwidth ? parseInt(bandwidth) : 0,
        resolution: resolution || null,
        framerate: framerate ? parseFloat(framerate) : null,
        url: lines[i + 1] || null
      };

      qualities.push(currentQuality);
    }

    // Parse segments
    if (line.startsWith('#EXTINF:')) {
      const duration = parseFloat(line.split(':')[1].split(',')[0]);
      const segmentUrl = lines[i + 1] || null;

      if (segmentUrl && !segmentUrl.startsWith('#')) {
        segments.push({
          duration,
          url: segmentUrl
        });
      }
    }
  }

  return {
    type: 'm3u8',
    qualities,
    segments,
    hasVariants: qualities.length > 0
  };
}

/**
 * Parse MPD manifest
 * @param {string} content - Manifest XML content
 * @returns {Object} - Parsed manifest data
 */
function parseMPDManifest(content) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'text/xml');

  const qualities = [];
  const representations = xmlDoc.querySelectorAll('Representation');

  representations.forEach(rep => {
    const bandwidth = rep.getAttribute('bandwidth');
    const width = rep.getAttribute('width');
    const height = rep.getAttribute('height');
    const framerate = rep.getAttribute('frameRate');

    qualities.push({
      bandwidth: bandwidth ? parseInt(bandwidth) : 0,
      resolution: (width && height) ? `${width}x${height}` : null,
      framerate: framerate ? parseFloat(framerate) : null,
      id: rep.getAttribute('id')
    });
  });

  // Extract segment template for fingerprinting
  const segmentTemplate = xmlDoc.querySelector('SegmentTemplate');
  const segments = [];

  if (segmentTemplate) {
    const media = segmentTemplate.getAttribute('media');
    if (media) {
      segments.push({ url: media });
    }
  }

  return {
    type: 'mpd',
    qualities,
    segments,
    hasVariants: qualities.length > 0
  };
}

/**
 * Extract segment URL pattern for fingerprinting
 * @param {Array} segments - Array of segment objects
 * @returns {string} - Segment pattern hash
 */
function extractSegmentPattern(segments) {
  if (segments.length === 0) return 'no-segments';

  // Take first few segments and extract base pattern
  const sampleSize = Math.min(3, segments.length);
  const samples = segments.slice(0, sampleSize).map(s => {
    const url = s.url || '';
    // Remove variable parts (numbers, timestamps)
    return url.replace(/\d+/g, 'N').replace(/[a-f0-9]{32,}/gi, 'HASH');
  });

  // Create simple hash from pattern
  const pattern = samples.join('|');
  let hash = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Get base URL without quality parameters
 * @param {string} url - Full stream URL
 * @returns {string} - Base URL
 */
function getBaseUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove common quality parameters
    urlObj.searchParams.delete('quality');
    urlObj.searchParams.delete('resolution');
    urlObj.searchParams.delete('bitrate');

    // Remove path segments that look like quality indicators
    let pathname = urlObj.pathname;
    pathname = pathname.replace(/\/(1080p|720p|480p|360p|4k|2k|hd|sd)\//gi, '/');

    return urlObj.origin + pathname;
  } catch (error) {
    // If URL parsing fails, just return original
    return url;
  }
}

/**
 * Select the best quality stream from a group of duplicates
 * @param {Array} streams - Array of duplicate streams
 * @returns {Object|null} - Best quality stream
 */
function selectBestQuality(streams) {
  if (!streams || streams.length === 0) return null;
  if (streams.length === 1) return streams[0];

  // Enrich streams with quality data from manifests
  const enriched = streams.map(stream => {
    const cached = manifestCache.get(stream.url);
    return {
      stream,
      manifest: cached || null,
      resolution: extractResolution(stream, cached),
      bandwidth: extractBandwidth(stream, cached)
    };
  });

  // Sort by resolution (descending), then by bandwidth (descending)
  enriched.sort((a, b) => {
    // Compare resolution
    if (a.resolution !== b.resolution) {
      return b.resolution - a.resolution;
    }
    // If resolutions are equal, compare bandwidth
    return b.bandwidth - a.bandwidth;
  });

  return enriched[0].stream;
}

/**
 * Extract resolution value from stream data
 * @param {Object} stream - Stream object
 * @param {Object} manifest - Parsed manifest
 * @returns {number} - Resolution height in pixels
 */
function extractResolution(stream, manifest) {
  // Try to get from manifest qualities
  if (manifest && manifest.qualities && manifest.qualities.length > 0) {
    const maxQuality = manifest.qualities.reduce((max, q) => {
      const height = parseResolutionHeight(q.resolution);
      const maxHeight = parseResolutionHeight(max.resolution);
      return height > maxHeight ? q : max;
    }, manifest.qualities[0]);

    const height = parseResolutionHeight(maxQuality.resolution);
    if (height > 0) return height;
  }

  // Try to parse from stream quality string
  if (stream.quality) {
    const height = parseResolutionHeight(stream.quality);
    if (height > 0) return height;
  }

  // Try to parse from URL
  const urlMatch = stream.url.match(/(\d{3,4})p/i);
  if (urlMatch) {
    return parseInt(urlMatch[1]);
  }

  return 0; // Unknown resolution
}

/**
 * Parse resolution height from various formats
 * @param {string} resolution - Resolution string (e.g., "1920x1080", "1080p")
 * @returns {number} - Height in pixels
 */
function parseResolutionHeight(resolution) {
  if (!resolution) return 0;

  // Format: "1920x1080"
  const xMatch = resolution.match(/(\d+)x(\d+)/);
  if (xMatch) {
    return parseInt(xMatch[2]);
  }

  // Format: "1080p"
  const pMatch = resolution.match(/(\d+)p/i);
  if (pMatch) {
    return parseInt(pMatch[1]);
  }

  return 0;
}

/**
 * Extract bandwidth value from stream data
 * @param {Object} stream - Stream object
 * @param {Object} manifest - Parsed manifest
 * @returns {number} - Bandwidth in bps
 */
function extractBandwidth(stream, manifest) {
  // Try to get from manifest qualities
  if (manifest && manifest.qualities && manifest.qualities.length > 0) {
    const maxBandwidth = Math.max(...manifest.qualities.map(q => q.bandwidth || 0));
    if (maxBandwidth > 0) return maxBandwidth;
  }

  // Try to extract from URL
  const urlMatch = stream.url.match(/bitrate[_=](\d+)/i);
  if (urlMatch) {
    return parseInt(urlMatch[1]);
  }

  return 0; // Unknown bandwidth
}

/**
 * Clear the manifest cache
 */
function clearManifestCache() {
  manifestCache.clear();
}

// Export for use in popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterDuplicates,
    clearManifestCache
  };
}
