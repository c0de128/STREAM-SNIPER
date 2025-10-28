// Options.js - Settings page functionality

// Load settings when page opens
document.addEventListener('DOMContentLoaded', async function() {
  await loadSettings();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Save button
  document.getElementById('save-btn').addEventListener('click', saveSettings);

  // Default quality change handler
  document.getElementById('default-quality').addEventListener('change', function(e) {
    const presetContainer = document.getElementById('preset-quality-container');
    if (e.target.value === 'preset') {
      presetContainer.style.display = 'block';
    } else {
      presetContainer.style.display = 'none';
    }
  });

  // Test yt-dlp button
  document.getElementById('test-ytdlp-btn').addEventListener('click', testYtDlp);

  // Open setup wizard link
  document.getElementById('open-setup-wizard').addEventListener('click', function(e) {
    e.preventDefault();
    openSetupWizard();
  });
}

// Load current settings
async function loadSettings() {
  const result = await browser.storage.local.get(['settings', 'downloadSettings']);

  // General settings
  const settings = result.settings || {
    darkMode: false,
    notifications: true,
    autoValidate: false,
    saveToHistory: true,
    autoPreview: true,
    previewQuality: 'medium'
  };

  // Download settings
  const downloadSettings = result.downloadSettings || {
    preferredMethod: 'auto',
    defaultQuality: 'ask',
    presetQuality: '1080p',
    showNotifications: true,
    autoClearCompleted: false,
    ytdlpPath: '',
    ytdlpArgs: ''
  };

  // Populate general settings
  document.getElementById('dark-mode').checked = settings.darkMode;
  document.getElementById('notifications-enabled').checked = settings.notifications;
  document.getElementById('auto-validate').checked = settings.autoValidate;
  document.getElementById('save-to-history').checked = settings.saveToHistory;
  document.getElementById('auto-preview').checked = settings.autoPreview;
  document.getElementById('preview-quality').value = settings.previewQuality || 'medium';

  // Populate download settings
  document.getElementById('download-method').value = downloadSettings.preferredMethod;
  document.getElementById('default-quality').value = downloadSettings.defaultQuality;
  document.getElementById('preset-quality').value = downloadSettings.presetQuality;
  document.getElementById('download-notifications').checked = downloadSettings.showNotifications;
  document.getElementById('auto-clear-completed').checked = downloadSettings.autoClearCompleted;
  document.getElementById('ytdlp-path').value = downloadSettings.ytdlpPath;
  document.getElementById('ytdlp-args').value = downloadSettings.ytdlpArgs;

  // Show/hide preset quality based on default quality setting
  const presetContainer = document.getElementById('preset-quality-container');
  if (downloadSettings.defaultQuality === 'preset') {
    presetContainer.style.display = 'block';
  } else {
    presetContainer.style.display = 'none';
  }

  // Apply theme to options page
  applyTheme(settings.darkMode);

  // Check yt-dlp availability on load
  checkYtDlpAvailability();
}

// Save settings
async function saveSettings() {
  const darkMode = document.getElementById('dark-mode').checked;

  // General settings
  const settings = {
    darkMode: darkMode,
    notifications: document.getElementById('notifications-enabled').checked,
    autoValidate: document.getElementById('auto-validate').checked,
    saveToHistory: document.getElementById('save-to-history').checked,
    autoPreview: document.getElementById('auto-preview').checked,
    previewQuality: document.getElementById('preview-quality').value
  };

  // Download settings
  const downloadSettings = {
    preferredMethod: document.getElementById('download-method').value,
    defaultQuality: document.getElementById('default-quality').value,
    presetQuality: document.getElementById('preset-quality').value,
    showNotifications: document.getElementById('download-notifications').checked,
    autoClearCompleted: document.getElementById('auto-clear-completed').checked,
    ytdlpPath: document.getElementById('ytdlp-path').value.trim(),
    ytdlpArgs: document.getElementById('ytdlp-args').value.trim()
  };

  // Save to storage
  await browser.storage.local.set({
    settings: settings,
    downloadSettings: downloadSettings
  });

  // Apply theme immediately
  applyTheme(darkMode);

  // Show success message
  const statusMsg = document.getElementById('status-message');
  statusMsg.textContent = 'Settings saved successfully!';
  statusMsg.className = 'status-message success';

  setTimeout(() => {
    statusMsg.style.display = 'none';
  }, 3000);
}

// Apply theme to page
function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Check yt-dlp availability
async function checkYtDlpAvailability() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'isYtDlpAvailable' });
    const statusEl = document.getElementById('ytdlp-status');

    if (response && response.available) {
      statusEl.innerHTML = '<span style="color: #28a745;">✓ yt-dlp is available and ready to use</span>';
    } else {
      statusEl.innerHTML = '<span style="color: #ffc107;">⚠ yt-dlp is not detected. Click "Test" to check or use the setup wizard.</span>';
    }
  } catch (error) {
    console.error('Error checking yt-dlp availability:', error);
  }
}

// Test yt-dlp connection
async function testYtDlp() {
  const statusEl = document.getElementById('ytdlp-status');
  const testBtn = document.getElementById('test-ytdlp-btn');

  // Disable button and show testing message
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  statusEl.innerHTML = '<span style="color: #17a2b8;">Testing yt-dlp connection...</span>';

  try {
    // Send test message to background
    const response = await browser.runtime.sendMessage({ action: 'isYtDlpAvailable' });

    setTimeout(() => {
      if (response && response.available) {
        statusEl.innerHTML = '<span style="color: #28a745;">✓ Success! yt-dlp is working correctly</span>';
      } else {
        statusEl.innerHTML = `
          <span style="color: #dc3545;">✗ yt-dlp not found</span><br>
          <small>Make sure yt-dlp is installed and the native messaging host is configured.</small><br>
          <small><a href="#" id="retry-setup-wizard" style="color: var(--border-accent);">Open setup wizard</a> for help.</small>
        `;

        // Add event listener to the dynamically created link
        setTimeout(() => {
          const wizardLink = document.getElementById('retry-setup-wizard');
          if (wizardLink) {
            wizardLink.addEventListener('click', function(e) {
              e.preventDefault();
              openSetupWizard();
            });
          }
        }, 10);
      }

      // Re-enable button
      testBtn.disabled = false;
      testBtn.textContent = 'Test yt-dlp Connection';
    }, 1000);

  } catch (error) {
    console.error('Error testing yt-dlp:', error);
    statusEl.innerHTML = '<span style="color: #dc3545;">✗ Error testing connection: ' + error.message + '</span>';
    testBtn.disabled = false;
    testBtn.textContent = 'Test yt-dlp Connection';
  }
}

// Open setup wizard
function openSetupWizard() {
  const wizardUrl = browser.runtime.getURL('setup-wizard.html');
  browser.tabs.create({ url: wizardUrl });
}
