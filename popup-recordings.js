// Stream Sniper popup - Recordings tab
// Live recording sessions and their controls.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// ========== RECORDINGS FUNCTIONS ==========

let allRecordings = [];

// Load recordings from background
async function loadRecordings() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getRecordings' });
    allRecordings = response.recordings || [];
    displayRecordings();
  } catch (error) {
    console.error('Error loading recordings:', error);
  }
}

// Display recordings in Recordings tab
function displayRecordings() {
  const recordingsList = document.getElementById('recordings-list');
  const noRecordingsMsg = document.getElementById('no-recordings');
  const activeCountEl = document.getElementById('active-recordings');

  if (allRecordings.length === 0) {
    noRecordingsMsg.style.display = 'block';
    recordingsList.innerHTML = '';
    activeCountEl.textContent = '0';
    return;
  }

  noRecordingsMsg.style.display = 'none';
  recordingsList.innerHTML = '';

  // Count active recordings
  const activeCount = allRecordings.filter(r =>
    ['recording', 'paused'].includes(r.state)
  ).length;
  activeCountEl.textContent = activeCount;

  // Display recordings (newest first)
  allRecordings.forEach(recording => {
    const recordingItem = createRecordingElement(recording);
    recordingsList.appendChild(recordingItem);
  });
}

// Create recording element
function createRecordingElement(recording) {
  const div = document.createElement('div');
  div.className = `recording-item ${recording.state}`;
  div.dataset.recordingId = recording.id;

  // Header
  const header = document.createElement('div');
  header.className = 'recording-header';

  const info = document.createElement('div');
  info.className = 'recording-info';

  const filename = document.createElement('div');
  filename.className = 'recording-filename';
  filename.textContent = recording.streamData.pageTitle || 'Untitled Recording';
  filename.title = recording.streamData.pageTitle;
  info.appendChild(filename);

  const domain = document.createElement('div');
  domain.className = 'recording-domain';
  domain.textContent = `From: ${recording.streamData.domain || 'unknown'}`;
  info.appendChild(domain);

  header.appendChild(info);

  // State badge
  const stateBadge = document.createElement('span');
  stateBadge.className = `recording-state ${recording.state}`;
  stateBadge.textContent = recording.state;
  header.appendChild(stateBadge);

  // Method badge (if available)
  if (recording.options && recording.options.method) {
    const methodBadge = document.createElement('span');
    methodBadge.className = `recording-method ${recording.options.method}`;
    methodBadge.textContent = recording.options.method;
    header.appendChild(methodBadge);
  }

  div.appendChild(header);

  // Stats
  const stats = document.createElement('div');
  stats.className = 'recording-stats';

  // Duration
  const duration = document.createElement('div');
  duration.className = 'recording-duration';
  duration.innerHTML = `⏱️ <strong>${formatDuration(recording.duration)}</strong>`;
  stats.appendChild(duration);

  // Size (if available)
  if (recording.recordedSize > 0) {
    const size = document.createElement('div');
    size.className = 'recording-size';
    size.innerHTML = `💾 <strong>${formatBytes(recording.recordedSize)}</strong>`;
    stats.appendChild(size);
  }

  // Segments (if split recording)
  if (recording.segmentCount > 0) {
    const segments = document.createElement('div');
    segments.className = 'recording-segments';
    segments.innerHTML = `📄 <strong>${recording.segmentCount + 1} segments</strong>`;
    stats.appendChild(segments);
  }

  div.appendChild(stats);

  // Action buttons (only for active/paused recordings)
  if (['recording', 'paused', 'stopping'].includes(recording.state)) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'recording-actions-btns';

    if (recording.state === 'recording') {
      // Pause button
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'recording-action-btn pause';
      pauseBtn.textContent = '⏸️ Pause';
      pauseBtn.onclick = () => pauseRecording(recording.id);
      actionsDiv.appendChild(pauseBtn);
    } else if (recording.state === 'paused') {
      // Resume button
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'recording-action-btn resume';
      resumeBtn.textContent = '▶️ Resume';
      resumeBtn.onclick = () => resumeRecording(recording.id);
      actionsDiv.appendChild(resumeBtn);
    }

    // Stop button (not available if already stopping)
    if (recording.state !== 'stopping') {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'recording-action-btn stop';
      stopBtn.textContent = '⏹️ Stop';
      stopBtn.onclick = () => stopRecording(recording.id);
      actionsDiv.appendChild(stopBtn);
    }

    div.appendChild(actionsDiv);
  }

  // Remove button for completed/failed recordings
  if (['stopped', 'failed'].includes(recording.state)) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'recording-actions-btns';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'recording-action-btn remove';
    removeBtn.textContent = '🗑️ Remove';
    removeBtn.onclick = () => removeRecording(recording.id);
    actionsDiv.appendChild(removeBtn);

    div.appendChild(actionsDiv);
  }

  // Error message (if failed)
  if (recording.state === 'failed' && recording.error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'recording-error';
    errorDiv.textContent = `Error: ${recording.error}`;
    div.appendChild(errorDiv);
  }

  return div;
}

// Format duration in ms to readable format
function formatDuration(ms) {
  if (!ms || ms === 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Start recording a stream
async function startRecording(stream) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'startRecording',
      streamData: stream,
      options: {
        method: 'native' // Can be 'native' or 'ytdlp'
      }
    });

    if (response.success) {
      // Switch to recordings tab to show the recording
      switchTab('recordings');
      // Show success message
      showSuccess(`Started recording "${stream.pageTitle || 'stream'}"`);
    } else {
      showError('Failed to start recording: ' + response.error);
    }
  } catch (error) {
    showError('Error starting recording: ' + error.message);
  }
}

// Pause recording
async function pauseRecording(recordingId) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'pauseRecording',
      recordingId: recordingId
    });

    if (response.success) {
      await loadRecordings();
    } else {
      showError('Failed to pause recording: ' + response.error);
    }
  } catch (error) {
    showError('Error pausing recording: ' + error.message);
  }
}

// Resume recording
async function resumeRecording(recordingId) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'resumeRecording',
      recordingId: recordingId
    });

    if (response.success) {
      await loadRecordings();
    } else {
      showError('Failed to resume recording: ' + response.error);
    }
  } catch (error) {
    showError('Error resuming recording: ' + error.message);
  }
}

// Stop recording
async function stopRecording(recordingId) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'stopRecording',
      recordingId: recordingId
    });

    if (response.success) {
      await loadRecordings();
    } else {
      showError('Failed to stop recording: ' + response.error);
    }
  } catch (error) {
    showError('Error stopping recording: ' + error.message);
  }
}

// Remove recording from list
async function removeRecording(recordingId) {
  // Just remove from UI for now (backend handles cleanup)
  allRecordings = allRecordings.filter(r => r.id !== recordingId);
  displayRecordings();
}

// Stop all recordings
async function stopAllRecordings() {
  const activeRecordings = allRecordings.filter(r => ['recording', 'paused'].includes(r.state));

  for (const recording of activeRecordings) {
    await stopRecording(recording.id);
  }
}

// Clear completed recordings
async function clearCompletedRecordings() {
  allRecordings = allRecordings.filter(r => !['stopped', 'failed'].includes(r.state));
  displayRecordings();
}

// Setup recording listeners for real-time updates
function setupRecordingListeners() {
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'recordingStarted' ||
        message.action === 'recordingProgress' ||
        message.action === 'recordingPaused' ||
        message.action === 'recordingResumed' ||
        message.action === 'recordingStopped' ||
        message.action === 'recordingFailed' ||
        message.action === 'recordingSplit') {
      // Reload recordings to show updated state
      loadRecordings();
    }
  });

  // Auto-refresh recordings every 1 second when Recordings tab is active (for live duration updates)
  setInterval(() => {
    if (currentTab === 'recordings') {
      loadRecordings();
    }
  }, 1000);
}

