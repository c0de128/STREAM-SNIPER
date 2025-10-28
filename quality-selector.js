// Quality Selector - UI for selecting download quality

let streamData = null;
let selectedQuality = null;
let availableQualities = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  await applyTheme();
  parseUrlParameters();
  await loadQualities();
  setupEventListeners();
});

// Apply theme
async function applyTheme() {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || { darkMode: false };

  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

// Parse URL parameters to get stream info
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);

  streamData = {
    url: params.get('url'),
    type: params.get('type'),
    domain: params.get('domain') || 'unknown',
    pageTitle: params.get('title') || 'Stream',
    pageUrl: params.get('pageUrl') || ''
  };

  // Display stream info
  document.getElementById('stream-url').textContent = streamData.url;
  document.getElementById('stream-type').textContent = streamData.type.toUpperCase();
}

// Load available qualities from manifest
async function loadQualities() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const containerEl = document.getElementById('qualities-container');

  try {
    // Parse manifest to get qualities
    const manifestData = await ManifestParser.parseManifest(streamData.url, streamData.type);

    if (manifestData.type === 'error') {
      throw new Error(manifestData.message);
    }

    if (manifestData.type === 'simple' || manifestData.type === 'unsupported') {
      // No quality selection needed - just download the stream
      errorEl.textContent = manifestData.message + '. Click "Download Best Quality" to proceed.';
      errorEl.style.display = 'block';
      loadingEl.style.display = 'none';

      // Show only quick download button
      document.getElementById('quick-btn').style.display = 'inline-block';
      document.getElementById('download-btn').style.display = 'none';
      document.getElementById('cancel-btn').style.display = 'inline-block';
      containerEl.style.display = 'block';
      return;
    }

    // Display qualities
    availableQualities = manifestData.qualities || [];

    if (availableQualities.length === 0) {
      throw new Error('No quality variants found');
    }

    displayQualities(availableQualities);

    loadingEl.style.display = 'none';
    containerEl.style.display = 'block';

  } catch (error) {
    console.error('Error loading qualities:', error);
    errorEl.textContent = 'Failed to load qualities: ' + error.message;
    errorEl.style.display = 'block';
    loadingEl.style.display = 'none';

    // Show cancel button
    document.getElementById('cancel-btn').style.display = 'inline-block';
    document.getElementById('quick-btn').style.display = 'inline-block';
    document.getElementById('download-btn').style.display = 'none';
    containerEl.style.display = 'block';
  }
}

// Display quality options
function displayQualities(qualities) {
  const listEl = document.getElementById('qualities-list');
  listEl.innerHTML = '';

  // Sort by bandwidth (highest first)
  qualities.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));

  qualities.forEach((quality, index) => {
    const item = createQualityItem(quality, index);
    listEl.appendChild(item);
  });
}

// Create quality item element
function createQualityItem(quality, index) {
  const div = document.createElement('div');
  div.className = 'quality-item';
  div.dataset.index = index;

  // Header with resolution and label
  const header = document.createElement('div');
  header.className = 'quality-header';

  const resolution = document.createElement('div');
  resolution.className = 'quality-resolution';
  resolution.textContent = quality.resolution || 'Unknown Resolution';
  header.appendChild(resolution);

  // Quality label (high/medium/low based on resolution)
  const label = document.createElement('span');
  label.className = 'quality-label';

  if (quality.resolution) {
    const height = parseInt(quality.resolution.split('x')[1]);
    if (height >= 1080) {
      label.textContent = 'HIGH';
      label.classList.add('high');
    } else if (height >= 720) {
      label.textContent = 'MEDIUM';
      label.classList.add('medium');
    } else {
      label.textContent = 'LOW';
      label.classList.add('low');
    }
  } else {
    label.textContent = 'UNKNOWN';
    label.classList.add('medium');
  }

  header.appendChild(label);
  div.appendChild(header);

  // Details
  const details = document.createElement('div');
  details.className = 'quality-details';

  const detailsArray = [];

  if (quality.bitrate) {
    detailsArray.push(`<span class="quality-detail">📊 ${quality.bitrate}</span>`);
  }

  if (quality.framerate) {
    detailsArray.push(`<span class="quality-detail">🎬 ${quality.framerate}</span>`);
  }

  if (quality.codecs) {
    detailsArray.push(`<span class="quality-detail">🎥 ${quality.codecs}</span>`);
  }

  if (quality.bandwidth) {
    const sizeMB = estimateSize(quality.bandwidth);
    detailsArray.push(`<span class="quality-detail">💾 ~${sizeMB} MB/min</span>`);
  }

  details.innerHTML = detailsArray.join('');
  div.appendChild(details);

  // Click handler
  div.addEventListener('click', () => selectQuality(index));

  return div;
}

// Estimate file size per minute based on bitrate
function estimateSize(bandwidth) {
  // bandwidth is in bits per second
  // Convert to megabytes per minute
  const bytesPerSecond = bandwidth / 8;
  const bytesPerMinute = bytesPerSecond * 60;
  const megabytesPerMinute = bytesPerMinute / (1024 * 1024);

  return Math.round(megabytesPerMinute);
}

// Select a quality
function selectQuality(index) {
  // Remove previous selection
  document.querySelectorAll('.quality-item').forEach(item => {
    item.classList.remove('selected');
  });

  // Select new quality
  const item = document.querySelector(`.quality-item[data-index="${index}"]`);
  if (item) {
    item.classList.add('selected');
    selectedQuality = availableQualities[index];
    document.getElementById('download-btn').disabled = false;
  }
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('cancel-btn').addEventListener('click', closeWindow);

  document.getElementById('download-btn').addEventListener('click', () => {
    if (selectedQuality) {
      startDownload(selectedQuality);
    }
  });

  document.getElementById('quick-btn').addEventListener('click', () => {
    // Download best quality (first in sorted list)
    const bestQuality = availableQualities.length > 0 ? availableQualities[0] : null;
    startDownload(bestQuality);
  });
}

// Start download with selected quality
async function startDownload(quality) {
  try {
    // Send message to background script to start download
    const response = await browser.runtime.sendMessage({
      action: 'startDownload',
      streamData: streamData,
      quality: quality
    });

    if (response && response.success) {
      // Show success message
      showSuccessAndClose();
    } else {
      alert('Failed to start download: ' + (response.error || 'Unknown error'));
    }

  } catch (error) {
    console.error('Error starting download:', error);
    alert('Failed to start download: ' + error.message);
  }
}

// Show success message and close
function showSuccessAndClose() {
  const containerEl = document.querySelector('.container');
  containerEl.innerHTML = `
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 15px;">✓</div>
      <h2 style="margin-bottom: 10px;">Download Started!</h2>
      <p style="color: var(--text-secondary);">Check the Downloads tab to monitor progress.</p>
      <button onclick="window.close()" style="margin-top: 20px; padding: 10px 30px; background-color: #4a90e2; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
    </div>
  `;

  // Auto-close after 3 seconds
  setTimeout(() => {
    window.close();
  }, 3000);
}

// Close window
function closeWindow() {
  window.close();
}
