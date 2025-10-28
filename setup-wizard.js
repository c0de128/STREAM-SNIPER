// Setup Wizard JavaScript

let currentStep = 1;
const totalSteps = 3;

// Initialize wizard
document.addEventListener('DOMContentLoaded', function() {
  // Apply dark mode if enabled
  loadTheme();

  // Setup platform tab listeners
  setupPlatformTabs();

  // Update navigation buttons
  updateNavigation();
});

// Load theme from settings
async function loadTheme() {
  try {
    const result = await browser.storage.local.get('settings');
    const settings = result.settings || {};
    if (settings.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (error) {
    console.error('Error loading theme:', error);
  }
}

// Setup platform tab switching
function setupPlatformTabs() {
  const tabs = document.querySelectorAll('.platform-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const platform = this.getAttribute('data-platform');
      const parentContainer = this.closest('.step-content');

      // Update active tab
      parentContainer.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      // Update active content
      parentContainer.querySelectorAll('.platform-content').forEach(c => c.classList.remove('active'));
      const content = parentContainer.querySelector(`.platform-content[data-platform="${platform}"]`);
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

// Copy command to clipboard
function copyCommand(button, command) {
  // Create temporary textarea
  const textarea = document.createElement('textarea');
  textarea.value = command;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  // Select and copy
  textarea.select();
  document.execCommand('copy');

  // Remove textarea
  document.body.removeChild(textarea);

  // Update button text
  const originalText = button.textContent;
  button.textContent = 'Copied!';
  button.classList.add('copied');

  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copied');
  }, 2000);
}

// Navigate to next step
function nextStep() {
  if (currentStep < totalSteps) {
    currentStep++;
    updateSteps();
    updateNavigation();
  }
}

// Navigate to previous step
function previousStep() {
  if (currentStep > 1) {
    currentStep--;
    updateSteps();
    updateNavigation();
  }
}

// Update step display
function updateSteps() {
  // Update step indicators
  document.querySelectorAll('.wizard-step').forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove('active', 'completed');

    if (stepNum < currentStep) {
      step.classList.add('completed');
    } else if (stepNum === currentStep) {
      step.classList.add('active');
    }
  });

  // Update step content
  document.querySelectorAll('.step-content').forEach((content, index) => {
    const stepNum = index + 1;
    if (stepNum === currentStep) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Update navigation buttons
function updateNavigation() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const finishBtn = document.getElementById('finish-btn');

  // Previous button
  prevBtn.disabled = currentStep === 1;

  // Next/Finish buttons
  if (currentStep === totalSteps) {
    nextBtn.style.display = 'none';
    finishBtn.style.display = 'inline-block';
  } else {
    nextBtn.style.display = 'inline-block';
    finishBtn.style.display = 'none';
  }
}

// Test yt-dlp installation
async function testYtDlp() {
  const resultDiv = document.getElementById('test-result');
  const successBox = document.getElementById('success-message');

  // Show loading state
  resultDiv.innerHTML = '<div class="test-result" style="background-color: var(--info-bg); color: var(--info-text);">🔄 Testing yt-dlp connection...</div>';
  successBox.style.display = 'none';

  try {
    // Send message to background to check yt-dlp availability
    const response = await browser.runtime.sendMessage({
      action: 'isYtDlpAvailable'
    });

    // Wait a moment for effect
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (response && response.available) {
      // Success!
      resultDiv.innerHTML = `
        <div class="test-result success">
          ✓ Success! yt-dlp is properly installed and accessible.
        </div>
      `;
      successBox.style.display = 'block';

      // Mark step as completed
      const step2 = document.querySelector('.wizard-step[data-step="2"]');
      if (step2) {
        step2.classList.add('completed');
      }
    } else {
      // Not found
      resultDiv.innerHTML = `
        <div class="test-result error">
          ✗ yt-dlp not found or not accessible.
          <br><br>
          <strong>Troubleshooting tips:</strong>
          <ul style="text-align: left; margin-top: 10px;">
            <li>Verify yt-dlp is installed: Run <code>yt-dlp --version</code> in terminal</li>
            <li>Ensure yt-dlp is in your system PATH</li>
            <li>Restart your browser after installation</li>
            <li>Check that the native messaging host is properly configured</li>
            <li>Verify Python 3.6+ is installed</li>
          </ul>
          <br>
          <strong>Still having issues?</strong><br>
          Try specifying the full path to yt-dlp in the extension settings.
        </div>
      `;
    }
  } catch (error) {
    console.error('Error testing yt-dlp:', error);
    resultDiv.innerHTML = `
      <div class="test-result error">
        ✗ Error testing connection: ${error.message}
        <br><br>
        This usually means the native messaging host is not properly configured.
        Please review Step 2 and ensure all files are in the correct locations.
      </div>
    `;
  }
}

// Finish setup and close wizard
function finish() {
  // Close the wizard tab
  browser.tabs.getCurrent().then(tab => {
    browser.tabs.remove(tab.id);
  });

  // Open options page
  browser.runtime.openOptionsPage();
}

// Export functions for HTML onclick handlers
window.copyCommand = copyCommand;
window.nextStep = nextStep;
window.previousStep = previousStep;
window.testYtDlp = testYtDlp;
window.finish = finish;
