# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stream Sniper** is a cross-browser extension (Firefox MV2 + Chrome/Edge MV3) that detects, analyzes, downloads, and manages adaptive streaming URLs across web pages. Supports HLS (M3U8), MPEG-DASH (MPD), M3U playlists, and Microsoft Smooth Streaming (ISM/ISMC). Features include:

- **Stream Detection:** Automatic detection of streaming URLs via network monitoring
- **Live Video Preview:** In-popup playback with quality selection using HLS.js and dash.js
- **Download Manager:** Native browser downloads + yt-dlp integration with queue management
- **Quality Selection:** Pre-download quality picker with resolution, bitrate, FPS, codec info
- **Full-Screen Player:** Dedicated player tab with keyboard controls and stream info overlay
- **History & Statistics:** Persistent storage of detected streams with analytics
- **Cross-Browser:** Universal build system for Firefox (MV2) and Chrome/Edge (MV3)

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

### Build System

**Using npm (Recommended):**
```bash
# Install dependencies
npm install

# Build all versions (Firefox, Chrome, source, native host)
npm run build

# Build specific versions
npm run build:firefox   # Firefox only
npm run build:chrome    # Chrome/Edge only
npm run build:source    # Source code archive
npm run build:native    # Native messaging host package

# Clean builds directory
npm run clean

# Watch mode (auto-rebuild on changes)
npm run watch
```

**Manual Build (build.js):**
```bash
node build.js all       # Build everything
node build.js firefox   # Firefox only
node build.js chrome    # Chrome only
```

**Output:**
- `builds/stream-sniper-firefox-v2.0.zip` - Firefox extension (MV2)
- `builds/stream-sniper-chrome-v2.0.zip` - Chrome/Edge extension (MV3)
- `builds/stream-sniper-source-v2.0.zip` - Source code for AMO review
- `builds/stream-sniper-native-host-v2.0.zip` - yt-dlp native messaging files

**Publishing:**
- **Firefox AMO:** https://addons.mozilla.org/developers/
- **Chrome Web Store:** https://chrome.google.com/webstore/devconsole
- **Edge Add-ons:** https://partner.microsoft.com/dashboard

## Architecture Overview

### Four-Tier Design

1. **Background Layer** (`background.js`)
   - Monitors ALL network requests via `webRequest.onBeforeRequest` on `<all_urls>`
   - Pattern matches against `STREAM_FORMATS` array using regex
   - Maintains in-memory session state: `detectedStreams` object keyed by `tabId`
   - Auto-validates streams on detection via HEAD request
   - Updates badge count immediately upon detection
   - Handles message passing from popup (20+ actions including stream, download, and settings operations)
   - Integrates `download-manager.js` and `manifest-parser.js` via importScripts (MV3 compatibility)

2. **Download Layer** (`download-manager.js`)
   - **Dual Download System:** Native browser API + yt-dlp integration
   - **Queue Management:** State machine (queued → downloading → completed/failed/paused)
   - **DownloadItem Class:** Tracks URL, progress, speed, ETA, method, quality, filename
   - **NativeDownloader:** Uses `browser.downloads` API for simple streams
   - **YtDlpDownloader:** Native messaging bridge to yt-dlp for complex formats
   - **Progress Tracking:** Real-time updates via `browser.downloads.onChanged` listener
   - **Persistent Queue:** Survives extension restarts, resumes interrupted downloads
   - **Automatic Filename Generation:** `sitename_title_quality_date.ext` format

3. **Storage Layer** (`storage-manager.js`)
   - Wraps `browser.storage.local` with structured API
   - Storage keys: `streamHistory` (500 max), `streamStats`, `sessionCount`, `settings`, `downloadSettings`, `downloadQueue`, `detectionEnabled`
   - Implements duplicate prevention (checks URL + pageUrl combination)
   - Statistics tracked by type (m3u8, mpd, etc.) and by domain
   - Export formats: JSON (with metadata), TXT (human-readable)
   - Download settings: method preference, quality defaults, yt-dlp config

4. **UI Layer** (`popup.js`, `popup.html`, `popup.css`)
   - Five-tab interface: Current, Downloads, History, Statistics, About
   - **Current Tab:** Stream detection with download buttons, preview, quality info
   - **Downloads Tab:** Real-time download queue with progress bars, pause/resume/cancel actions
   - **History Tab:** Persistent stream history with search/filter
   - **Statistics Tab:** Analytics dashboard with charts
   - Real-time search/filtering across Current and History tabs
   - Live video preview using HLS.js for M3U8, dash.js for MPD
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

**Download Initiation:**
```
1. User clicks "Download Best Quality" or "Select Quality" in popup
2. For "Select Quality":
   a. Open quality-selector.html in new tab with stream URL
   b. ManifestParser fetches and parses manifest (M3U8/MPD)
   c. Display quality grid with resolution, bitrate, FPS, codecs
   d. User selects quality → quality-selector.js sends message to background
3. Background receives 'startDownload' message with streamData + quality
4. If no quality specified, auto-select best quality from manifest
5. DownloadManager.addToQueue() creates DownloadItem with state='queued'
6. Determine download method:
   a. Auto: Simple streams → Native, Complex formats → yt-dlp (if available)
   b. Native: Always use browser.downloads API
   c. yt-dlp: Always use native messaging to yt-dlp bridge
7. DownloadItem.setState('downloading') → UI updates via message
8. For Native: browser.downloads.download() + onChanged listener for progress
9. For yt-dlp: connectNative() → send download command → receive progress updates
10. Progress updates sent to popup every 500ms via runtime.sendMessage
11. On completion: setState('completed'), optional notification
12. Queue saved to storage (survives extension restart)
```

**Native Messaging Flow (yt-dlp):**
```
1. YtDlpDownloader.download() calls browser.runtime.connectNative('com.streamsniper.ytdlp')
2. Browser launches ytdlp-bridge.py with stdin/stdout pipe
3. Extension sends JSON message: { type: 'download', url, output, format, args }
4. Python bridge validates yt-dlp availability (shutil.which)
5. Bridge spawns subprocess: yt-dlp -f FORMAT -o OUTPUT URL
6. Bridge parses yt-dlp stdout for progress (percentage, speed, ETA)
7. Bridge sends progress messages back to extension via stdout
8. Extension updates DownloadItem and notifies UI
9. On completion: Bridge sends { type: 'completed', output }
10. On error: Bridge sends { type: 'error', error }
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
- **Primary role:** Network monitoring, stream detection, and download coordination
- **Pattern matching:** Regex-based detection against `.m3u8`, `.mpd`, `.ism`, `.ismc` file extensions (with query param handling)
- **Auto-validation:** Immediate HEAD request on detection (non-blocking, updates stream object)
- **Badge management:** Updates count immediately on detection, clears on tab navigation/close
- **Tab cleanup:** Removes session data on tab close/navigation
- **Message handling:** 20+ message actions including:
  - Stream operations: `getStreams`, `clearStreams`, `validateStream`, `setDetection`
  - Download operations: `startDownload`, `addToQueue`, `pauseDownload`, `resumeDownload`, `cancelDownload`, `retryDownload`, `getDownloads`, `getActiveDownloads`, `clearCompletedDownloads`
  - Native messaging: `isYtDlpAvailable`
  - Storage: `clearHistory`, `resetStats`
- **Detection toggle:** Respects `detectionEnabled` state, skips monitoring when paused
- **MV3 Compatibility:** Uses `importScripts()` to load dependencies in service worker context

### popup.js
- **Primary role:** UI rendering, user interaction, and download management
- **Tab switching:** Manages five-tab interface (Current, Downloads, History, Statistics, About)
- **Current Tab:**
  - Live previews using HLS.js for M3U8, dash.js for MPD
  - Download dropdown: Best Quality, Select Quality, Add to Queue
  - Auto-loading of previews and quality parsing (configurable)
  - Connection detection for bandwidth-conscious suggestions
  - Detection control toggle
- **Downloads Tab:**
  - Real-time download queue display with 2-second polling
  - Download item rendering: progress bars, speed, ETA, state badges
  - Action buttons: Pause, Resume, Cancel, Retry, Clear Completed
  - formatBytes(), formatSpeed(), formatTime() utility functions
  - setupDownloadListeners() for message-based updates
- **History Tab:** Search/filter, persistent stream list
- **Statistics Tab:** Analytics with stream counts by type/domain
- **Player integration:** Opens full-screen player in new tab via `browser.tabs.create()`

### storage-manager.js
- **Primary role:** Persistent data management
- **History limit:** Enforces 500-stream cap (oldest removed on overflow)
- **Statistics tracking:** Maintains total, byType, byDomain counters
- **Export functionality:** JSON format with metadata, TXT format human-readable
- **Duplicate checking:** Prevents re-saving same URL+pageUrl combination
- **Download persistence:** `getDownloadQueue()`, `saveDownloadQueue()` for queue persistence
- **Settings management:**
  - `getSettings()`: General settings (dark mode, notifications, auto-preview, etc.)
  - `getDownloadSettings()`: Download preferences (method, quality, yt-dlp config)
- **Initialization:** Sets up default stats and session count on first run

### download-manager.js (NEW)
- **Primary role:** Download orchestration and queue management
- **DownloadItem Class:**
  - Properties: `id`, `url`, `state`, `progress`, `bytesReceived`, `totalBytes`, `speed`, `eta`, `method`, `quality`, `filename`, `error`
  - State machine: `queued` → `downloading` → `completed`/`failed`/`paused`
  - Methods: `setState()`, `updateProgress()`, `generateId()`, `generateFilename()`
  - Filename format: `sitename_title_quality_date.ext`
- **NativeDownloader Class:**
  - Uses `browser.downloads.download()` API
  - Monitors `browser.downloads.onChanged` for progress updates
  - Best for simple streams (direct HTTP downloads)
  - Automatic conflict resolution with `uniquify`
- **YtDlpDownloader Class:**
  - Uses native messaging (`browser.runtime.connectNative`)
  - Sends JSON commands to ytdlp-bridge.py
  - Parses yt-dlp progress output (percentage, speed, ETA)
  - Best for complex formats (HLS, DASH) with quality/codec selection
  - Supports custom yt-dlp arguments from settings
- **DownloadManager Singleton:**
  - `downloadQueue`: In-memory array of DownloadItem objects
  - `addToQueue()`: Create new download, determine method, start immediately
  - `startDownload()`: Initiate download based on method (auto/native/ytdlp)
  - `pauseDownload()`, `resumeDownload()`, `cancelDownload()`, `retryDownload()`
  - `getDownloads()`: Get all downloads, `getActiveDownloads()`: Filter by state
  - `clearCompleted()`: Remove completed/failed downloads
  - `isYtDlpAvailable()`: Check native messaging host status
  - `saveQueue()`: Persist queue to storage for restart recovery

### quality-selector.js / quality-selector.html (NEW)
- **Primary role:** Pre-download quality selection dialog
- **Opened via:** `browser.tabs.create()` from popup when user clicks "Select Quality"
- **URL parameters:** `?url=...&type=...&title=...&domain=...&pageUrl=...`
- **loadQualities():** Fetches and parses manifest using ManifestParser
- **displayQualities():** Renders quality grid with cards showing:
  - Resolution (1920x1080)
  - Quality label (HIGH/MEDIUM/LOW based on bandwidth)
  - Bitrate (5000 Kbps)
  - Framerate (30 fps)
  - Codecs (avc1.64001f, mp4a.40.2)
  - Estimated file size (MB/min)
- **selectQuality():** User clicks card → sends `startDownload` message to background
- **UI features:** Beautiful modal design, responsive grid, success animation on selection

### setup-wizard.js / setup-wizard.html (NEW)
- **Primary role:** Guided installation of yt-dlp and native messaging host
- **Three-step wizard:**
  1. **Install yt-dlp:** Platform-specific instructions (Windows/macOS/Linux)
     - Scoop/Homebrew/apt package managers
     - Manual download links
     - FFmpeg installation
     - Copy-to-clipboard command helpers
  2. **Install Native Messaging Host:**
     - Directory creation commands
     - ytdlp-bridge.py placement
     - Manifest file editing (path replacement)
     - Registry registration (Windows) or manifest copying (macOS/Linux)
  3. **Test Connection:**
     - `testYtDlp()` function sends `isYtDlpAvailable` message
     - Displays success/error with troubleshooting tips
- **Platform tabs:** Switch between Windows/macOS/Linux instructions
- **Copy buttons:** One-click command copying with visual feedback
- **Theme support:** Inherits dark mode from extension settings
- **Finish action:** Closes wizard, opens options page

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
- **General Settings:**
  - `darkMode`: Toggle dark theme across extension UI
  - `notifications`: Show toast alerts on stream detection
  - `autoValidate`: [Currently unused - validation always happens]
  - `saveToHistory`: [Currently always enabled]
  - `autoPreview`: Toggle automatic preview loading in popup
  - `previewQuality`: 'low' | 'medium' | 'high' (affects HLS.js buffer config and level selection)
- **Download Settings (NEW):**
  - `preferredMethod`: 'auto' | 'native' | 'ytdlp'
  - `defaultQuality`: 'ask' | 'best' | 'preset'
  - `presetQuality`: '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p'
  - `showNotifications`: Download completion notifications
  - `autoClearCompleted`: Auto-remove completed downloads after 5 minutes
  - `ytdlpPath`: Custom path to yt-dlp executable (optional)
  - `ytdlpArgs`: Additional command-line arguments for yt-dlp
- **yt-dlp Testing:**
  - `testYtDlp()`: Sends `isYtDlpAvailable` message to background
  - Displays success/error with troubleshooting tips
  - Opens setup wizard via `openSetupWizard()` if not installed

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

## Cross-Browser Support

The extension now supports **both Firefox and Chrome/Edge** through a universal build system:

### Firefox (Manifest V2)
- **Manifest:** `manifest.json` (V2 format)
- **Background:** Background page with script array
- **API:** Native `browser.*` namespace
- **webRequest:** Full support with `<all_urls>`
- **Build output:** `stream-sniper-firefox-v2.0.zip`

### Chrome/Edge (Manifest V3)
- **Manifest:** `manifest-v3.json` (V3 format, renamed to manifest.json in build)
- **Background:** Service worker (`background.js`)
- **API:** `browser.*` via webextension-polyfill.js
- **webRequest:** Replaced with `declarativeNetRequest` + `declarativeNetRequestFeedback`
- **importScripts:** Required for loading dependencies in service worker
- **Build output:** `stream-sniper-chrome-v2.0.zip`

### webextension-polyfill.js
- **Purpose:** Provides universal `browser.*` API across Firefox and Chrome
- **Source:** Mozilla's official polyfill (https://github.com/mozilla/webextension-polyfill)
- **Usage:** Loaded via `<script>` tag in HTML files, `importScripts()` in background
- **Size:** 38KB minified
- **Benefit:** Single codebase for both browsers, no `chrome.*` API calls needed

### Build System Differences
| Feature | Firefox MV2 | Chrome/Edge MV3 |
|---------|-------------|-----------------|
| Manifest | manifest.json | manifest-v3.json → manifest.json |
| Background | scripts array | service_worker |
| Native Messaging | allowed_extensions | allowed_origins |
| webRequest | Full support | Limited (declarativeNetRequest) |
| API Namespace | browser.* | browser.* (via polyfill) |

## Native Messaging (yt-dlp Integration)

### Overview
Browser extensions are sandboxed and cannot execute system commands. Native messaging provides a secure bridge between the extension and native applications.

### Components

**1. Extension Side (download-manager.js):**
```javascript
// Connect to native host
const port = browser.runtime.connectNative('com.streamsniper.ytdlp');

// Send download command
port.postMessage({
  type: 'download',
  url: 'https://example.com/stream.m3u8',
  output: '/path/to/output.mp4',
  format: 'best',
  args: ['--merge-output-format', 'mp4']
});

// Receive progress updates
port.onMessage.addListener((message) => {
  if (message.type === 'progress') {
    console.log(`${message.percent}% at ${message.speed}`);
  }
});
```

**2. Native Host (ytdlp-bridge.py):**
- Python 3.6+ script
- Reads JSON messages from stdin (4-byte length prefix + JSON)
- Writes JSON responses to stdout
- Spawns yt-dlp subprocess
- Parses yt-dlp stdout for progress (percentage, speed, ETA)
- Supports message types: `check`, `getFormats`, `download`

**3. Native Messaging Manifest:**
- **Firefox:** `com.streamsniper.ytdlp.firefox.json`
  - `allowed_extensions`: Array of extension IDs with curly braces
  - Registry key (Windows): `HKCU\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp`
  - File location (Linux/Mac): `~/.mozilla/native-messaging-hosts/`

- **Chrome/Edge:** `com.streamsniper.ytdlp.chrome.json`
  - `allowed_origins`: Array of extension origins with protocol
  - Registry key (Windows): `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.streamsniper.ytdlp`
  - File location (Linux/Mac): `~/.config/google-chrome/NativeMessagingHosts/`

### Installation Locations

**Windows:**
- Script: `%APPDATA%\StreamSniper\ytdlp-bridge.py`
- Manifest: `%ProgramFiles%\Mozilla Firefox\distribution\` (Firefox) or Registry (Chrome)

**macOS:**
- Script: `~/Library/Application Support/StreamSniper/ytdlp-bridge.py`
- Manifest: `~/Library/Application Support/Mozilla/NativeMessagingHosts/` (Firefox)

**Linux:**
- Script: `~/.local/share/StreamSniper/ytdlp-bridge.py`
- Manifest: `~/.mozilla/native-messaging-hosts/` (Firefox)

### Setup Wizard
The extension includes `setup-wizard.html` with step-by-step installation instructions:
1. Install yt-dlp (platform-specific package managers or manual download)
2. Install native messaging host (script + manifest)
3. Test connection (sends `isYtDlpAvailable` message)

See `NATIVE_MESSAGING_SETUP.md` for complete installation instructions.

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

### Stream Detection
- **ISM/ISMC detection:** Detected but not parsed (no parser implemented)
- **CORS restrictions:** Cannot parse manifests from many domains
- **YouTube obfuscation:** Some sites obfuscate stream URLs, may not match patterns
- **Authentication:** Cannot handle streams requiring authentication headers
- **DRM content:** No DRM support (HLS.js and dash.js limitations)
- **History cap:** Max 500 streams (oldest auto-removed)
- **Session count:** Resets on browser restart (by design)

### Downloads
- **Native downloads:** Best for simple HTTP streams, may fail for segmented formats (HLS/DASH)
- **yt-dlp required:** Complex formats (HLS, DASH with quality selection) require yt-dlp installation
- **Native messaging:** Requires manual setup (Python + ytdlp-bridge.py + manifest)
- **Download pause/resume:** Native downloads support pause/resume, yt-dlp downloads do not
- **Progress accuracy:** yt-dlp progress parsing may be approximate for some formats
- **Authentication:** yt-dlp can handle authentication, but requires manual header configuration
- **Live streams:** yt-dlp can record live streams, but progress tracking may be unreliable
- **Queue persistence:** Queue persists across restarts, but active downloads restart from beginning

### Cross-Browser
- **Manifest V3 limitations:** Chrome's `declarativeNetRequest` is less flexible than V2's `webRequest`
- **Service worker restrictions:** MV3 service workers have 5-minute lifetime, requiring careful state management
- **Firefox MV3:** Firefox will eventually require MV3, current build uses MV2
- **Extension ID:** Native messaging manifests must be updated with actual extension ID after installation
