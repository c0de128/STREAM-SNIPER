// Stream Sniper popup - Batch downloads
// Multi-select toolbar and batch queue actions.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// ========== BATCH DOWNLOAD FUNCTIONS ==========

// Handle stream selection
function handleStreamSelection(stream, selected) {
  if (selected) {
    selectedStreams.add(stream.url);
    // Send to background
    browser.runtime.sendMessage({
      action: 'toggleStreamSelection',
      streamUrl: stream.url,
      selected: true
    });
  } else {
    selectedStreams.delete(stream.url);
    // Send to background
    browser.runtime.sendMessage({
      action: 'toggleStreamSelection',
      streamUrl: stream.url,
      selected: false
    });
  }

  // Update UI
  updateBatchToolbar();
  updateStreamItemSelection(stream.url, selected);
}

// Update stream item visual selection
function updateStreamItemSelection(streamUrl, selected) {
  const streamItem = document.querySelector(`.stream-item[data-stream-url="${streamUrl}"]`);
  if (streamItem) {
    if (selected) {
      streamItem.classList.add('selected');
    } else {
      streamItem.classList.remove('selected');
    }
  }
}

// Select all visible streams
async function selectAllStreams() {
  const filtered = getFilteredStreams();

  if (filtered.length === 0) {
    showError('No streams to select');
    return;
  }

  // Add all to selection
  const streamUrls = filtered.map(s => s.url);
  streamUrls.forEach(url => selectedStreams.add(url));

  // Send to background
  await browser.runtime.sendMessage({
    action: 'selectAllStreams',
    streamUrls: streamUrls
  });

  // Update UI
  updateBatchToolbar();
  displayStreams(); // Refresh to show checkboxes
}

// Clear stream selection
async function clearStreamSelection() {
  selectedStreams.clear();

  // Send to background
  await browser.runtime.sendMessage({
    action: 'clearSelection'
  });

  // Update UI
  updateBatchToolbar();
  displayStreams(); // Refresh to clear checkboxes
}

// Start batch download
async function startBatchDownload() {
  if (selectedStreams.size === 0) {
    showError('No streams selected for batch download');
    return;
  }

  try {
    const response = await browser.runtime.sendMessage({
      action: 'startBatchDownload',
      priority: batchPriority
    });

    if (response.success) {
      showSuccess(`Started batch download of ${selectedStreams.size} stream(s)`);

      // Clear selection
      await clearStreamSelection();

      // Switch to downloads tab
      switchTab('downloads');
    } else {
      showError('Failed to start batch download: ' + response.error);
    }
  } catch (error) {
    showError('Error starting batch download: ' + error.message);
  }
}

// Update batch toolbar visibility and count
function updateBatchToolbar() {
  const toolbar = document.getElementById('batch-toolbar');
  const countEl = document.getElementById('selected-count');

  if (selectedStreams.size > 0) {
    toolbar.style.display = 'flex';
    countEl.textContent = selectedStreams.size;
  } else {
    toolbar.style.display = 'none';
  }
}

// Show success message

