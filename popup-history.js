// Stream Sniper popup - History & Favorites tabs
// Persistent history with domain/date/type filters, and the favorites list.
// Loaded by popup.html after popup-core.js; shares the global scope with the other popup-*.js modules.

// Load history
async function loadHistory() {
  allHistory = await StorageManager.getHistory();
}

// Display history
function displayHistory() {
  const historyList = document.getElementById('history-list');
  const noHistoryMsg = document.getElementById('no-history');

  populateHistoryDomains();

  const filtered = StorageManager.filterHistory(allHistory, {
    query: historySearchQuery,
    domain: historyDomain,
    days: historyDays,
    type: historyType
  });

  const countEl = document.getElementById('history-count');
  if (countEl) countEl.textContent = `${filtered.length} / ${allHistory.length}`;

  if (filtered.length === 0) {
    noHistoryMsg.style.display = 'block';
    historyList.innerHTML = '';
    return;
  }

  noHistoryMsg.style.display = 'none';
  historyList.innerHTML = '';

  filtered.forEach(item => {
    const historyItem = createHistoryElement(item);
    historyList.appendChild(historyItem);
  });
}

// Fill the domain dropdown from history (keeps current selection when still present)
function populateHistoryDomains() {
  const select = document.getElementById('history-domain');
  if (!select) return;
  const domains = StorageManager.historyDomains(allHistory);
  const current = select.value;
  select.innerHTML = '<option value="">All domains</option>';
  for (const d of domains) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  }
  if (domains.includes(current)) select.value = current;
  else { select.value = ''; historyDomain = ''; }
}

// Create history element
function createHistoryElement(item) {
  const div = document.createElement('div');
  div.className = 'history-item';

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const domain = document.createElement('span');
  domain.className = 'history-domain';
  domain.textContent = item.domain;
  meta.appendChild(domain);

  const date = document.createElement('span');
  date.textContent = new Date(item.timestamp).toLocaleString();
  meta.appendChild(date);

  div.appendChild(meta);

  const header = document.createElement('div');
  header.className = 'stream-header';

  const badge = document.createElement('span');
  badge.className = `stream-type-badge badge-${item.type}`;
  badge.textContent = item.type.toUpperCase();
  header.appendChild(badge);

  if (item.pageTitle) {
    const title = document.createElement('span');
    title.style.fontSize = '11px';
    title.style.color = '#999';
    title.textContent = item.pageTitle;
    header.appendChild(title);
  }

  div.appendChild(header);

  const body = document.createElement('div');
  body.className = 'stream-body';

  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = item.url;
  body.appendChild(url);

  body.appendChild(createCopyDropdown(item.url, item));

  div.appendChild(body);

  return div;
}

// Clear history
async function clearHistory() {
  if (confirm('Are you sure you want to clear all history?')) {
    await browser.runtime.sendMessage({action: 'clearHistory'});
    allHistory = [];
    displayHistory();
  }
}

// ========== FAVORITES FUNCTIONS ==========

// Load favorites
async function loadFavorites() {
  allFavorites = await StorageManager.getFavorites();
}

// Display favorites
function displayFavorites() {
  const favoritesList = document.getElementById('favorites-list');
  const noFavoritesMsg = document.getElementById('no-favorites');

  let filtered = allFavorites;

  if (favoritesSearchQuery) {
    filtered = allFavorites.filter(item =>
      item.url.toLowerCase().includes(favoritesSearchQuery.toLowerCase()) ||
      item.domain.toLowerCase().includes(favoritesSearchQuery.toLowerCase()) ||
      (item.pageTitle && item.pageTitle.toLowerCase().includes(favoritesSearchQuery.toLowerCase()))
    );
  }

  if (filtered.length === 0) {
    noFavoritesMsg.style.display = 'block';
    favoritesList.innerHTML = '';
    return;
  }

  noFavoritesMsg.style.display = 'none';
  favoritesList.innerHTML = '';

  filtered.forEach(item => {
    const favoriteItem = createFavoriteElement(item);
    favoritesList.appendChild(favoriteItem);
  });
}

// Create favorite element
function createFavoriteElement(item) {
  const div = document.createElement('div');
  div.className = 'favorite-item';

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const domain = document.createElement('span');
  domain.className = 'history-domain';
  domain.textContent = item.domain;
  meta.appendChild(domain);

  const date = document.createElement('span');
  date.textContent = new Date(item.addedAt || item.timestamp).toLocaleString();
  meta.appendChild(date);

  div.appendChild(meta);

  const header = document.createElement('div');
  header.className = 'stream-header';

  const badge = document.createElement('span');
  badge.className = `stream-type-badge badge-${item.type}`;
  badge.textContent = item.type.toUpperCase();
  header.appendChild(badge);

  if (item.pageTitle) {
    const title = document.createElement('span');
    title.style.fontSize = '11px';
    title.style.color = 'var(--text-muted)';
    title.textContent = item.pageTitle;
    header.appendChild(title);
  }

  div.appendChild(header);

  const body = document.createElement('div');
  body.className = 'stream-body';

  const url = document.createElement('div');
  url.className = 'stream-url';
  url.textContent = item.url;
  body.appendChild(url);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '5px';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyToClipboard(item.url, copyBtn));
  actions.appendChild(copyBtn);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'small-btn secondary';
  removeBtn.textContent = '★ Remove';
  removeBtn.addEventListener('click', async () => {
    await StorageManager.removeFavorite(item.url);
    await loadFavorites();
    displayFavorites();
  });
  actions.appendChild(removeBtn);

  body.appendChild(actions);
  div.appendChild(body);

  return div;
}

// Clear all favorites
async function clearFavorites() {
  if (confirm('Are you sure you want to clear all favorites?')) {
    await StorageManager.clearFavorites();
    allFavorites = [];
    displayFavorites();
  }
}

// Toggle favorite for a stream
async function toggleStreamFavorite(stream, button) {
  const isFavorited = await StorageManager.toggleFavorite(stream);

  if (isFavorited) {
    button.textContent = '★';
    button.classList.add('favorited');
    button.title = 'Remove from favorites';
  } else {
    button.textContent = '☆';
    button.classList.remove('favorited');
    button.title = 'Add to favorites';
  }

  // Reload favorites list
  await loadFavorites();
}

