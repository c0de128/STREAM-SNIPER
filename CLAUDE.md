# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Firefox browser extension that detects and manages adaptive streaming URLs (HLS M3U8, MPEG-DASH MPD, Microsoft Smooth Streaming ISM/ISMC) on web pages. Provides stream analysis, validation, quality detection, and export functionality.

## Extension Architecture

The extension uses a **three-tier architecture**:

1. **Background Script** (`background.js`)
   - Monitors all network requests via `webRequest` API
   - Detects streaming URLs matching patterns (`.m3u8`, `.mpd`, `.ism`, `.ismc`)
   - Maintains session storage (`detectedStreams` object keyed by tabId)
   - Updates browser badge counter when streams are detected
   - Handles message passing between popup and background context
   - Manages stream validation via HEAD requests

2. **Storage Layer** (`storage-manager.js`)
   - Manages persistent data using `browser.storage.local`
   - Stores up to 500 most recent streams in history
   - Tracks statistics (total count, by type, by domain)
   - Session count tracking (resets on browser restart)
   - Export functionality (JSON and TXT formats)

3. **UI Layer** (`popup.js`, `popup.html`, `popup.css`)
   - Tabbed interface: Current, History, Statistics
   - Real-time search and filtering
   - Stream validation and manifest parsing
   - Player command generation (VLC, mpv, ffmpeg, youtube-dl, yt-dlp)

## Key Components

### Stream Detection (background.js)
- Listens on `webRequest.onBeforeRequest` for all URLs
- Matches against `STREAM_FORMATS` array using regex patterns
- Creates stream data objects with: `url`, `type`, `typeName`, `domain`, `pageUrl`, `pageTitle`, `timestamp`
- Deduplicates within tab session and persistent history
- Cleans up on tab close/navigation

### Manifest Parsing (manifest-parser.js)
- **M3U8/M3U**: Parses `#EXT-X-STREAM-INF` tags to extract bandwidth, resolution, framerate, codecs
- **MPD**: Parses XML `<Representation>` elements for quality variants
- Distinguishes between master playlists (with variants) and simple playlists
- All parsing done client-side via `fetch()` - subject to CORS restrictions

### Message Protocol (background.js)
Background script handles these message actions:
- `getStreams` - Returns streams for current tab
- `clearStreams` - Clears session storage for specific tab
- `clearHistory` - Wipes persistent history
- `resetStats` - Resets all statistics and session count
- `validateStream` - Tests stream accessibility via HEAD request

## Development Commands

### Package Extension
```bash
cd M3U8
zip -r adaptive-stream-detector.zip manifest.json background.js popup.html popup.js popup.css storage-manager.js manifest-parser.js options.html options.js icon.png
```

### Load for Testing (Firefox)
1. Navigate to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select `manifest.json` from the extension directory
4. Extension persists until Firefox restart

## Important Implementation Details

### State Management
- **Session state**: `detectedStreams` object in background.js (in-memory, keyed by tabId)
- **Persistent state**: Three storage keys in `browser.storage.local`:
  - `streamHistory` - Array of stream objects (max 500)
  - `streamStats` - Object with `total`, `byType`, `byDomain`
  - `sessionCount` - Integer counter (resets on `runtime.onStartup`)

### Data Flow for New Stream
1. `webRequest.onBeforeRequest` fires in background.js
2. URL pattern matched → stream data created
3. Added to session storage → badge updated immediately
4. `browser.tabs.get()` called asynchronously to fetch page info
5. Stream saved to persistent storage via `StorageManager.saveStream()`
6. Statistics updated, session count incremented
7. Optional notification shown (if enabled in settings)

### Duplicate Prevention
- Session-level: Check `detectedStreams[tabId]` array by URL
- Persistent-level: Check history array for matching URL + pageUrl combination

### Storage Limits
- History capped at 500 entries (oldest removed via `history.length = 500`)
- No automatic cleanup of statistics (manual reset only)
- Session count resets on browser startup via `runtime.onStartup`

## Browser API Usage

This extension is **Firefox-specific** and uses Manifest V2:
- Uses `browser.*` namespace (not `chrome.*`)
- `webRequest` with `<all_urls>` permission for stream detection
- `storage` for persistent data
- `notifications` for optional toast alerts
- `tabs` for page URL/title extraction

### Chrome/Edge Compatibility Notes
To port to Chrome, would require:
- Migrate to Manifest V3
- Replace `browser.*` with `chrome.*` API calls
- Reimplement `webRequest` using declarativeNetRequest (V3 limitation)
- Adjust permissions model for V3

## Testing Workflows

### Test Stream Detection
1. Load extension in Firefox (`about:debugging`)
2. Navigate to site with video streaming (YouTube, Twitch, etc.)
3. Click extension icon - streams should appear in Current tab
4. Badge should show count of detected streams

### Test Quality Parsing
1. Detect a stream with type M3U8 or MPD
2. Click "Details" button
3. Manifest should be fetched and parsed
4. Quality variants displayed with resolution/bitrate/framerate

### Test Validation
1. Click "Test" button on any stream
2. Background script sends HEAD request
3. Status indicator shows HTTP status or error

### Test Persistence
1. Detect streams on a page
2. Navigate away or close tab
3. Open extension → History tab
4. Streams should be saved with page title and timestamp

## File Dependencies

- `popup.html` loads: `popup.css`, `storage-manager.js`, `manifest-parser.js`, `popup.js` (in order)
- `background.js` includes inline minimal version of StorageManager
- `options.html` loads: `options.js`
- All files depend on global `browser` API (Firefox WebExtensions)

## Known Limitations

- CORS restrictions prevent parsing manifests from some domains
- Simple M3U8 playlists without `#EXT-X-STREAM-INF` show "no quality variants"
- ISM/ISMC formats detected but not parsed (no parser implemented)
- Stream validation may fail on URLs requiring authentication/headers
- Maximum 500 streams in history (older automatically removed)
