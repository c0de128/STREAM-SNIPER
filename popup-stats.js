// Stream Sniper popup - Statistics tab
// Analytics dashboard: totals, category breakdown, quality distribution, time trends.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// Load statistics
let analyticsData = null;

async function loadStatistics() {
  currentStats = await StorageManager.getStats();
  const sessionCount = await StorageManager.getSessionCount();
  currentStats.sessionCount = sessionCount;

  // Load analytics from backend
  await loadAnalytics();
}

// Load analytics data from backend
async function loadAnalytics() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'getAnalyticsSummary' });
    if (response && response.success) {
      analyticsData = response.summary;
    }
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

// Display statistics
async function displayStatistics() {
  if (!currentStats) {
    await loadStatistics();
  }

  // Update summary cards
  document.getElementById('total-streams').textContent = currentStats.total || 0;
  document.getElementById('current-session').textContent = currentStats.sessionCount || 0;

  // Update analytics cards
  if (analyticsData) {
    document.getElementById('total-downloads').textContent = analyticsData.downloads?.total || 0;
    document.getElementById('total-recordings').textContent = analyticsData.recordings?.total || 0;

    // Download metrics
    document.getElementById('download-total-size').textContent =
      formatBytes(analyticsData.downloads?.totalSize || 0);
    document.getElementById('download-success-rate').textContent =
      `${Math.round(analyticsData.performance?.successRate || 0)}%`;
    document.getElementById('download-avg-speed').textContent =
      `${(analyticsData.performance?.averageDownloadSpeed || 0).toFixed(1)} Mbps`;
    document.getElementById('download-peak-speed').textContent =
      `${(analyticsData.performance?.peakDownloadSpeed || 0).toFixed(1)} Mbps`;

    // Recording metrics
    const totalDuration = analyticsData.recordings?.totalDuration || 0;
    const hours = Math.floor(totalDuration / 3600000);
    const minutes = Math.floor((totalDuration % 3600000) / 60000);
    document.getElementById('recording-total-duration').textContent = `${hours}h ${minutes}m`;
    document.getElementById('recording-total-size').textContent =
      formatBytes(analyticsData.recordings?.totalSize || 0);
    document.getElementById('recording-completed').textContent =
      analyticsData.recordings?.successful || 0;
    document.getElementById('recording-failed').textContent =
      analyticsData.recordings?.failed || 0;
  }

  // Display category breakdown
  displayCategoryBreakdown();

  // Display quality distribution
  displayQualityDistribution();

  // Display by format
  const formatStats = document.getElementById('format-stats');
  formatStats.innerHTML = '';

  const byType = Object.entries(currentStats.byType).sort((a, b) => b[1] - a[1]);

  if (byType.length === 0) {
    formatStats.innerHTML = '<div class="stats-list-item"><span class="stats-label">No data yet</span></div>';
  } else {
    byType.forEach(([type, count]) => {
      const item = document.createElement('div');
      item.className = 'stats-list-item';

      const label = document.createElement('span');
      label.className = 'stats-label';
      label.textContent = type.toUpperCase();
      item.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-value';
      value.textContent = count;
      item.appendChild(value);

      formatStats.appendChild(item);
    });
  }

  // Display top domains
  const domainStats = document.getElementById('domain-stats');
  domainStats.innerHTML = '';

  const byDomain = Object.entries(currentStats.byDomain).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (byDomain.length === 0) {
    domainStats.innerHTML = '<div class="stats-list-item"><span class="stats-label">No data yet</span></div>';
  } else {
    byDomain.forEach(([domain, count]) => {
      const item = document.createElement('div');
      item.className = 'stats-list-item';

      const label = document.createElement('span');
      label.className = 'stats-label';
      label.textContent = domain;
      item.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-value';
      value.textContent = count;
      item.appendChild(value);

      domainStats.appendChild(item);
    });
  }

  // Display time trends
  displayTimeTrends();
}

// Display category breakdown as bars
async function displayCategoryBreakdown() {
  const container = document.getElementById('category-breakdown');
  container.innerHTML = '';

  try {
    const response = await browser.runtime.sendMessage({ action: 'getCategoryBreakdown' });
    if (!response || !response.success || !response.breakdown) {
      container.innerHTML = '<div class="analytics-empty">No category data available</div>';
      return;
    }

    const breakdown = Object.entries(response.breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8); // Top 8 categories

    if (breakdown.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No category data available</div>';
      return;
    }

    const maxCount = breakdown[0][1];

    breakdown.forEach(([category, count]) => {
      const percentage = (count / maxCount) * 100;

      const barItem = document.createElement('div');
      barItem.className = 'stats-bar-item';

      const header = document.createElement('div');
      header.className = 'stats-bar-header';

      const label = document.createElement('span');
      label.className = 'stats-bar-label';
      label.textContent = category.replace(/_/g, ' ');
      header.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-bar-value';
      value.textContent = count;
      header.appendChild(value);

      barItem.appendChild(header);

      const barContainer = document.createElement('div');
      barContainer.className = 'stats-bar-container';

      const barFill = document.createElement('div');
      barFill.className = 'stats-bar-fill';
      barFill.style.width = `${percentage}%`;

      if (percentage > 20) {
        const percentageText = document.createElement('span');
        percentageText.className = 'stats-bar-percentage';
        percentageText.textContent = `${Math.round(percentage)}%`;
        barFill.appendChild(percentageText);
      }

      barContainer.appendChild(barFill);
      barItem.appendChild(barContainer);
      container.appendChild(barItem);
    });
  } catch (error) {
    console.error('Error displaying category breakdown:', error);
    container.innerHTML = '<div class="analytics-empty">Failed to load category data</div>';
  }
}

// Display quality distribution as bars
async function displayQualityDistribution() {
  const container = document.getElementById('quality-distribution');
  container.innerHTML = '';

  try {
    const response = await browser.runtime.sendMessage({ action: 'getQualityDistribution' });
    if (!response || !response.success || !response.distribution) {
      container.innerHTML = '<div class="analytics-empty">No quality data available</div>';
      return;
    }

    const distribution = Object.entries(response.distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 qualities

    if (distribution.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No quality data available</div>';
      return;
    }

    const maxCount = distribution[0][1];

    distribution.forEach(([quality, count]) => {
      const percentage = (count / maxCount) * 100;

      const barItem = document.createElement('div');
      barItem.className = 'stats-bar-item';

      const header = document.createElement('div');
      header.className = 'stats-bar-header';

      const label = document.createElement('span');
      label.className = 'stats-bar-label';
      label.textContent = quality || 'Unknown';
      header.appendChild(label);

      const value = document.createElement('span');
      value.className = 'stats-bar-value';
      value.textContent = count;
      header.appendChild(value);

      barItem.appendChild(header);

      const barContainer = document.createElement('div');
      barContainer.className = 'stats-bar-container';

      const barFill = document.createElement('div');
      barFill.className = 'stats-bar-fill';
      barFill.style.width = `${percentage}%`;

      if (percentage > 20) {
        const percentageText = document.createElement('span');
        percentageText.className = 'stats-bar-percentage';
        percentageText.textContent = `${Math.round(percentage)}%`;
        barFill.appendChild(percentageText);
      }

      barContainer.appendChild(barFill);
      barItem.appendChild(barContainer);
      container.appendChild(barItem);
    });
  } catch (error) {
    console.error('Error displaying quality distribution:', error);
    container.innerHTML = '<div class="analytics-empty">Failed to load quality data</div>';
  }
}

// Display time trends as timeline
async function displayTimeTrends() {
  const container = document.getElementById('time-trends');
  container.innerHTML = '';

  try {
    const response = await browser.runtime.sendMessage({ action: 'getTimeTrends', period: 'day' });
    if (!response || !response.success || !response.trends) {
      container.innerHTML = '<div class="analytics-empty">No activity data available</div>';
      return;
    }

    const trends = Object.entries(response.trends)
      .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date descending
      .slice(0, 7); // Last 7 days

    if (trends.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No recent activity</div>';
      return;
    }

    trends.forEach(([date, data]) => {
      const timelineItem = document.createElement('div');
      timelineItem.className = 'timeline-item';

      const dateSpan = document.createElement('div');
      dateSpan.className = 'timeline-date';
      dateSpan.textContent = date;
      timelineItem.appendChild(dateSpan);

      const content = document.createElement('div');
      content.className = 'timeline-content';

      if (data.streams > 0) {
        const badge = document.createElement('span');
        badge.className = 'timeline-badge streams';
        badge.textContent = `${data.streams} streams`;
        content.appendChild(badge);
      }

      if (data.downloads > 0) {
        const badge = document.createElement('span');
        badge.className = 'timeline-badge downloads';
        badge.textContent = `${data.downloads} downloads`;
        content.appendChild(badge);
      }

      if (data.recordings > 0) {
        const badge = document.createElement('span');
        badge.className = 'timeline-badge recordings';
        badge.textContent = `${data.recordings} recordings`;
        content.appendChild(badge);
      }

      timelineItem.appendChild(content);
      container.appendChild(timelineItem);
    });
  } catch (error) {
    console.error('Error displaying time trends:', error);
    container.innerHTML = '<div class="analytics-empty">Failed to load activity data</div>';
  }
}

// Reset statistics
async function resetStatistics() {
  if (confirm('Are you sure you want to reset all statistics?')) {
    await browser.runtime.sendMessage({action: 'resetStats'});
    await loadStatistics();
    displayStatistics();
  }
}

