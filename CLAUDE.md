# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stream Sniper** is a Firefox browser extension (Manifest V2) that detects, analyzes, and manages adaptive streaming URLs across web pages. Supports HLS (M3U8), MPEG-DASH (MPD), M3U playlists, and Microsoft Smooth Streaming (ISM/ISMC). Features include live video previews, automatic quality detection, stream validation, full-screen player, and export functionality.

## Development Workflow

### Testing the Extension

**Load in Firefox (Temporary):**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from the project directory
4. Extension persists until browser restart

**Testing Stream Detection:**
- Visit streaming sites (YouTube, Twitch, Vimeo, Twitter videos)
- Extension badge should show count of detected streams
- Click icon to view popup with detected streams
- Preview videos should auto-load (if enabled in settings)
- Quality info should parse automatically for M3U8/MPD streams

**Debugging:**
- Background script console: `about:debugging` → "Inspect" on Stream Sniper
- Popup console: Right-click popup → "Inspect Element"
- Check browser console on target pages for errors

### Packaging for Distribution

```bash
# From project root (Windows - use 7-Zip, WinRAR, or WSL)
zip -r stream-sniper.zip manifest.json background.js popup.html popup.js popup.css storage-manager.js manifest-parser.js player.html player.js player.css options.html options.js icon.png hls.min.js

# Alternative: Create archive manually with these files
# manifest.json background.js popup.html popup.js popup.css
# storage-manager.js manifest-parser.js player.html player.js player.css
# options.html options.js icon.png hls.min.js
```

**For Firefox Add-ons (AMO):**
1. Create Firefox account at https://addons.mozilla.org
2. Submit .zip file for review and signing
3. Once signed, install the resulting .xpi file

## Architecture Overview

### Three-Tier Design

1. **Background Layer** (`background.js`)
   - Monitors ALL network requests via `webRequest.onBeforeRequest` on `<all_urls>`
   - Pattern matches against `STREAM_FORMATS` array using regex
   - Maintains in-memory session state: `detectedStreams` object keyed by `tabId`
   - Auto-validates streams on detection via HEAD request
   - Updates badge count immediately upon detection
   - Handles message passing from popup (actions: `getStreams`, `clearStreams`, `clearHistory`, `resetStats`, `validateStream`, `setDetection`)

2. **Storage Layer** (`storage-manager.js`)
   - Wraps `browser.storage.local` with structured API
   - Three storage keys: `streamHistory` (500 max), `streamStats`, `sessionCount`, `settings`, `detectionEnabled`
   - Implements duplicate prevention (checks URL + pageUrl combination)
   - Statistics tracked by type (m3u8, mpd, etc.) and by domain
   - Export formats: JSON (with metadata), TXT (human-readable)

3. **UI Layer** (`popup.js`, `popup.html`, `popup.css`)
   - Four-tab interface: Current, History, Statistics, About
   - Real-time search/filtering across Current and History tabs
   - Live video preview using HLS.js for M3U8, native playback for others
   - Detection toggle: pause/resume monitoring without losing session data
   - Auto-loads previews and quality details (configurable in settings)

### Key Data Flows

**New Stream Detection:**
```
1. webRequest.onBeforeRequest fires → URL matched against STREAM_FORMATS
2. Stream data created: { url, type, typeName, domain, pageUrl, pageTitle, timestamp }
3. Added to session storage (detectedStreams[tabId]) → badge updated immediately
4. Auto-validation HEAD request (non-blocking) → updates validationStatus on stream object
5. browser.tabs.get() called async to fetch page title/URL
6. StorageManager.saveStream() → persists to history (if not duplicate)
7. Statistics updated (total, byType, byDomain)
8. Optional notification shown (if enabled in settings)
```

**Stream Validation:**
- Background script auto-validates on detection using HEAD request
- Results stored on stream object: `validationStatus`, `validationValid`, `validationError`, `validationStatusText`
- Popup displays pre-validated status immediately (no re-validation needed)
- Manual "Test" button also available for user-initiated validation

**Video Preview System:**
- Popup auto-loads previews if `settings.autoPreview === true` (default)
- M3U8/M3U: Uses HLS.js library with quality-based config (low/medium/high from `settings.previewQuality`)
- MPD: Attempts native DASH support (Firefox has built-in DASH)
- Creates `<video>` element with overlay showing: resolution, bitrate, FPS, codec
- HLS instances stored in global `hlsInstances` object for cleanup on preview close
- Close button on each preview destroys HLS instance and clears DOM

**Manifest Parsing:**
- Auto-triggered for M3U8/M3U/MPD streams when displayed
- M3U8: Parses `#EXT-X-STREAM-INF` tags → extracts BANDWIDTH, RESOLUTION, FRAME-RATE, CODECS
- MPD: Parses XML `<Representation>` elements → extracts bandwidth, width, height, frameRate, codecs
- Results displayed inline under each stream with skeleton loading state
- CORS restrictions may prevent parsing (displayed as error message)

### State Management

**Session State (In-Memory):**
- `detectedStreams` object in background.js: `{ [tabId]: [stream, stream, ...] }`
- Cleared on tab close (`tabs.onRemoved`) or navigation (`tabs.onUpdated` with status='loading')
- Detection toggle state: `detectionEnabled` boolean (persisted to storage)

**Persistent State (`browser.storage.local`):**
- `streamHistory`: Array of stream objects, max 500 (oldest removed)
- `streamStats`: `{ total: number, byType: {}, byDomain: {} }`
- `sessionCount`: Integer (resets on browser restart via `runtime.onStartup`)
- `settings`: `{ notifications: bool, autoValidate: bool, autoPreview: bool, previewQuality: 'low'|'medium'|'high' }`
- `detectionEnabled`: Boolean toggle for pausing detection

**Duplicate Prevention:**
- Session level: Check `detectedStreams[tabId]` array for matching URL
- Persistent level: Check history array for matching URL + pageUrl combination
- Prevents same stream being saved multiple times per page visit

## Component Responsibilities

### background.js
- **Primary role:** Network monitoring and stream detection
- **Pattern matching:** Regex-based detection against `.m3u8`, `.mpd`, `.ism`, `.ismc` file extensions (with query param handling)
- **Auto-validation:** Immediate HEAD request on detection (non-blocking, updates stream object)
- **Badge management:** Updates count immediately on detection, clears on tab navigation/close
- **Tab cleanup:** Removes session data on tab close/navigation
- **Message handling:** Responds to popup requests (getStreams, clearStreams, etc.)
- **Detection toggle:** Respects `detectionEnabled` state, skips monitoring when paused

### popup.js
- **Primary role:** UI rendering and user interaction
- **Tab switching:** Manages four-tab interface with state management
- **Live previews:** HLS.js integration for M3U8, native playback for others
- **Auto-loading:** Triggers preview and quality parsing automatically on stream display
- **Connection detection:** Uses Network Information API to detect slow connections, suggests disabling auto-preview
- **Detection control:** Toggle switch sends `setDetection` message to background, updates UI state
- **Search/filter:** Real-time filtering across Current and History tabs
- **Player integration:** Opens full-screen player in new tab via `browser.tabs.create()`

### storage-manager.js
- **Primary role:** Persistent data management
- **History limit:** Enforces 500-stream cap (oldest removed on overflow)
- **Statistics tracking:** Maintains total, byType, byDomain counters
- **Export functionality:** JSON format with metadata, TXT format human-readable
- **Duplicate checking:** Prevents re-saving same URL+pageUrl combination
- **Initialization:** Sets up default stats and session count on first run

### manifest-parser.js
- **Primary role:** Fetch and parse streaming manifests
- **M3U8 parsing:** Regex extraction of #EXT-X-STREAM-INF tags
- **MPD parsing:** DOMParser XML extraction of Representation elements
- **Quality extraction:** Bandwidth, resolution, framerate, codecs
- **Error handling:** CORS failures, parse errors, simple playlists (no variants)
- **Format helper:** `formatQuality()` creates display strings from quality objects

### player.js / player.html
- **Primary role:** Full-screen stream playback in new tab
- **URL params:** Receives `?url=...&type=...` from popup
- **HLS.js integration:** M3U8 playback with level switching
- **Keyboard controls:** F (fullscreen), Space (play/pause), arrows (seek/volume), M (mute)
- **Stream info display:** Top-right overlay with resolution, bitrate, FPS, codec (minimizable/closable)
- **Error handling:** Displays user-friendly errors for unsupported formats or CORS issues

### options.js / options.html
- **Primary role:** User preferences configuration
- **Settings:**
  - `notifications`: Show toast alerts on stream detection
  - `autoValidate`: [Currently unused - validation always happens]
  - `saveToHistory`: [Planned feature - not yet implemented]
  - `autoPreview`: Toggle automatic preview loading in popup
  - `previewQuality`: 'low' | 'medium' | 'high' (affects HLS.js buffer config and level selection)

## Important Implementation Details

### Browser API Dependencies

**WebExtensions APIs Used:**
- `browser.webRequest`: Monitor all HTTP requests (`<all_urls>` permission)
- `browser.storage.local`: Persistent data (no quota, but browser-imposed limits apply)
- `browser.notifications`: Toast notifications for new streams
- `browser.tabs`: Query tabs, get page info, create new tabs
- `browser.runtime`: Message passing, open options page, get resource URLs
- `browser.browserAction`: Badge text/color, popup

**Firefox-Specific:**
- Uses `browser.*` namespace (not `chrome.*`)
- Manifest V2 format (V3 not yet required in Firefox)
- Native DASH support in `<video>` element

### CORS Limitations

- Manifest parsing (`ManifestParser`) uses `fetch()` → subject to CORS
- Some domains block cross-origin requests → parsing fails with error message
- Stream validation (HEAD request) also subject to CORS
- Video preview may fail on CORS-restricted streams → displays error

### HLS.js Configuration

**Quality Presets (from `settings.previewQuality`):**
- **Low:** `startLevel: 0`, `backBufferLength: 5`, `maxBufferLength: 10`, `capLevelToPlayerSize: true`
- **Medium:** Default HLS.js settings, `backBufferLength: 10`, `maxBufferLength: 30`
- **High:** `startLevel: -1` (auto-select highest), `backBufferLength: 20`, `maxBufferLength: 60`

**Instance Management:**
- Global `hlsInstances` object stores instances by stream index
- Cleanup on preview close: `hls.destroy()` + delete from object
- Cleanup on popup unload: `window.beforeunload` handler

### Performance Considerations

- **Auto-preview:** Loads ALL detected streams immediately (can be bandwidth-heavy)
- **Connection detection:** Network Information API checks for slow connections, suggests disabling auto-preview
- **Preview limit:** No hard limit on concurrent previews (user can open all)
- **Badge updates:** Synchronous, updates immediately on detection
- **Manifest parsing:** Async, non-blocking, runs for all M3U8/MPD streams
- **Storage limit:** 500-stream history cap prevents unbounded growth

## Chrome/Edge Compatibility Notes

This extension is **Firefox-only** in current form. To port to Chrome/Edge:

1. **Manifest V3 migration:** Chrome requires V3, Firefox still supports V2
2. **API namespace:** Replace `browser.*` with `chrome.*` (or use polyfill)
3. **webRequest limitations:** V3 restricts `webRequest` → use `declarativeNetRequest` (less flexible for dynamic pattern matching)
4. **Permissions changes:** V3 has stricter permission model
5. **Service worker:** V3 requires service worker instead of background page

## Common Development Tasks

### Adding New Stream Format

1. Add pattern to `STREAM_FORMATS` array in `background.js`:
   ```javascript
   { pattern: /\.newformat(\?|$)/i, type: 'newformat', name: 'New Format' }
   ```
2. Add filter option in `popup.html` (filter-type select)
3. Add badge styling in `popup.css` (`.badge-newformat`)
4. (Optional) Implement parser in `manifest-parser.js` if format has quality variants

### Modifying Storage Schema

1. Update `StorageManager.KEYS` in `storage-manager.js`
2. Add migration logic in `StorageManager.init()` if changing existing keys
3. Update `clearHistory`/`resetStats` message handlers in `background.js` if applicable
4. Test with existing data to ensure no data loss

### Adding New Message Action

1. Add handler in `browser.runtime.onMessage.addListener` in `background.js`
2. Call from popup using `browser.runtime.sendMessage({ action: 'newAction', ...params })`
3. Return `true` from handler if response is async (`sendResponse` called later)

### Debugging Preview Issues

- Check HLS.js console errors (popup console)
- Verify CORS headers on stream URL (Network tab)
- Test with known-good stream (e.g., Apple HLS test streams)
- Check `hlsInstances` object for orphaned instances
- Verify `settings.autoPreview` and `settings.previewQuality` values

## Testing Sites

**Recommended for testing stream detection:**
- **Twitch.tv:** Reliable HLS (M3U8) streams with quality variants
- **Twitter/X videos:** HLS streams, various qualities
- **Vimeo:** HLS and DASH support depending on video
- **YouTube:** DASH (MPD) streams (may be obfuscated)
- **Apple HLS test streams:** https://developer.apple.com/streaming/examples/

## Known Limitations

- **ISM/ISMC detection:** Detected but not parsed (no parser implemented)
- **CORS restrictions:** Cannot parse manifests from many domains
- **YouTube obfuscation:** Some sites obfuscate stream URLs, may not match patterns
- **Authentication:** Cannot handle streams requiring authentication headers
- **DRM content:** No DRM support (HLS.js limitation)
- **History cap:** Max 500 streams (oldest auto-removed)
- **Session count:** Resets on browser restart (by design)
