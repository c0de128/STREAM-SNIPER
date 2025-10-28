// Popup.js - Main popup functionality with all features

// State management
let currentTab = 'current';
let currentStreams = [];
let allHistory = [];
let allFavorites = [];
let currentStats = null;
let filterType = 'all';
let searchQuery = '';
let favoritesSearchQuery = '';

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', async function() {
  await applyTheme();
  setupTabNavigation();
  setupEventListeners();
  await checkConnectionSpeed();
  await loadDetectionState();
  await loadCurrentStreams();
  await loadDownloads();
  await loadFavorites();
  await loadHistory();
  await loadStatistics();

  // Listen for download progress updates from background
  setupDownloadListeners();
});

// Apply theme based on settings
async function applyTheme() {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || { darkMode: false };

  if (settings.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

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
  if (tabName === 'favorites') {
    displayFavorites();
  } else if (tabName === 'history') {
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

  // Favorites
  document.getElementById('favorites-search-input').addEventListener('input', (e) => {
    favoritesSearchQuery = e.target.value;
    displayFavorites();
  });

  document.getElementById('clear-favorites-btn').addEventListener('click', clearFavorites);

  // Stats
  document.getElementById('reset-stats-btn').addEventListener('click', resetStatistics);

  // Detection toggle
  document.getElementById('detection-toggle').addEventListener('change', toggleDetection);

  // Downloads
  document.getElementById('pause-all-btn').addEventListener('click', pauseAllDownloads);
  document.getElementById('clear-completed-btn').addEventListener('click', clearCompletedDownloads);
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

  // Favorite button
  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'small-btn favorite-btn';
  favoriteBtn.id = `favorite-btn-${index}`;
  favoriteBtn.textContent = '☆';
  favoriteBtn.title = 'Add to favorites';
  favoriteBtn.addEventListener('click', () => toggleStreamFavorite(stream, favoriteBtn));
  actions.appendChild(favoriteBtn);

  // Check if already favorited and update button
  StorageManager.isFavorite(stream.url).then(isFav => {
    if (isFav) {
      favoriteBtn.textContent = '★';
      favoriteBtn.classList.add('favorited');
      favoriteBtn.title = 'Remove from favorites';
    }
  });

  // Copy button with dropdown
  const copyDropdown = createCopyDropdown(stream.url);
  actions.appendChild(copyDropdown);

  // Download button with dropdown
  const downloadDropdown = createDownloadDropdown(stream, index);
  actions.appendChild(downloadDropdown);

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

// Create download dropdown with download options
function createDownloadDropdown(stream) {
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  downloadBtn.textContent = '↓ Download ▾';
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const content = dropdown.querySelector('.dropdown-content');
    content.classList.toggle('show');
  });
  dropdown.appendChild(downloadBtn);

  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'dropdown-content';

  const options = [
    {
      label: 'Download Best Quality',
      action: () => downloadBestQuality(stream)
    },
    {
      label: 'Select Quality...',
      action: () => openQualitySelector(stream)
    },
    {
      label: 'Add to Download Queue',
      action: () => addToDownloadQueue(stream)
    }
  ];

  options.forEach(option => {
    const btn = document.createElement('button');
    btn.textContent = option.label;
    btn.addEventListener('click', () => {
      option.action();
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

// Download best quality directly
async function downloadBestQuality(stream) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'startDownload',
      streamData: stream,
      quality: null // Will auto-select best quality
    });

    if (response && response.success) {
      showDownloadStartedNotification(stream);
      // Switch to downloads tab
      switchTab('downloads');
    } else {
      alert('Failed to start download: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error starting download:', error);
    alert('Failed to start download: ' + error.message);
  }
}

// Open quality selector in new window
function openQualitySelector(stream) {
  const params = new URLSearchParams({
    url: stream.url,
    type: stream.type,
    domain: stream.domain,
    title: stream.pageTitle || 'Stream',
    pageUrl: stream.pageUrl || ''
  });

  const selectorUrl = browser.runtime.getURL('quality-selector.html') + '?' + params.toString();

  browser.windows.create({
    url: selectorUrl,
    type: 'popup',
    width: 600,
    height: 700
  });
}

// Add to download queue without starting
async function addToDownloadQueue(stream) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'addToQueue',
      streamData: stream
    });

    if (response && response.success) {
      showNotification('Added to download queue', 'Stream will be downloaded when ready');
      switchTab('downloads');
    } else {
      alert('Failed to add to queue: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error adding to queue:', error);
    alert('Failed to add to queue: ' + error.message);
  }
}

// Show download started notification
function showDownloadStartedNotification(stream) {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'download-toast';
  toast.innerHTML = `
    <div class="toast-icon">↓</div>
    <div class="toast-content">
      <div class="toast-title">Download Started</div>
      <div class="toast-message">Downloading from ${stream.domain}</div>
    </div>
  `;
  document.body.appendChild(toast);

  // Show toast
  setTimeout(() => toast.classList.add('show'), 10);

  // Hide and remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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

// Global storage for HLS and DASH instances
const hlsInstances = {};
const dashInstances = {};

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

    // Cleanup DASH instance if exists
    if (dashInstances[index]) {
      dashInstances[index].reset();
      delete dashInstances[index];
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
      // Use dash.js for MPEG-DASH streams
      if (typeof dashjs !== 'undefined') {
        const dashPlayer = dashjs.MediaPlayer().create();

        // Configure dash.js
        dashPlayer.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              bufferTimeAtTopQuality: 30,
              bufferTimeAtTopQualityLongForm: 60
            }
          }
        });

        dashPlayer.initialize(video, stream.url, true);

        dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          previewEl.innerHTML = '';
          wrapper.appendChild(video);
          wrapper.appendChild(infoOverlay);
          wrapper.appendChild(closeBtn);
          previewEl.appendChild(wrapper);

          video.play().catch(err => {
            previewEl.innerHTML = `<div class="preview-error">Playback error: ${err.message}</div>`;
          });
        });

        dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          previewEl.innerHTML = `<div class="preview-error">Failed to load DASH stream: ${e.error}</div>`;
          previewBtn.classList.remove('active');
          previewBtn.textContent = 'Preview';
          dashPlayer.reset();
        });

        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo();
        });

        // Store instance for cleanup
        dashInstances[index] = dashPlayer;

      } else {
        // Fallback to native DASH support
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
      }

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

// ========== FAVORITES FUNCTIONS ==========

// Load favorites
async function loadFavorites() {
  allFavorites = await StorageManager.getFavorites();
}

// Display favorites
function displayFavorites() {
  const favoritesList = document.getElementById('favorites-list');
  const noFavoritesMsg = document.getElementById('no-favorites');

  let filtered = allFavorites;

  if (favoritesSearchQuery) {
    filtered = allFavorites.filter(item =>
      item.url.toLowerCase().includes(favoritesSearchQuery.toLowerCase()) ||
      item.domain.toLowerCase().includes(favoritesSearchQuery.toLowerCase()) ||
      (item.pageTitle && item.pageTitle.toLowerCase().includes(favoritesSearchQuery.toLowerCase()))
    );
  }

  if (filtered.length === 0) {
    noFavoritesMsg.style.display = 'block';
    favoritesList.innerHTML = '';
    return;
  }

  noFavoritesMsg.style.display = 'none';
  favoritesList.innerHTML = '';

  filtered.forEach(item => {
    const favoriteItem = createFavoriteElement(item);
    favoritesList.appendChild(favoriteItem);
  });
}

// Create favorite element
function createFavoriteElement(item) {
  const div = document.createElement('div');
  div.className = 'favorite-item';

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const domain = document.createElement('span');
  domain.className = 'history-domain';
  domain.textContent = item.domain;
  meta.appendChild(domain);

  const date = document.createElement('span');
  date.textContent = new Date(item.addedAt || item.timestamp).toLocaleString();
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
    title.style.color = 'var(--text-muted)';
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

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '5px';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyToClipboard(item.url, copyBtn));
  actions.appendChild(copyBtn);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'small-btn secondary';
  removeBtn.textContent = '★ Remove';
  removeBtn.addEventListener('click', async () => {
    await StorageManager.removeFavorite(item.url);
    await loadFavorites();
    displayFavorites();
  });
  actions.appendChild(removeBtn);

  body.appendChild(actions);
  div.appendChild(body);

  return div;
}

// Clear all favorites
async function clearFavorites() {
  if (confirm('Are you sure you want to clear all favorites?')) {
    await StorageManager.clearFavorites();
    allFavorites = [];
    displayFavorites();
  }
}

// Toggle favorite for a stream
async function toggleStreamFavorite(stream, button) {
  const isFavorited = await StorageManager.toggleFavorite(stream);

  if (isFavorited) {
    button.textContent = '★';
    button.classList.add('favorited');
    button.title = 'Remove from favorites';
  } else {
    button.textContent = '☆';
    button.classList.remove('favorited');
    button.title = 'Add to favorites';
  }

  // Reload favorites list
  await loadFavorites();
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

// ========== DOWNLOADS FUNCTIONS ==========

let allDownloads = [];

// Load downloads from background
async function loadDownloads() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getDownloads' });
    allDownloads = response.downloads || [];
    displayDownloads();
  } catch (error) {
    console.error('Error loading downloads:', error);
  }
}

// Display downloads in Downloads tab
function displayDownloads() {
  const downloadsList = document.getElementById('downloads-list');
  const noDownloadsMsg = document.getElementById('no-downloads');
  const activeCountEl = document.getElementById('active-downloads');

  if (allDownloads.length === 0) {
    noDownloadsMsg.style.display = 'block';
    downloadsList.innerHTML = '';
    activeCountEl.textContent = '0';
    return;
  }

  noDownloadsMsg.style.display = 'none';
  downloadsList.innerHTML = '';

  // Count active downloads
  const activeCount = allDownloads.filter(d =>
    ['queued', 'downloading', 'paused'].includes(d.state)
  ).length;
  activeCountEl.textContent = activeCount;

  // Display downloads (newest first)
  allDownloads.forEach(download => {
    const downloadItem = createDownloadElement(download);
    downloadsList.appendChild(downloadItem);
  });
}

// Create download element
function createDownloadElement(download) {
  const div = document.createElement('div');
  div.className = 'download-item';
  div.dataset.downloadId = download.id;

  // Header
  const header = document.createElement('div');
  header.className = 'download-header';

  const info = document.createElement('div');
  info.className = 'download-info';

  const filename = document.createElement('div');
  filename.className = 'download-filename';
  filename.textContent = download.filename;
  filename.title = download.filename;
  info.appendChild(filename);

  const domain = document.createElement('div');
  domain.className = 'download-domain';
  domain.textContent = `From: ${download.domain}`;
  info.appendChild(domain);

  header.appendChild(info);

  // State badge
  const stateBadge = document.createElement('span');
  stateBadge.className = `download-state ${download.state}`;
  stateBadge.textContent = download.state;
  header.appendChild(stateBadge);

  // Method badge
  if (download.method) {
    const methodBadge = document.createElement('span');
    methodBadge.className = `download-method ${download.method}`;
    methodBadge.textContent = download.method;
    header.appendChild(methodBadge);
  }

  div.appendChild(header);

  // Progress bar (only for downloading/paused states)
  if (['downloading', 'paused', 'queued'].includes(download.state)) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'download-progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'download-progress-bar';

    const progressFill = document.createElement('div');
    progressFill.className = `download-progress-fill ${download.state === 'failed' ? 'failed' : ''}`;
    progressFill.style.width = `${download.progress}%`;
    progressBar.appendChild(progressFill);

    progressContainer.appendChild(progressBar);

    // Progress info
    const progressInfo = document.createElement('div');
    progressInfo.className = 'download-progress-info';

    const percentage = document.createElement('span');
    percentage.className = 'download-percentage';
    percentage.textContent = `${download.progress}%`;
    progressInfo.appendChild(percentage);

    if (download.speed > 0) {
      const speed = document.createElement('span');
      speed.className = 'download-speed';
      speed.textContent = formatSpeed(download.speed);
      progressInfo.appendChild(speed);
    }

    if (download.eta > 0) {
      const eta = document.createElement('span');
      eta.className = 'download-eta';
      eta.textContent = `ETA: ${formatTime(download.eta)}`;
      progressInfo.appendChild(eta);
    }

    progressContainer.appendChild(progressInfo);

    // Bytes info
    if (download.totalBytes > 0) {
      const bytes = document.createElement('div');
      bytes.className = 'download-bytes';
      bytes.innerHTML = `<strong>${formatBytes(download.bytesReceived)}</strong> / ${formatBytes(download.totalBytes)}`;
      progressContainer.appendChild(bytes);
    }

    div.appendChild(progressContainer);
  }

  // Error message (if failed)
  if (download.state === 'failed' && download.error) {
    const error = document.createElement('div');
    error.className = 'download-error';
    error.textContent = `Error: ${download.error}`;
    div.appendChild(error);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'download-actions-btns';

  if (download.state === 'downloading') {
    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'download-action-btn pause';
    pauseBtn.textContent = 'Pause';
    pauseBtn.addEventListener('click', () => pauseDownload(download.id));
    actions.appendChild(pauseBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'download-action-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelDownload(download.id));
    actions.appendChild(cancelBtn);
  }

  if (download.state === 'paused') {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'download-action-btn';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => resumeDownload(download.id));
    actions.appendChild(resumeBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'download-action-btn cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelDownload(download.id));
    actions.appendChild(cancelBtn);
  }

  if (download.state === 'failed') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'download-action-btn retry';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => retryDownload(download.id));
    actions.appendChild(retryBtn);
  }

  if (download.state === 'completed') {
    const completedMsg = document.createElement('span');
    completedMsg.style.fontSize = '11px';
    completedMsg.style.color = '#28a745';
    completedMsg.textContent = '✓ Download completed';
    actions.appendChild(completedMsg);
  }

  div.appendChild(actions);

  return div;
}

// Download action functions
async function pauseDownload(downloadId) {
  try {
    await browser.runtime.sendMessage({
      action: 'pauseDownload',
      downloadId: downloadId
    });
    await loadDownloads();
  } catch (error) {
    console.error('Error pausing download:', error);
  }
}

async function resumeDownload(downloadId) {
  try {
    await browser.runtime.sendMessage({
      action: 'resumeDownload',
      downloadId: downloadId
    });
    await loadDownloads();
  } catch (error) {
    console.error('Error resuming download:', error);
  }
}

async function cancelDownload(downloadId) {
  if (confirm('Are you sure you want to cancel this download?')) {
    try {
      await browser.runtime.sendMessage({
        action: 'cancelDownload',
        downloadId: downloadId
      });
      await loadDownloads();
    } catch (error) {
      console.error('Error cancelling download:', error);
    }
  }
}

async function retryDownload(downloadId) {
  try {
    await browser.runtime.sendMessage({
      action: 'retryDownload',
      downloadId: downloadId
    });
    await loadDownloads();
  } catch (error) {
    console.error('Error retrying download:', error);
  }
}

async function pauseAllDownloads() {
  const activeDownloads = allDownloads.filter(d => d.state === 'downloading');

  for (const download of activeDownloads) {
    await pauseDownload(download.id);
  }
}

async function clearCompletedDownloads() {
  try {
    await browser.runtime.sendMessage({ action: 'clearCompletedDownloads' });
    await loadDownloads();
  } catch (error) {
    console.error('Error clearing completed downloads:', error);
  }
}

// Setup download listeners for real-time updates
function setupDownloadListeners() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'downloadProgress' ||
        message.action === 'downloadComplete' ||
        message.action === 'downloadFailed') {
      // Reload downloads to show updated state
      loadDownloads();
    }
  });

  // Auto-refresh downloads every 2 seconds when Downloads tab is active
  setInterval(() => {
    if (currentTab === 'downloads') {
      loadDownloads();
    }
  }, 2000);
}

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
  return formatBytes(bytesPerSecond) + '/s';
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
