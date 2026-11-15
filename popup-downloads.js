// Stream Sniper popup - Downloads tab
// Download queue rendering and pause/resume/cancel/retry actions.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

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

