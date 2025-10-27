// Options.js - Settings page functionality

// Load settings when page opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Save button event
document.getElementById('save-btn').addEventListener('click', saveSettings);

// Load current settings
async function loadSettings() {
  const result = await browser.storage.local.get('settings');
  const settings = result.settings || {
    notifications: true,
    autoValidate: false,
    saveToHistory: true,
    autoPreview: true
  };

  document.getElementById('notifications-enabled').checked = settings.notifications;
  document.getElementById('auto-validate').checked = settings.autoValidate;
  document.getElementById('save-to-history').checked = settings.saveToHistory;
  document.getElementById('auto-preview').checked = settings.autoPreview;
}

// Save settings
async function saveSettings() {
  const settings = {
    notifications: document.getElementById('notifications-enabled').checked,
    autoValidate: document.getElementById('auto-validate').checked,
    saveToHistory: document.getElementById('save-to-history').checked,
    autoPreview: document.getElementById('auto-preview').checked
  };

  await browser.storage.local.set({ settings: settings });

  // Show success message
  const statusMsg = document.getElementById('status-message');
  statusMsg.textContent = 'Settings saved successfully!';
  statusMsg.className = 'status-message success';

  setTimeout(() => {
    statusMsg.style.display = 'none';
  }, 3000);
}
