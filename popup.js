// Popup.js - Main popup functionality with all features

// State management
let currentTab = 'current';
let currentStreams = [];
let allHistory = [];
let currentStats = null;
let filterType = 'all';
let searchQuery = '';

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', async function() {
  setupTabNavigation();
  setupEventListeners();
  await checkConnectionSpeed();
  await loadDetectionState();
  await loadCurrentStreams();
  await loadHistory();
  await loadStatistics();
});

// Tab Navigation
function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');

  currentTab = tabName;

  // Load data for the tab
  if (tabName === 'history') {
    displayHistory();
  } else if (tabName === 'stats') {
    displayStatistics();
  }
}

// Event Listeners Setup
function setupEventListeners() {
  // Search and filter
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    displayStreams();
  });

  document.getElementById('filter-type').addEventListener('change', (e) => {
    filterType = e.target.value;
    displayStreams();
  });

  // Actions
  document.getElementById('copy-all-btn').addEventListener('click', copyAllURLs);
  document.getElementById('export-btn').addEventListener('click', exportStreams);
  document.getElementById('clear-btn').addEventListener('click', clearCurrentStreams);

  // History
  document.getElementById('history-search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    displayHistory();
  });

  document.getElementById('clear-history-btn').addEventListener('click', clearHistory);

  // Stats
  document.getElementById('reset-stats-btn').addEventListener('click', resetStatistics);

  // Detection toggle
  document.getElementById('detection-toggle').addEventListener('change', toggleDetection);
}

// Check connection speed and show warning if slow
async function checkConnectionSpeed() {
  // Check if Network Information API is available
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (!connection) {
    return; // API not available, skip check
  }

  const effectiveType = connection.effectiveType;
  const downlink = connection.downlink; // Mbps
  const saveData = connection.saveData;

  // Show warning for slow connections
  const isSlowConnection =
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    (downlink && downlink < 1) || // Less than 1 Mbps
    saveData === true;

  if (isSlowConnection) {
    showConnectionWarning(effectiveType, downlink);

    // Check if auto-preview is enabled
    const result = await browser.storage.local.get('settings');
    const settings = result.settings || { autoPreview: true };

    if (settings.autoPreview) {
      // Suggest disabling auto-preview
      setTimeout(() => {
        showAutoPreviewSuggestion();
      }, 1000);
    }
  }
}

// Show connection warning banner
function showConnectionWarning(effectiveType, downlink) {
  const toolbar = document.querySelector('.toolbar');

  // Check if banner already exists
  if (document.getElementById('connection-warning')) {
    return;
  }

  const warning = document.createElement('div');
  warning.id = 'connection-warning';
  warning.className = 'connection-warning';
  warning.innerHTML = `
    <span class="warning-icon">⚠</span>
    <span class="warning-text">Slow connection detected (${effectiveType || 'low bandwidth'}). Video previews may load slowly.</span>
    <button class="warning-close" onclick="this.parentElement.remove()">×</button>
  `;

  toolbar.insertAdjacentElement('afterend', warning);
}

// Suggest disabling auto-preview
function showAutoPreviewSuggestion() {
  const warning = document.getElementById('connection-warning');
  if (!warning) return;

  const suggestion = document.createElement('div');
  suggestion.className = 'connection-suggestion';
  suggestion.innerHTML = `
    Tip: You can disable auto-preview in
    <a href="#" id="open-settings-link" style="color: #4a90e2; text-decoration: underline;">Settings</a>
    for faster performance.
  `;

  warning.appendChild(suggestion);

  // Add click handler for settings link
  document.getElementById('open-settings-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
}

// Load detection state
async function loadDetectionState() {
  const result = await browser.storage.local.get('detectionEnabled');
  const enabled = result.detectionEnabled !== undefined ? result.detectionEnabled : true;

  const toggle = document.getElementById('detection-toggle');
  toggle.checked = enabled;

  // Update label color to show state
  updateDetectionLabel(enabled);
}

// Toggle detection on/off
async function toggleDetection(event) {
  const enabled = event.target.checked;

  // Save to storage
  await browser.storage.local.set({ detectionEnabled: enabled });

  // Send message to background script
  await browser.runtime.sendMessage({
    action: 'setDetection',
    enabled: enabled
  });

  // Update visual feedback
  updateDetectionLabel(enabled);

  // Show feedback
  console.log(`Detection ${enabled ? 'enabled' : 'disabled'}`);
}

// Update detection label styling
function updateDetectionLabel(enabled) {
  const label = document.querySelector('.toggle-label');
  if (enabled) {
    label.style.color = '#555';
  } else {
    label.style.color = '#d9534f';
    label.textContent = 'Detection: (Paused)';
    setTimeout(() => {
      label.textContent = 'Detection:';
    }, 2000);
  }
}

// Load current tab streams from background
async function loadCurrentStreams() {
  const response = await browser.runtime.sendMessage({action: 'getStreams'});
  currentStreams = response.streams || [];
  displayStreams();
}

// Display streams in current tab
function displayStreams() {
  const streamsList = document.getElementById('streams-list');
  const noStreamsMsg = document.getElementById('no-streams');

  // Filter streams
  let filtered = currentStreams.filter(stream => {
    const matchesSearch = !searchQuery ||
      stream.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.domain.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterType === 'all' || stream.type === filterType;

    return matchesSearch && matchesFilter;
  });

  if (filtered.length === 0) {
    noStreamsMsg.style.display = 'block';
    streamsList.innerHTML = '';
    document.getElementById('actions-container').style.display = 'none';
    return;
  }

  noStreamsMsg.style.display = 'none';
  document.getElementById('actions-container').style.display = 'flex';

  streamsList.innerHTML = '';

  filtered.forEach((stream, index) => {
    const streamItem = createStreamElement(stream, index);
    streamsList.appendChild(streamItem);
  });

  // Auto-load details for streams that support it
  filtered.forEach((stream, index) => {
    if (stream.type === 'm3u8' || stream.type === 'm3u' || stream.type === 'mpd') {
      setTimeout(() => loadDetails(stream, index), 50);
    }
  });

  // Auto-load previews if setting is enabled
  checkAutoPreview(filtered);
}

// Check if auto-preview is enabled and load previews
async function checkAutoPreview(streams) {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || { autoPreview: true };

  if (settings.autoPreview && streams.length > 0) {
    // Load all previews immediately
    streams.forEach((stream, index) => {
      togglePreview(stream, index);
    });
  }
}

// Create stream element with all features
function createStreamElement(stream, index) {
  const div = document.createElement('div');
  div.className = 'stream-item';

  // Header with badge and quality
  const header = document.createElement('div');
  header.className = 'stream-header';

  const badge = document.createElement('span');
  badge.className = `stream-type-badge badge-${stream.type}`;
  badge.textContent = stream.type.toUpperCase();
  header.appendChild(badge);

  if (stream.quality) {
    const quality = document.createElement('span');
    quality.className = 'stream-quality';
    quality.textContent = stream.quality;
    header.appendChild(quality);
  }

  const status = document.createElement('span');
  status.id = `status-${index}`;

  // Display pre-validated results if available
  if (stream.validationStatus !== undefined) {
    if (stream.validationValid) {
      status.textContent = `✓ ${stream.validationStatus}`;
      status.className = 'stream-status status-validated';
    } else {
      status.textContent = `✗ ${stream.validationError || 'Failed'}`;
      status.className = 'stream-status status-error';
    }
  } else {
    status.textContent = '';
    status.className = 'stream-status status-unknown';
  }

  header.appendChild(status);

  div.appendChild(header);

  // Body with URL and actions
  const body = document.createElement('div');
  body.className = 'stream-body';

  const urlDiv = document.createElement('div');
  urlDiv.className = 'stream-url';
  urlDiv.textContent = stream.url;
  urlDiv.title = stream.url;
  body.appendChild(urlDiv);

  const actions = document.createElement('div');
  actions.className = 'stream-actions';

  // Copy button with dropdown
  const copyDropdown = createCopyDropdown(stream.url);
  actions.appendChild(copyDropdown);

  // Validate button
  const validateBtn = document.createElement('button');
  validateBtn.className = 'small-btn validate-btn';
  validateBtn.textContent = 'Test';
  validateBtn.addEventListener('click', () => validateStream(stream.url, index));
  actions.appendChild(validateBtn);

  // Preview button
  const previewBtn = document.createElement('button');
  previewBtn.className = 'small-btn preview-btn';
  previewBtn.textContent = 'Preview';
  previewBtn.id = `preview-btn-${index}`;
  previewBtn.addEventListener('click', () => togglePreview(stream, index));
  actions.appendChild(previewBtn);

  // Open Player button
  const playerBtn = document.createElement('button');
  playerBtn.className = 'small-btn player-btn';
  playerBtn.textContent = '⛶ Play';
  playerBtn.addEventListener('click', () => openInPlayer(stream));
  actions.appendChild(playerBtn);

  body.appendChild(actions);
  div.appendChild(body);

  // Details section (initially hidden)
  const details = document.createElement('div');
  details.className = 'stream-details';
  details.id = `details-${index}`;
  div.appendChild(details);

  // Preview section (initially hidden)
  const preview = document.createElement('div');
  preview.className = 'stream-preview';
  preview.id = `preview-${index}`;
  div.appendChild(preview);

  return div;
}

// Create copy dropdown with player commands
function createCopyDropdown(url) {
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy ▾';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const content = dropdown.querySelector('.dropdown-content');
    content.classList.toggle('show');
  });
  dropdown.appendChild(copyBtn);

  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'dropdown-content';

  const commands = [
    { label: 'Copy URL', value: url },
    { label: 'VLC Command', value: `vlc "${url}"` },
    { label: 'mpv Command', value: `mpv "${url}"` },
    { label: 'ffmpeg Command', value: `ffmpeg -i "${url}" -c copy output.mp4` },
    { label: 'youtube-dl', value: `youtube-dl "${url}"` },
    { label: 'yt-dlp', value: `yt-dlp "${url}"` }
  ];

  commands.forEach(cmd => {
    const btn = document.createElement('button');
    btn.textContent = cmd.label;
    btn.addEventListener('click', () => {
      copyToClipboard(cmd.value, copyBtn);
      dropdownContent.classList.remove('show');
    });
    dropdownContent.appendChild(btn);
  });

  dropdown.appendChild(dropdownContent);

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdownContent.classList.remove('show');
  });

  return dropdown;
}

// Copy to clipboard
function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

// Validate stream
async function validateStream(url, index) {
  const statusEl = document.getElementById(`status-${index}`);
  statusEl.textContent = 'Testing...';
  statusEl.className = 'stream-status status-unknown';

  const response = await browser.runtime.sendMessage({
    action: 'validateStream',
    url: url
  });

  if (response.valid) {
    statusEl.textContent = `✓ ${response.status}`;
    statusEl.className = 'stream-status status-validated';
  } else {
    statusEl.textContent = `✗ ${response.error || 'Failed'}`;
    statusEl.className = 'stream-status status-error';
  }
}

// Load details automatically (manifest parsing)
async function loadDetails(stream, index) {
  const detailsEl = document.getElementById(`details-${index}`);

  detailsEl.innerHTML = `
    <div class="details-skeleton">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>
  `;
  detailsEl.classList.add('show');

  try {
    const manifestData = await ManifestParser.parseManifest(stream.url, stream.type);

    if (manifestData.type === 'error') {
      detailsEl.innerHTML = `<div class="stream-details-content">Error: ${manifestData.message}</div>`;
      return;
    }

    if (manifestData.type === 'simple' || manifestData.type === 'unsupported') {
      detailsEl.innerHTML = `<div class="stream-details-content">${manifestData.message}</div>`;
      return;
    }

    // Display quality information
    let html = '<div class="stream-details-content">';
    html += `<strong>Available Qualities (${manifestData.count}):</strong>`;
    html += '<ul class="quality-list">';

    manifestData.qualities.forEach(quality => {
      html += `<li>${ManifestParser.formatQuality(quality)}`;
      if (quality.codecs) {
        html += ` <span style="color: #999;">(${quality.codecs})</span>`;
      }
      html += '</li>';
    });

    html += '</ul></div>';
    detailsEl.innerHTML = html;

  } catch (error) {
    detailsEl.innerHTML = `<div class="stream-details-content">Error parsing manifest: ${error.message}</div>`;
  }
}

// Global storage for HLS instances
const hlsInstances = {};

// Toggle preview (live video)
async function togglePreview(stream, index) {
  const previewEl = document.getElementById(`preview-${index}`);
  const previewBtn = document.getElementById(`preview-btn-${index}`);

  // If already showing, hide and cleanup
  if (previewEl.classList.contains('show')) {
    previewEl.classList.remove('show');
    previewBtn.classList.remove('active');
    previewBtn.textContent = 'Preview';

    // Cleanup HLS instance if exists
    if (hlsInstances[index]) {
      hlsInstances[index].destroy();
      delete hlsInstances[index];
    }

    previewEl.innerHTML = '';
    return;
  }

  // Show preview and update button
  previewBtn.classList.add('active');
  previewBtn.textContent = 'Close';
  previewEl.innerHTML = '<div class="preview-skeleton"></div>';
  previewEl.classList.add('show');

  try {
    // Create video element
    const video = document.createElement('video');
    video.className = 'preview-video';
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;

    // Create wrapper for video and overlay
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-container-wrapper';

    // Create close button for preview
    const closeBtn = document.createElement('button');
    closeBtn.className = 'preview-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close preview';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePreview(stream, index);
    });

    // Create info overlay
    const infoOverlay = document.createElement('div');
    infoOverlay.className = 'stream-info-overlay';
    infoOverlay.innerHTML = '<div class="info-line info-primary">Loading...</div>';

    // Function to update stream info
    function updateStreamInfo(hls = null) {
      const resolution = video.videoWidth && video.videoHeight
        ? `${video.videoWidth}x${video.videoHeight}`
        : 'Unknown';

      let bitrate = 'Unknown';
      let fps = '';
      let codec = '';

      if (hls && hls.levels && hls.levels.length > 0) {
        const currentLevel = hls.currentLevel >= 0 ? hls.currentLevel : 0;
        const level = hls.levels[currentLevel];

        if (level.bitrate) {
          bitrate = Math.round(level.bitrate / 1000) + ' Kbps';
        }

        if (level.attrs && level.attrs['FRAME-RATE']) {
          fps = Math.round(level.attrs['FRAME-RATE']) + ' fps';
        }

        if (level.videoCodec) {
          codec = level.videoCodec;
          if (level.audioCodec) {
            codec += ', ' + level.audioCodec;
          }
        }
      }

      let infoHTML = `<div class="info-line info-primary">${resolution}`;
      if (fps) infoHTML += ` • ${fps}`;
      infoHTML += `</div>`;
      infoHTML += `<div class="info-line info-secondary">${bitrate}</div>`;
      if (codec) {
        infoHTML += `<div class="info-line info-secondary">${codec}</div>`;
      }

      infoOverlay.innerHTML = infoHTML;
    }

    // Handle different stream types
    if (stream.type === 'm3u8' || stream.type === 'm3u') {
      // Use HLS.js for M3U8 streams
      if (Hls.isSupported()) {
        // Get quality preference from settings
        const result = await browser.storage.local.get('settings');
        const settings = result.settings || { previewQuality: 'medium' };
        const quality = settings.previewQuality || 'medium';

        // Configure HLS.js based on quality preference
        const hlsConfig = {
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: quality === 'low' ? 5 : quality === 'high' ? 20 : 10,
          maxBufferLength: quality === 'low' ? 10 : quality === 'high' ? 60 : 30,
          maxMaxBufferLength: quality === 'low' ? 20 : quality === 'high' ? 120 : 60
        };

        // For low quality, prefer lower bitrate levels
        if (quality === 'low') {
          hlsConfig.startLevel = 0; // Start with lowest quality
          hlsConfig.capLevelToPlayerSize = true; // Don't exceed player size
        } else if (quality === 'high') {
          hlsConfig.startLevel = -1; // Auto-select (usually highest)
        }

        const hls = new Hls(hlsConfig);

        hls.loadSource(stream.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          previewEl.innerHTML = '';
          wrapper.appendChild(video);
          wrapper.appendChild(infoOverlay);
          wrapper.appendChild(closeBtn);
          previewEl.appendChild(wrapper);

          video.play().catch(err => {
            previewEl.innerHTML = `<div class="preview-error">Playback error: ${err.message}</div>`;
          });

          // Update info when video metadata loads
          video.addEventListener('loadedmetadata', () => {
            updateStreamInfo(hls);
          });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          updateStreamInfo(hls);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            previewEl.innerHTML = `<div class="preview-error">Failed to load stream: ${data.type}</div>`;
            previewBtn.classList.remove('active');
            previewBtn.textContent = 'Preview';
            hls.destroy();
          }
        });

        // Store instance for cleanup
        hlsInstances[index] = hls;

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari, some browsers)
        video.src = stream.url;
        previewEl.innerHTML = '';
        wrapper.appendChild(video);
        wrapper.appendChild(infoOverlay);
        wrapper.appendChild(closeBtn);
        previewEl.appendChild(wrapper);

        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo();
        });

      } else {
        previewEl.innerHTML = '<div class="preview-error">HLS not supported in this browser</div>';
        previewBtn.classList.remove('active');
        previewBtn.textContent = 'Preview';
      }

    } else if (stream.type === 'mpd') {
      // Try native DASH support (Firefox supports it)
      video.src = stream.url;
      previewEl.innerHTML = '';
      wrapper.appendChild(video);
      wrapper.appendChild(infoOverlay);
      wrapper.appendChild(closeBtn);
      previewEl.appendChild(wrapper);

      video.addEventListener('loadedmetadata', () => {
        updateStreamInfo();
      });

      video.addEventListener('error', (e) => {
        previewEl.innerHTML = '<div class="preview-error">Failed to load DASH stream. May require additional plugin.</div>';
        previewBtn.classList.remove('active');
        previewBtn.textContent = 'Preview';
      });

    } else {
      // Try native playback for other formats
      video.src = stream.url;
      previewEl.innerHTML = '';
      wrapper.appendChild(video);
      wrapper.appendChild(infoOverlay);
      wrapper.appendChild(closeBtn);
      previewEl.appendChild(wrapper);

      video.addEventListener('loadedmetadata', () => {
        updateStreamInfo();
      });

      video.addEventListener('error', (e) => {
        previewEl.innerHTML = '<div class="preview-error">Unsupported stream format or CORS restriction</div>';
        previewBtn.classList.remove('active');
        previewBtn.textContent = 'Preview';
      });
    }

  } catch (error) {
    previewEl.innerHTML = `<div class="preview-error">Error loading preview: ${error.message}</div>`;
    previewBtn.classList.remove('active');
    previewBtn.textContent = 'Preview';
  }
}

// Open stream in full-screen player
function openInPlayer(stream) {
  const playerUrl = browser.runtime.getURL('player.html') +
    `?url=${encodeURIComponent(stream.url)}&type=${stream.type}`;
  browser.tabs.create({ url: playerUrl });
}

// Copy all URLs
async function copyAllURLs() {
  const urls = currentStreams.map(s => s.url).join('\n');
  await copyToClipboard(urls, document.getElementById('copy-all-btn'));
}

// Export streams
async function exportStreams() {
  const data = await StorageManager.exportData('json');
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `streams_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// Clear current streams
async function clearCurrentStreams() {
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  const tabId = tabs[0].id;

  await browser.runtime.sendMessage({
    action: 'clearStreams',
    tabId: tabId
  });

  currentStreams = [];
  displayStreams();
}

// Load history
async function loadHistory() {
  allHistory = await StorageManager.getHistory();
}

// Display history
function displayHistory() {
  const historyList = document.getElementById('history-list');
  const noHistoryMsg = document.getElementById('no-history');

  let filtered = allHistory;

  if (searchQuery) {
    filtered = allHistory.filter(item =>
      item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.pageTitle.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  if (filtered.length === 0) {
    noHistoryMsg.style.display = 'block';
    historyList.innerHTML = '';
    return;
  }

  noHistoryMsg.style.display = 'none';
  historyList.innerHTML = '';

  filtered.forEach(item => {
    const historyItem = createHistoryElement(item);
    historyList.appendChild(historyItem);
  });
}

// Create history element
function createHistoryElement(item) {
  const div = document.createElement('div');
  div.className = 'history-item';

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const domain = document.createElement('span');
  domain.className = 'history-domain';
  domain.textContent = item.domain;
  meta.appendChild(domain);

  const date = document.createElement('span');
  date.textContent = new Date(item.timestamp).toLocaleString();
  meta.appendChild(date);

  div.appendChild(meta);

  const header = document.createElement('div');
  header.className = 'stream-header';

  const badge = document.createElement('span');
  badge.className = `stream-type-badge badge-${item.type}`;
  badge.textContent = item.type.toUpperCase();
  header.appendChild(badge);

  if (item.pageTitle) {
    const title = document.createElement('span');
    title.style.fontSize = '11px';
    title.style.color = '#999';
    title.textContent = item.pageTitle;
    header.appendChild(title);
  }

  div.appendChild(header);

  const body = document.createElement('div');
  body.className = 'stream-body';

  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = item.url;
  body.appendChild(url);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyToClipboard(item.url, copyBtn));
  body.appendChild(copyBtn);

  div.appendChild(body);

  return div;
}

// Clear history
async function clearHistory() {
  if (confirm('Are you sure you want to clear all history?')) {
    await browser.runtime.sendMessage({action: 'clearHistory'});
    allHistory = [];
    displayHistory();
  }
}

// Load statistics
async function loadStatistics() {
  currentStats = await StorageManager.getStats();
  const sessionCount = await StorageManager.getSessionCount();
  currentStats.sessionCount = sessionCount;
}

// Display statistics
function displayStatistics() {
  // Update summary cards
  document.getElementById('total-streams').textContent = currentStats.total || 0;
  document.getElementById('current-session').textContent = currentStats.sessionCount || 0;

  // Display by format
  const formatStats = document.getElementById('format-stats');
  formatStats.innerHTML = '';

  const byType = Object.entries(currentStats.byType).sort((a, b) => b[1] - a[1]);

  if (byType.length === 0) {
    formatStats.innerHTML = '<div class="stats-list-item"><span class="stats-label">No data yet</span></div>';
  } else {
    byType.forEach(([type, count]) => {
      const item = document.createElement('div');
      item.className = 'stats-list-item';

      const label = document.createElement('span');
      label.className = 'stats-label';
      label.textContent = type.toUpperCase();
      item.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-value';
      value.textContent = count;
      item.appendChild(value);

      formatStats.appendChild(item);
    });
  }

  // Display top domains
  const domainStats = document.getElementById('domain-stats');
  domainStats.innerHTML = '';

  const byDomain = Object.entries(currentStats.byDomain).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (byDomain.length === 0) {
    domainStats.innerHTML = '<div class="stats-list-item"><span class="stats-label">No data yet</span></div>';
  } else {
    byDomain.forEach(([domain, count]) => {
      const item = document.createElement('div');
      item.className = 'stats-list-item';

      const label = document.createElement('span');
      label.className = 'stats-label';
      label.textContent = domain;
      item.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-value';
      value.textContent = count;
      item.appendChild(value);

      domainStats.appendChild(item);
    });
  }
}

// Reset statistics
async function resetStatistics() {
  if (confirm('Are you sure you want to reset all statistics?')) {
    await browser.runtime.sendMessage({action: 'resetStats'});
    await loadStatistics();
    displayStatistics();
  }
}
