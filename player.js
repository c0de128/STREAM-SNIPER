// Player.js - Full-screen stream player

let hlsPlayer = null;
let dashPlayer = null;

// Get URL parameters
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Initialize player on page load
document.addEventListener('DOMContentLoaded', function() {
  const streamUrl = getUrlParameter('url');
  const streamType = getUrlParameter('type');

  if (!streamUrl) {
    showError('No stream URL provided');
    return;
  }

  loadStream(streamUrl, streamType);
  setupKeyboardControls();
  setupInfoControls();
});

// Load and play stream
function loadStream(url, type) {
  const video = document.getElementById('video-player');
  const infoContent = document.getElementById('info-content');

  infoContent.innerHTML = '<div class="info-line">Loading stream...</div>';

  try {
    if (type === 'm3u8' || type === 'm3u') {
      // Use HLS.js for M3U8 streams
      if (Hls.isSupported()) {
        hlsPlayer = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          autoStartLoad: true
        });

        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(video);

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(err => {
            showError('Playback failed: ' + err.message);
          });
          updateStreamInfo(video, hlsPlayer);
        });

        hlsPlayer.on(Hls.Events.LEVEL_SWITCHED, () => {
          updateStreamInfo(video, hlsPlayer);
        });

        hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            showError(`Failed to load stream: ${data.type}. ${data.details || ''}`);
            hlsPlayer.destroy();
          }
        });

        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo(video, hlsPlayer);
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo(video);
        });
      } else {
        showError('HLS not supported in this browser');
      }

    } else if (type === 'mpd') {
      // Use dash.js for MPEG-DASH streams
      if (typeof dashjs !== 'undefined') {
        dashPlayer = dashjs.MediaPlayer().create();

        // Configure dash.js for optimal playback
        dashPlayer.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              bufferTimeAtTopQuality: 30,
              bufferTimeAtTopQualityLongForm: 60
            },
            abr: {
              autoSwitchBitrate: {
                video: true,
                audio: true
              }
            }
          }
        });

        dashPlayer.initialize(video, url, true);

        dashPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          video.play().catch(err => {
            showError('Playback failed: ' + err.message);
          });
        });

        dashPlayer.on(dashjs.MediaPlayer.events.ERROR, (e) => {
          showError(`Failed to load DASH stream: ${e.error || 'Unknown error'}`);
        });

        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo(video, null, dashPlayer);
        });

        // Update info on quality change
        dashPlayer.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, () => {
          updateStreamInfo(video, null, dashPlayer);
        });

      } else {
        // Fallback to native DASH support
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          updateStreamInfo(video);
        });

        video.addEventListener('error', (e) => {
          showError('Failed to load DASH stream. Your browser may not support this format.');
        });
      }

    } else {
      // Try native playback for other formats
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        updateStreamInfo(video);
      });

      video.addEventListener('error', (e) => {
        showError('Failed to load stream. Unsupported format or CORS restriction.');
      });
    }

  } catch (error) {
    showError('Error initializing player: ' + error.message);
  }
}

// Update stream information display
function updateStreamInfo(video, hls = null, dash = null) {
  const infoContent = document.getElementById('info-content');

  const resolution = video.videoWidth && video.videoHeight
    ? `${video.videoWidth}x${video.videoHeight}`
    : 'Unknown';

  let bitrate = 'Unknown';
  let fps = '';
  let codec = '';

  // Get info from HLS.js
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

  // Get info from dash.js
  if (dash) {
    const bitrateInfo = dash.getBitrateInfoListFor('video');
    const currentQuality = dash.getQualityFor('video');

    if (bitrateInfo && bitrateInfo[currentQuality]) {
      const quality = bitrateInfo[currentQuality];
      if (quality.bitrate) {
        bitrate = Math.round(quality.bitrate / 1000) + ' Kbps';
      }
      if (quality.width && quality.height) {
        // Use dash.js provided resolution if available
        // resolution = `${quality.width}x${quality.height}`;
      }
    }
  }

  let infoHTML = '<div class="info-primary">Stream Info</div>';
  infoHTML += `<div class="info-line info-secondary">Resolution: ${resolution}</div>`;
  if (fps) infoHTML += `<div class="info-line info-secondary">Frame Rate: ${fps}</div>`;
  infoHTML += `<div class="info-line info-secondary">Bitrate: ${bitrate}</div>`;
  if (codec) {
    infoHTML += `<div class="info-line info-secondary">Codec: ${codec}</div>`;
  }

  infoContent.innerHTML = infoHTML;
}

// Setup keyboard controls
function setupKeyboardControls() {
  const video = document.getElementById('video-player');

  document.addEventListener('keydown', function(e) {
    switch(e.key) {
      case 'f':
      case 'F':
        // Toggle fullscreen
        if (!document.fullscreenElement) {
          video.requestFullscreen().catch(err => {
            console.error('Fullscreen failed:', err);
          });
        } else {
          document.exitFullscreen();
        }
        break;

      case ' ':
      case 'Spacebar':
        // Play/pause
        e.preventDefault();
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
        break;

      case 'Escape':
        // Exit fullscreen
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        break;

      case 'ArrowLeft':
        // Rewind 10 seconds
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;

      case 'ArrowRight':
        // Forward 10 seconds
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
        break;

      case 'ArrowUp':
        // Volume up
        e.preventDefault();
        video.volume = Math.min(1, video.volume + 0.1);
        break;

      case 'ArrowDown':
        // Volume down
        e.preventDefault();
        video.volume = Math.max(0, video.volume - 0.1);
        break;

      case 'm':
      case 'M':
        // Mute/unmute
        video.muted = !video.muted;
        break;
    }
  });
}

// Setup info display controls (minimize/close)
function setupInfoControls() {
  const infoDisplay = document.getElementById('stream-info');
  const minimizeBtn = document.getElementById('minimize-btn');
  const closeBtn = document.getElementById('close-btn');

  // Minimize button
  minimizeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    infoDisplay.classList.toggle('minimized');
  });

  // Close button
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    infoDisplay.classList.add('hidden');
  });

  // Click on minimized info to restore
  infoDisplay.addEventListener('click', function() {
    if (infoDisplay.classList.contains('minimized')) {
      infoDisplay.classList.remove('minimized');
    }
  });
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  const video = document.getElementById('video-player');
  const infoDisplay = document.getElementById('stream-info');

  errorText.textContent = message;
  errorDiv.style.display = 'block';
  video.style.display = 'none';
  infoDisplay.style.display = 'none';
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
  if (hlsPlayer) {
    hlsPlayer.destroy();
  }
  if (dashPlayer) {
    dashPlayer.reset();
  }
});
