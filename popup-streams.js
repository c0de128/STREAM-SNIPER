// Stream Sniper popup - Current tab
// Detected stream list, previews, quality details, download/copy actions, VLC and player launch.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// Load current tab streams from background
async function loadCurrentStreams() {
  const response = await browser.runtime.sendMessage({action: 'getStreams'});
  currentStreams = response.streams || [];
  displayStreams();
}

// Display streams in current tab
async function displayStreams() {
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

  // Apply best-stream-only filter if enabled
  const settings = await browser.storage.local.get('settings');
  if (settings.settings?.showBestStreamOnly && filtered.length > 0) {
    // Show loading indicator
    streamsList.innerHTML = '<div class="message">Analyzing streams for duplicates...</div>';

    try {
      filtered = await filterDuplicates(filtered);
    } catch (error) {
      console.error('Error filtering duplicates:', error);
      // Continue with unfiltered streams on error
    }
  }

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

  // Update batch toolbar
  updateBatchToolbar();
}

// Get filtered streams (helper for batch operations)
function getFilteredStreams() {
  return currentStreams.filter(stream => {
    const matchesSearch = !searchQuery ||
      stream.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stream.domain.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterType === 'all' || stream.type === filterType;

    return matchesSearch && matchesFilter;
  });
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
  div.dataset.streamUrl = stream.url;

  // Add selected class if stream is in selection
  if (selectedStreams.has(stream.url)) {
    div.classList.add('selected');
  }

  // Batch selection checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'stream-checkbox';
  checkbox.dataset.streamUrl = stream.url;
  checkbox.checked = selectedStreams.has(stream.url);
  checkbox.addEventListener('change', (e) => {
    handleStreamSelection(stream, e.target.checked);
  });
  div.appendChild(checkbox);

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
    if (stream.validationStatus === 'youtube') {
      // YouTube stream - show warning
      status.textContent = '⚠ YouTube (authenticated)';
      status.className = 'stream-status status-youtube';
      status.title = 'YouTube streams require authentication and cannot be tested directly. Use yt-dlp to download.';
    } else if (stream.validationValid) {
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

  // Metadata section (if available)
  if (stream.metadata || stream.enrichedTitle || stream.category) {
    const metadataSection = document.createElement('div');
    metadataSection.className = 'stream-metadata';

    // Thumbnail and content wrapper
    const metadataContent = document.createElement('div');
    metadataContent.className = 'metadata-content';

    // Thumbnail
    if (stream.metadata && stream.metadata.thumbnail) {
      const thumbnailWrapper = document.createElement('div');
      thumbnailWrapper.className = 'metadata-thumbnail-wrapper';

      const thumbnail = document.createElement('img');
      thumbnail.className = 'metadata-thumbnail';
      thumbnail.src = stream.metadata.thumbnail;
      thumbnail.alt = 'Stream thumbnail';
      thumbnail.onerror = () => {
        thumbnailWrapper.style.display = 'none';
      };
      thumbnailWrapper.appendChild(thumbnail);

      metadataContent.appendChild(thumbnailWrapper);
    }

    // Text content
    const textContent = document.createElement('div');
    textContent.className = 'metadata-text';

    // Rich title
    if (stream.enrichedTitle || (stream.metadata && stream.metadata.title)) {
      const title = document.createElement('div');
      title.className = 'metadata-title';
      title.textContent = stream.enrichedTitle || stream.metadata.title;
      title.title = stream.enrichedTitle || stream.metadata.title;
      textContent.appendChild(title);
    }

    // Category badge
    if (stream.category) {
      const categoryBadge = document.createElement('span');
      categoryBadge.className = `category-badge category-${stream.category.toLowerCase().replace(/_/g, '-')}`;
      categoryBadge.textContent = stream.category.replace(/_/g, ' ');
      textContent.appendChild(categoryBadge);
    }

    // Description
    if (stream.metadata && stream.metadata.description) {
      const description = document.createElement('div');
      description.className = 'metadata-description';
      description.textContent = stream.metadata.description;
      description.title = stream.metadata.description;
      textContent.appendChild(description);
    }

    // Duration (if available)
    if (stream.metadata && stream.metadata.duration) {
      const duration = document.createElement('div');
      duration.className = 'metadata-duration';
      duration.innerHTML = `⏱️ <strong>${stream.metadata.duration}</strong>`;
      textContent.appendChild(duration);
    }

    metadataContent.appendChild(textContent);
    metadataSection.appendChild(metadataContent);
    div.appendChild(metadataSection);
  }

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
  const copyDropdown = createCopyDropdown(stream.url, stream);
  actions.appendChild(copyDropdown);

  // Download button with dropdown
  const downloadDropdown = createDownloadDropdown(stream, index);
  actions.appendChild(downloadDropdown);

  // Quality selector button (for M3U8/MPD streams)
  if (stream.type === 'm3u8' || stream.type === 'm3u' || stream.type === 'mpd') {
    const qualityBtn = document.createElement('button');
    qualityBtn.className = 'small-btn quality-btn';
    qualityBtn.textContent = '🎞️ Quality';
    qualityBtn.title = 'Select quality and view recommendations';
    qualityBtn.addEventListener('click', () => openQualitySelector(stream, index));
    actions.appendChild(qualityBtn);
  }

  // Record button
  const recordBtn = document.createElement('button');
  recordBtn.className = 'small-btn record-btn';
  recordBtn.textContent = '⏺ Record';
  recordBtn.title = 'Start recording this stream';
  recordBtn.addEventListener('click', () => startRecording(stream));
  actions.appendChild(recordBtn);

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

  // Play in VLC button
  const vlcBtn = document.createElement('button');
  vlcBtn.className = 'small-btn vlc-btn';
  vlcBtn.textContent = '▶ VLC';
  vlcBtn.title = 'Open this stream in VLC media player';
  vlcBtn.addEventListener('click', () => playInVlc(stream, vlcBtn, index));
  actions.appendChild(vlcBtn);

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

// Shell-quote a value for the copied commands (double quotes, escaped)
function shellQuote(value) {
  return '"' + String(value == null ? '' : value).replace(/(["\\$`])/g, '\\$1') + '"';
}

// Resolve referer/user-agent/headers for a stream: from the stream object, then the background
async function resolveStreamContext(url, stream) {
  let context = { referer: '', userAgent: '', headers: {} };
  try {
    const fromBackground = await browser.runtime.sendMessage({ action: 'getStreamContext', url });
    if (fromBackground) context = Object.assign(context, fromBackground);
  } catch (e) { /* background may be asleep; fall through to stream data */ }
  if (stream) {
    if (!context.referer) context.referer = stream.frameUrl || stream.pageUrl || '';
    if (stream.headers) {
      for (const [name, value] of Object.entries(stream.headers)) {
        if (name === 'referer' || name === 'origin') continue;
        if (name === 'user-agent') { if (!context.userAgent) context.userAgent = value; continue; }
        if (!context.headers[name]) context.headers[name] = value;
      }
    }
  }
  if (!context.userAgent) context.userAgent = navigator.userAgent;
  return context;
}

// Build the copyable command for a given tool using the stream's request context
function buildCommand(kind, url, ctx) {
  const q = shellQuote;
  const ref = ctx.referer;
  const ua = ctx.userAgent;
  const headerEntries = Object.entries(ctx.headers || {});
  const outName = 'stream.' + (/\.mpd(\?|$)/i.test(url) ? 'mp4' : /\.(mp4|webm|mkv|flv)(\?|$)/i.test(url) ? url.match(/\.(mp4|webm|mkv|flv)(\?|$)/i)[1] : 'mp4');

  switch (kind) {
    case 'url':
      return url;
    case 'url-headers': {
      const lines = [url];
      if (ref) lines.push(`Referer: ${ref}`);
      if (ua) lines.push(`User-Agent: ${ua}`);
      headerEntries.forEach(([n, v]) => lines.push(`${n}: ${v}`));
      return lines.join('\n');
    }
    case 'vlc': {
      const parts = ['vlc', q(url)];
      if (ref) parts.push(`:http-referrer=${q(ref)}`);
      if (ua) parts.push(`:http-user-agent=${q(ua)}`);
      return parts.join(' ');
    }
    case 'mpv': {
      const parts = ['mpv'];
      if (ref) parts.push(`--referrer=${q(ref)}`);
      if (ua) parts.push(`--user-agent=${q(ua)}`);
      const extra = headerEntries.map(([n, v]) => `${n}: ${v}`);
      if (extra.length) parts.push(`--http-header-fields=${q(extra.join(','))}`);
      parts.push(q(url));
      return parts.join(' ');
    }
    case 'ffmpeg': {
      const parts = ['ffmpeg'];
      if (ua) parts.push('-user_agent', q(ua));
      if (ref) parts.push('-referer', q(ref));
      if (headerEntries.length) parts.push('-headers', q(headerEntries.map(([n, v]) => `${n}: ${v}\\r\\n`).join('')));
      parts.push('-i', q(url), '-c', 'copy', outName);
      return parts.join(' ');
    }
    case 'ytdlp': {
      const parts = ['yt-dlp'];
      if (ref) parts.push('--referer', q(ref));
      if (ua) parts.push('--user-agent', q(ua));
      headerEntries.forEach(([n, v]) => parts.push('--add-header', q(`${n}:${v}`)));
      parts.push('-o', q(outName), q(url));
      return parts.join(' ');
    }
    case 'curl': {
      const parts = ['curl', '-L'];
      if (ref) parts.push('-e', q(ref));
      if (ua) parts.push('-A', q(ua));
      headerEntries.forEach(([n, v]) => parts.push('-H', q(`${n}: ${v}`)));
      parts.push('-o', q(outName), q(url));
      return parts.join(' ');
    }
    default:
      return url;
  }
}

// Create copy dropdown with player commands (context-aware: includes referer/UA/headers)
function createCopyDropdown(url, stream) {
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
    { label: 'Copy URL', kind: 'url' },
    { label: 'URL + headers', kind: 'url-headers' },
    { label: 'VLC command', kind: 'vlc' },
    { label: 'mpv command', kind: 'mpv' },
    { label: 'ffmpeg command', kind: 'ffmpeg' },
    { label: 'yt-dlp command', kind: 'ytdlp' },
    { label: 'curl command', kind: 'curl' }
  ];

  commands.forEach(cmd => {
    const btn = document.createElement('button');
    btn.textContent = cmd.label;
    btn.addEventListener('click', async () => {
      dropdownContent.classList.remove('show');
      const ctx = cmd.kind === 'url' ? { referer: '', userAgent: '', headers: {} } : await resolveStreamContext(url, stream);
      copyToClipboard(buildCommand(cmd.kind, url, ctx), copyBtn);
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
      showSuccess('Added to download queue');
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

  // Check if this is a YouTube stream
  const isYouTube = url.includes('googlevideo.com') && url.includes('/videoplayback');

  if (isYouTube) {
    statusEl.textContent = '⚠ YouTube (authenticated)';
    statusEl.className = 'stream-status status-youtube';
    statusEl.title = 'YouTube streams require authentication and cannot be tested directly. Use yt-dlp to download.';
    return;
  }

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

  // Skip parsing for YouTube streams - they use authenticated segments
  if (stream.type === 'youtube-video' || stream.type === 'youtube-audio') {
    detailsEl.innerHTML = `
      <div class="stream-details-content">
        <strong>YouTube Stream Information:</strong>
        <ul class="quality-list">
          <li><strong>Quality:</strong> ${stream.quality || 'Unknown'}</li>
          <li><strong>Video ID:</strong> ${stream.videoId || 'Unknown'}</li>
          <li><strong>Type:</strong> ${stream.typeName}</li>
          <li><strong>Format:</strong> Direct video segment (authenticated)</li>
        </ul>
        <p style="margin-top: 10px; font-size: 12px; color: #666;">
          YouTube streams use authenticated video segments. Use yt-dlp or youtube-dl to download.
        </p>
      </div>
    `;
    return;
  }

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

  // Check if this is a YouTube stream - they cannot be previewed
  if (stream.type === 'youtube-video' || stream.type === 'youtube-audio') {
    previewEl.innerHTML = `
      <div class="youtube-preview-message">
        <div class="youtube-icon">▶️</div>
        <h3>YouTube Video Detected</h3>
        <p>YouTube streams cannot be previewed directly due to authentication and CORS restrictions.</p>
        <div class="youtube-actions">
          <button class="youtube-action-btn" onclick="window.open('https://youtube.com/watch?v=${stream.videoId || ''}', '_blank')">
            🔗 Open in YouTube
          </button>
          <button class="youtube-action-btn" onclick="navigator.clipboard.writeText('${stream.url.replace(/'/g, "\\'")}'); this.textContent='✓ Copied!';">
            📋 Copy URL
          </button>
        </div>
        <div class="youtube-info">
          <strong>Quality:</strong> ${stream.quality || 'Unknown'}<br>
          <strong>Video ID:</strong> ${stream.videoId || 'Unknown'}<br>
          <strong>Format:</strong> ${stream.typeName}<br>
          <strong>Type:</strong> Direct video segment (use yt-dlp or youtube-dl to download)
        </div>
      </div>
    `;
    return; // Exit early, don't try to create video element
  }

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
            previewEl.innerHTML = `<div class="preview-error">Failed to load stream: ${describeHlsError(data)}</div>`;
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


// Open stream in VLC (native host if installed, otherwise an .xspf playlist file)
async function playInVlc(stream, btn, index) {
  const originalText = '▶ VLC';
  const setBtn = (text, cls) => {
    btn.textContent = text;
    btn.classList.remove('vlc-ok', 'vlc-err');
    if (cls) btn.classList.add(cls);
  };
  const resetLater = () => setTimeout(() => { setBtn(originalText); btn.disabled = false; }, 3500);

  const detailsEl = document.getElementById(`details-${index}`);
  const note = (html) => {
    if (!detailsEl) return;
    let box = detailsEl.querySelector('.vlc-note');
    if (!box) {
      box = document.createElement('div');
      box.className = 'vlc-note';
      detailsEl.prepend(box);
    }
    box.innerHTML = html;
    detailsEl.classList.add('show');
  };

  btn.disabled = true;
  setBtn('Launching…');

  try {
    const response = await browser.runtime.sendMessage({
      action: 'playInVlc',
      url: stream.url,
      referer: stream.frameUrl || stream.pageUrl || '',
      title: stream.pageTitle || stream.domain || 'Stream'
    });

    if (!response || !response.success) {
      setBtn('Failed', 'vlc-err');
      note(`<strong>Could not launch VLC.</strong> ${escapeHtml((response && response.error) || 'Unknown error')}`);
      resetLater();
      return;
    }

    if (response.method === 'native') {
      setBtn('Sent to VLC', 'vlc-ok');
      resetLater();
      return;
    }

    // Playlist fallback
    if (response.opened) {
      setBtn('Opened', 'vlc-ok');
      note('Playlist opened with your default player. If VLC did not start, set VLC as the default app for <code>.xspf</code> files. Install the native host (Settings → Advanced Downloads) for one-click launching.');
      resetLater();
      return;
    }

    // Browser refused to auto-open: give the user a direct click target
    setBtn('Open playlist', 'vlc-ok');
    btn.disabled = false;
    note(`Playlist saved to <code>${escapeHtml(response.savedPath || ('Downloads/' + (response.filename || 'StreamSniper/stream.xspf')))}</code>. Click <strong>Open playlist</strong> to launch VLC, or install the native host for one-click launching.`);
    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await browser.downloads.open(response.downloadId);
        setBtn('Opened', 'vlc-ok');
      } catch (err) {
        try { await browser.downloads.show(response.downloadId); } catch (e2) { /* ignore */ }
        note(`<strong>Could not open automatically:</strong> ${escapeHtml(err.message)}. The playlist is in your Downloads folder; double-click it to play in VLC.`);
      }
      setTimeout(() => { setBtn(originalText); btn.onclick = null; btn.addEventListener('click', () => playInVlc(stream, btn, index), { once: true }); }, 3500);
    };
  } catch (error) {
    setBtn('Failed', 'vlc-err');
    note(`<strong>Could not launch VLC.</strong> ${escapeHtml(error.message)}`);
    resetLater();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text == null ? '' : text);
  return div.innerHTML;
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

