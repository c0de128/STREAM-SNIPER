// Stream Sniper popup - Quality selector modal
// In-popup quality analysis and selection before download.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// ========== QUALITY SELECTOR FUNCTIONS ==========

let currentStreamForQuality = null;

// Last measured connection speed from the background (QualityAnalyzer), if any
let connectionSpeed = null;

// Open quality selector modal
async function openQualitySelector(stream, index) {
  currentStreamForQuality = stream;

  try {
    const speedResponse = await browser.runtime.sendMessage({ action: 'getConnectionSpeed' });
    connectionSpeed = (speedResponse && speedResponse.success && speedResponse.speed && speedResponse.speed.label) ? speedResponse.speed : null;
  } catch (e) {
    connectionSpeed = null;
  }

  const modal = document.getElementById('quality-modal');
  const qualityList = document.getElementById('quality-list');
  const connectionSpeedEl = document.getElementById('modal-connection-speed');
  const recommendationEl = document.getElementById('quality-recommendation');
  const warningsEl = document.getElementById('quality-warnings');

  // Show modal
  modal.style.display = 'flex';

  // Reset content
  qualityList.innerHTML = '<div class="loading">Analyzing qualities...</div>';
  recommendationEl.innerHTML = '';
  warningsEl.innerHTML = '';

  // Display connection speed
  if (connectionSpeed) {
    connectionSpeedEl.innerHTML = `<strong>${connectionSpeed.label}</strong> (${formatSpeed(connectionSpeed.bytesPerSecond)})`;
  } else {
    connectionSpeedEl.textContent = 'Unknown';
  }

  try {
    // Fetch quality analysis from backend
    const response = await browser.runtime.sendMessage({
      action: 'analyzeStreamQuality',
      streamData: stream
    });

    if (response.success && response.analysis) {
      displayQualityAnalysis(response.analysis);
    } else {
      qualityList.innerHTML = '<div class="error">Failed to analyze qualities</div>';
    }
  } catch (error) {
    console.error('Error analyzing quality:', error);
    qualityList.innerHTML = '<div class="error">Error analyzing qualities</div>';
  }
}

// Display quality analysis in modal
function displayQualityAnalysis(analysis) {
  const qualityList = document.getElementById('quality-list');
  const recommendationEl = document.getElementById('quality-recommendation');
  const warningsEl = document.getElementById('quality-warnings');

  // Clear loading message
  qualityList.innerHTML = '';

  // Display recommendation
  if (analysis.recommendation) {
    const rec = analysis.recommendation;
    recommendationEl.innerHTML = `
      <div class="recommendation-icon">💡</div>
      <div class="recommendation-text">
        <strong>Recommended Quality:</strong> ${rec.label}<br>
        <span class="recommendation-reason">${rec.reason}</span>
      </div>
    `;
  }

  // Display warnings
  if (analysis.warnings && analysis.warnings.length > 0) {
    warningsEl.innerHTML = '';
    analysis.warnings.forEach(warning => {
      const warningDiv = document.createElement('div');
      warningDiv.className = `warning-item ${warning.severity}`;
      warningDiv.innerHTML = `
        <span class="warning-icon">${getWarningIcon(warning.severity)}</span>
        <span class="warning-text">${warning.message}</span>
      `;
      warningsEl.appendChild(warningDiv);
    });
  }

  // Display qualities
  if (analysis.qualities && analysis.qualities.length > 0) {
    analysis.qualities.forEach(quality => {
      const qualityItem = createQualityItem(quality, analysis.recommendation);
      qualityList.appendChild(qualityItem);
    });
  } else {
    qualityList.innerHTML = '<div class="message">No quality variants found</div>';
  }
}

// Create quality item element
function createQualityItem(quality, recommendation) {
  const div = document.createElement('div');
  div.className = 'quality-item';

  // Highlight recommended quality
  if (recommendation && quality.label === recommendation.label) {
    div.classList.add('recommended');
  }

  // Quality header with label and badges
  const header = document.createElement('div');
  header.className = 'quality-header';

  const label = document.createElement('div');
  label.className = 'quality-label';
  label.textContent = quality.label || 'Unknown Quality';
  header.appendChild(label);

  const badges = document.createElement('div');
  badges.className = 'quality-badges';

  // Recommended badge
  if (recommendation && quality.label === recommendation.label) {
    const badge = document.createElement('span');
    badge.className = 'quality-badge recommended-badge';
    badge.textContent = '⭐ Recommended';
    badges.appendChild(badge);
  }

  // Suitability badge
  if (quality.suitability) {
    const badge = document.createElement('span');
    badge.className = `quality-badge suitability-${quality.suitability.toLowerCase()}`;
    badge.textContent = quality.suitability;
    badges.appendChild(badge);
  }

  header.appendChild(badges);
  div.appendChild(header);

  // Quality details
  const details = document.createElement('div');
  details.className = 'quality-details';

  if (quality.bandwidth) {
    const detail = document.createElement('div');
    detail.className = 'quality-detail';
    detail.innerHTML = `<span class="detail-label">Bandwidth:</span> <span class="detail-value">${formatSpeed(quality.bandwidth)}</span>`;
    details.appendChild(detail);
  }

  if (quality.resolution) {
    const detail = document.createElement('div');
    detail.className = 'quality-detail';
    detail.innerHTML = `<span class="detail-label">Resolution:</span> <span class="detail-value">${quality.resolution}</span>`;
    details.appendChild(detail);
  }

  if (quality.codecs) {
    const detail = document.createElement('div');
    detail.className = 'quality-detail';
    detail.innerHTML = `<span class="detail-label">Codecs:</span> <span class="detail-value">${quality.codecs}</span>`;
    details.appendChild(detail);
  }

  if (quality.compatibility) {
    const detail = document.createElement('div');
    detail.className = 'quality-detail';
    detail.innerHTML = `<span class="detail-label">Compatibility:</span> <span class="detail-value">${quality.compatibility}</span>`;
    details.appendChild(detail);
  }

  if (quality.estimatedSize) {
    const detail = document.createElement('div');
    detail.className = 'quality-detail';
    detail.innerHTML = `<span class="detail-label">Est. Size:</span> <span class="detail-value">${formatBytes(quality.estimatedSize)}</span>`;
    details.appendChild(detail);
  }

  div.appendChild(details);

  // Click handler to select this quality
  div.addEventListener('click', () => {
    selectQuality(quality);
  });

  return div;
}

// Select a quality for download
async function selectQuality(quality) {
  if (!currentStreamForQuality) {
    showError('No stream selected');
    return;
  }

  try {
    // Start download with selected quality
    const response = await browser.runtime.sendMessage({
      action: 'downloadStreamWithQuality',
      streamData: currentStreamForQuality,
      quality: quality
    });

    if (response.success) {
      showSuccess(`Started download: ${quality.label || 'Selected quality'}`);
      closeQualityModal();
      switchTab('downloads');
    } else {
      showError('Failed to start download: ' + response.error);
    }
  } catch (error) {
    showError('Error starting download: ' + error.message);
  }
}

// Close quality modal
function closeQualityModal() {
  const modal = document.getElementById('quality-modal');
  modal.style.display = 'none';
  currentStreamForQuality = null;
}

// Get warning icon by severity
function getWarningIcon(severity) {
  switch (severity) {
    case 'error': return '🔴';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '💡';
  }
}

// Setup quality modal event listeners
function setupQualityModalListeners() {
  const modal = document.getElementById('quality-modal');
  const overlay = document.getElementById('quality-modal-overlay');
  const closeBtn = document.getElementById('quality-modal-close');

  // Close on overlay click
  if (overlay) {
    overlay.addEventListener('click', closeQualityModal);
  }

  // Close on close button click
  if (closeBtn) {
    closeBtn.addEventListener('click', closeQualityModal);
  }

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeQualityModal();
    }
  });
}

