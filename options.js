// Options.js - Settings page functionality

// Load settings when page opens
document.addEventListener('DOMContentLoaded', async function() {
  await loadSettings();
  await loadExtensionId();
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

  // Custom filename template handlers
  document.getElementById('use-custom-filename-template').addEventListener('change', function(e) {
    const templateContainer = document.getElementById('filename-template-container');
    if (e.target.checked) {
      templateContainer.style.display = 'block';
    } else {
      templateContainer.style.display = 'none';
    }
  });

  document.getElementById('filename-template-preset').addEventListener('change', function(e) {
    const customContainer = document.getElementById('custom-template-container');
    if (e.target.value === 'custom') {
      customContainer.style.display = 'block';
      updateTemplatePreview();
    } else {
      customContainer.style.display = 'none';
      updateTemplatePreview();
    }
  });

  document.getElementById('custom-filename-template').addEventListener('input', function(e) {
    updateTemplatePreview();
  });

  // Test yt-dlp button
  document.getElementById('test-ytdlp-btn').addEventListener('click', testYtDlp);

  // Open setup wizard link
  document.getElementById('open-setup-wizard').addEventListener('click', function(e) {
    e.preventDefault();
    openSetupWizard();
  });

  // Extension ID auto-setup buttons
  document.getElementById('copy-extension-id-btn').addEventListener('click', copyExtensionId);
  document.getElementById('auto-configure-btn').addEventListener('click', autoConfigureNativeMessaging);
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
    ytdlpArgs: '',
    useCustomFilenameTemplate: false,
    filenameTemplatePreset: 'default',
    customFilenameTemplate: '{title}_{quality}_{date}'
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
  document.getElementById('use-custom-filename-template').checked = downloadSettings.useCustomFilenameTemplate;
  document.getElementById('filename-template-preset').value = downloadSettings.filenameTemplatePreset;
  document.getElementById('custom-filename-template').value = downloadSettings.customFilenameTemplate;

  // Show/hide preset quality based on default quality setting
  const presetContainer = document.getElementById('preset-quality-container');
  if (downloadSettings.defaultQuality === 'preset') {
    presetContainer.style.display = 'block';
  } else {
    presetContainer.style.display = 'none';
  }

  // Show/hide filename template containers
  const templateContainer = document.getElementById('filename-template-container');
  const customContainer = document.getElementById('custom-template-container');
  if (downloadSettings.useCustomFilenameTemplate) {
    templateContainer.style.display = 'block';
    if (downloadSettings.filenameTemplatePreset === 'custom') {
      customContainer.style.display = 'block';
    }
  }

  // Update template preview
  updateTemplatePreview();

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
    ytdlpArgs: document.getElementById('ytdlp-args').value.trim(),
    useCustomFilenameTemplate: document.getElementById('use-custom-filename-template').checked,
    filenameTemplatePreset: document.getElementById('filename-template-preset').value,
    customFilenameTemplate: document.getElementById('custom-filename-template').value.trim()
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

// Update filename template preview
function updateTemplatePreview() {
  const useCustom = document.getElementById('use-custom-filename-template').checked;
  const presetSelect = document.getElementById('filename-template-preset');
  const customInput = document.getElementById('custom-filename-template');
  const previewResult = document.getElementById('template-preview-result');

  if (!useCustom) {
    previewResult.textContent = 'Custom templates disabled - using default format';
    return;
  }

  // Get template string
  let template;
  if (presetSelect.value === 'custom') {
    template = customInput.value || '{title}_{quality}_{date}';
  } else {
    template = presetSelect.options[presetSelect.selectedIndex].text;
  }

  // Generate preview with example data
  const exampleData = {
    title: 'Example_Video_Title',
    domain: 'youtube',
    quality: '1080p',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 8).replace(/:/g, '-'),
    type: 'm3u8',
    timestamp: Date.now().toString()
  };

  // Replace variables
  let preview = template;
  for (const [key, value] of Object.entries(exampleData)) {
    preview = preview.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  // Sanitize for display
  preview = preview.replace(/[^a-z0-9\-_./]/gi, '_');

  // Add extension
  preview += '.mp4';

  previewResult.textContent = preview;
}

// Load and display Extension ID
async function loadExtensionId() {
  try {
    // Get the extension ID
    const extensionId = browser.runtime.id;
    const displayField = document.getElementById('extension-id-display');

    if (displayField) {
      displayField.value = extensionId;
    }
  } catch (error) {
    console.error('Error loading extension ID:', error);
  }
}

// Copy Extension ID to clipboard
async function copyExtensionId() {
  const displayField = document.getElementById('extension-id-display');
  const copyBtn = document.getElementById('copy-extension-id-btn');

  try {
    // Select and copy
    displayField.select();
    document.execCommand('copy');

    // Visual feedback
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.backgroundColor = '#28a745';

    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.backgroundColor = '';
    }, 2000);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    copyBtn.textContent = 'Error';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 2000);
  }
}

// Auto-configure native messaging
async function autoConfigureNativeMessaging() {
  const statusEl = document.getElementById('auto-configure-status');
  const configureBtn = document.getElementById('auto-configure-btn');

  // Disable button and show progress
  configureBtn.disabled = true;
  configureBtn.textContent = '⏳ Configuring...';
  statusEl.innerHTML = '<span style="color: #17a2b8;">Updating native messaging manifest...</span>';

  try {
    // Get the extension ID
    const extensionId = browser.runtime.id;

    // Send message to background to update manifest
    const response = await browser.runtime.sendMessage({
      action: 'autoConfigureNativeMessaging',
      extensionId: extensionId
    });

    if (response && response.success) {
      statusEl.innerHTML = `
        <span style="color: #28a745;">✓ Success! Native messaging configured</span><br>
        <small style="color: #666;">
          <br><strong>Next steps:</strong>
          <br>1. Restart your browser
          <br>2. Come back to this page
          <br>3. Click "Test yt-dlp Connection" above
          <br>4. You should see: ✓ Success!
        </small>
      `;
      configureBtn.textContent = '✓ Configured!';
      configureBtn.style.backgroundColor = '#28a745';
    } else {
      throw new Error(response?.error || 'Configuration failed');
    }
  } catch (error) {
    console.error('Error auto-configuring:', error);
    statusEl.innerHTML = `
      <span style="color: #dc3545;">✗ Auto-configuration not available</span><br>
      <small style="color: #666;">
        <br>This feature requires Windows with proper permissions.
        <br><strong>Manual setup instead:</strong>
        <br>1. Copy your Extension ID above (${browser.runtime.id})
        <br>2. Click "Open setup wizard" below for instructions
        <br>3. Or manually edit the manifest file
      </small>
    `;
    configureBtn.disabled = false;
    configureBtn.textContent = '✨ Auto-Configure Native Messaging';
    configureBtn.style.backgroundColor = '';
  }
}
