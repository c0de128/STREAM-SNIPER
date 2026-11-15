// Stream Sniper popup - core
// Globals, initialisation, tab navigation, event wiring, keyboard shortcuts and shared helpers.
// The remaining popup-*.js modules are loaded after this file and share its global scope.

// State management
let currentTab = 'current';
let currentStreams = [];
let allHistory = [];
let allFavorites = [];
let currentStats = null;
let filterType = 'all';
let searchQuery = '';
let favoritesSearchQuery = '';
let historySearchQuery = '';
let historyDomain = '';
let historyDays = 0;
let historyType = '';

// Batch download state
let selectedStreams = new Set();
let batchPriority = 'NORMAL';

// Initialize when popup loads
document.addEventListener('DOMContentLoaded', async function() {
  await applyTheme();
  setupTabNavigation();
  setupEventListeners();
  setupKeyboardShortcuts();
  await checkConnectionSpeed();
  await loadDetectionState();
  await loadCurrentStreams();
  await loadDownloads();
  await loadRecordings();
  await loadFavorites();
  await loadHistory();
  await loadStatistics();

  // Listen for download and recording progress updates from background
  setupDownloadListeners();
  setupRecordingListeners();
  setupQualityModalListeners();
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
  if (tabName === 'recordings') {
    displayRecordings();
  } else if (tabName === 'favorites') {
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
    historySearchQuery = e.target.value;
    displayHistory();
  });
  document.getElementById('history-domain').addEventListener('change', (e) => {
    historyDomain = e.target.value;
    displayHistory();
  });
  document.getElementById('history-range').addEventListener('change', (e) => {
    historyDays = parseInt(e.target.value, 10) || 0;
    displayHistory();
  });
  document.getElementById('history-type').addEventListener('change', (e) => {
    historyType = e.target.value;
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
  document.getElementById('refresh-analytics-btn').addEventListener('click', async () => {
    await loadStatistics();
    await displayStatistics();
  });
  document.getElementById('reset-stats-btn').addEventListener('click', resetStatistics);

  // Detection toggle
  document.getElementById('detection-toggle').addEventListener('change', toggleDetection);

  // Downloads
  document.getElementById('pause-all-btn').addEventListener('click', pauseAllDownloads);
  document.getElementById('clear-completed-btn').addEventListener('click', clearCompletedDownloads);

  // Recordings
  document.getElementById('stop-all-recordings-btn').addEventListener('click', stopAllRecordings);
  document.getElementById('clear-completed-recordings-btn').addEventListener('click', clearCompletedRecordings);

  // Batch downloads
  document.getElementById('select-all-btn').addEventListener('click', selectAllStreams);
  document.getElementById('clear-selection-btn').addEventListener('click', clearStreamSelection);
  document.getElementById('batch-priority').addEventListener('change', (e) => {
    batchPriority = e.target.value;
  });
  document.getElementById('start-batch-btn').addEventListener('click', startBatchDownload);

  // Settings access
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('open-settings-btn').addEventListener('click', openSettings);

  // Settings links in About tab
  document.querySelectorAll('.settings-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openSettings();
    });
  });
}

// Keyboard Shortcuts Setup
function setupKeyboardShortcuts() {
  // Listen for keyboard commands from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'keyboardCommand') {
      handleKeyboardCommand(message.command);
    }
  });

  // Listen for keyboard events in popup
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Tab navigation: 1-5 keys to switch tabs
    if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.altKey) {
      const tabIndex = parseInt(e.key) - 1;
      const tabs = ['current', 'downloads', 'favorites', 'history', 'stats'];
      if (tabIndex < tabs.length) {
        switchTab(tabs[tabIndex]);
        e.preventDefault();
      }
    }

    // Arrow key navigation in stream lists
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      navigateStreams(e.key === 'ArrowDown' ? 1 : -1);
      e.preventDefault();
    }

    // Enter to select/download focused stream
    if (e.key === 'Enter') {
      const focused = document.querySelector('.stream-item.focused');
      if (focused) {
        const downloadBtn = focused.querySelector('.btn-download');
        if (downloadBtn) {
          downloadBtn.click();
          e.preventDefault();
        }
      }
    }

    // Escape to close search or details
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('search-input');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        searchQuery = '';
        displayStreams();
        e.preventDefault();
      }
    }
  });
}

// Handle keyboard commands from background script
function handleKeyboardCommand(command) {
  console.log('Handling keyboard command:', command);

  const focused = getFocusedStream();

  switch (command) {
    case 'copy-url':
      if (focused) {
        copyToClipboard(focused.url, document.querySelector('.stream-item.focused .copy-btn'));
      }
      break;

    case 'download-stream':
      if (focused) {
        downloadBestQuality(focused);
      }
      break;

    case 'validate-stream':
      if (focused) {
        const idx = currentStreams.indexOf(focused);
        validateStream(focused.url, idx >= 0 ? idx : 0);
      }
      break;
  }
}

// Navigate through stream list with arrow keys
function navigateStreams(direction) {
  const streamItems = document.querySelectorAll('.stream-item:not([style*="display: none"])');
  if (streamItems.length === 0) return;

  let currentIndex = Array.from(streamItems).findIndex(item => item.classList.contains('focused'));

  // Remove current focus
  streamItems.forEach(item => item.classList.remove('focused'));

  // Calculate new index
  if (currentIndex === -1) {
    currentIndex = direction > 0 ? 0 : streamItems.length - 1;
  } else {
    currentIndex = (currentIndex + direction + streamItems.length) % streamItems.length;
  }

  // Add focus to new item
  const newFocused = streamItems[currentIndex];
  newFocused.classList.add('focused');

  // Scroll into view
  newFocused.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Get currently focused stream data
function getFocusedStream() {
  const focused = document.querySelector('.stream-item.focused');
  if (!focused) return null;

  const streamUrl = focused.querySelector('.stream-url')?.textContent;
  if (!streamUrl) return null;

  // Find stream data from current streams
  if (currentTab === 'current') {
    return currentStreams.find(s => s.url === streamUrl);
  } else if (currentTab === 'history') {
    return allHistory.find(s => s.url === streamUrl);
  } else if (currentTab === 'favorites') {
    return allFavorites.find(s => s.url === streamUrl);
  }

  return null;
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

// ========== SHARED HELPERS ==========

function showSuccess(message) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Success',
    message: message
  });
}

// Show error message
function showError(message) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Error',
    message: message
  });
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

// ========== SETTINGS PAGE ACCESS ==========

/**
 * Open the settings/options page
 */
function openSettings() {
  browser.runtime.openOptionsPage();
}

// Build a human-readable description of a fatal HLS.js error
function describeHlsError(data) {
  const parts = [data.type || 'error'];
  if (data.details) parts.push(data.details);
  const code = data.response && data.response.code;
  if (code) parts.push(`HTTP ${code}`);
  let hint = '';
  if (data.type === 'networkError') {
    hint = code === 403 || code === 401
      ? 'The server rejected the request (hotlink protection or expired token). Reload the page and try again.'
      : 'Network error. The stream may be CORS-restricted, expired, or require the original page session.';
  }
  return parts.join(' / ') + (hint ? ' - ' + hint : '');
}
