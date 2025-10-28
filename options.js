// Options.js - Settings page functionality

// Load settings when page opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Save button event
document.getElementById('save-btn').addEventListener('click', saveSettings);

// Load current settings
async function loadSettings() {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || {
    darkMode: false,
    notifications: true,
    autoValidate: false,
    saveToHistory: true,
    autoPreview: true,
    previewQuality: 'medium'
  };

  document.getElementById('dark-mode').checked = settings.darkMode;
  document.getElementById('notifications-enabled').checked = settings.notifications;
  document.getElementById('auto-validate').checked = settings.autoValidate;
  document.getElementById('save-to-history').checked = settings.saveToHistory;
  document.getElementById('auto-preview').checked = settings.autoPreview;
  document.getElementById('preview-quality').value = settings.previewQuality || 'medium';

  // Apply theme to options page
  applyTheme(settings.darkMode);
}

// Save settings
async function saveSettings() {
  const darkMode = document.getElementById('dark-mode').checked;

  const settings = {
    darkMode: darkMode,
    notifications: document.getElementById('notifications-enabled').checked,
    autoValidate: document.getElementById('auto-validate').checked,
    saveToHistory: document.getElementById('save-to-history').checked,
    autoPreview: document.getElementById('auto-preview').checked,
    previewQuality: document.getElementById('preview-quality').value
  };

  await browser.storage.local.set({ settings: settings });

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
