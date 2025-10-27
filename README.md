# Adaptive Stream Detector

A powerful Firefox extension that detects adaptive streaming URLs on web pages and provides comprehensive tools for managing, analyzing, and exporting them.

## Supported Formats

- **M3U8** - HLS (HTTP Live Streaming)
- **M3U** - M3U playlists
- **MPD** - MPEG-DASH manifests
- **ISM/ISMC** - Microsoft Smooth Streaming

## Features

### Core Functionality
- **Automatic Detection** - Monitors network requests and automatically detects streaming URLs
- **Badge Counter** - Shows the number of detected streams on the extension icon
- **Persistent History** - Saves all detected streams across browser sessions (up to 500 streams)
- **Real-time Notifications** - Optional toast notifications when new streams are detected

### Tabbed Interface
- **Current Tab** - Shows streams detected on the current page with advanced filtering
- **History Tab** - Browse all previously detected streams with search functionality
- **Statistics Tab** - View analytics on detected streams by format and domain

### Stream Management

#### Stream Type Badges
Each stream is color-coded by type:
- **M3U8** (Green) - HLS streams
- **M3U** (Light Blue) - M3U playlists
- **MPD** (Orange) - MPEG-DASH streams
- **ISM/ISMC** (Red) - Smooth Streaming

#### Quality Detection
- Automatically fetches and parses manifest files
- Displays available quality variants (resolution, bitrate, framerate)
- Shows codec information
- Click "Details" button to view quality breakdown

#### Stream Validation
- Test if streams are accessible with the "Test" button
- Shows HTTP status codes
- Visual indicators for active/inactive streams

### Player Integration
Copy streams in various formats ready for your favorite tools:
- **Plain URL** - Direct copy of stream URL
- **VLC** - `vlc "url"` command
- **mpv** - `mpv "url"` command
- **ffmpeg** - `ffmpeg -i "url" -c copy output.mp4`
- **youtube-dl** - `youtube-dl "url"`
- **yt-dlp** - `yt-dlp "url"`

Simply click the dropdown arrow on the Copy button and select your preferred format.

### Search & Filter
- **Search** - Filter streams by URL, domain, or page title
- **Type Filter** - Show only specific stream formats (HLS, DASH, etc.)
- **Real-time Filtering** - Results update as you type

### Export & Batch Operations
- **Copy All URLs** - Copy all detected streams at once (one per line)
- **Export to JSON** - Export complete history with metadata (timestamps, domains, page URLs)
- **Export to TXT** - Human-readable text format
- **Clear Functions** - Clear current session or entire history

### Statistics Dashboard
Track your stream detection activity:
- **Total Streams** - All-time detection count
- **Current Session** - Streams detected since browser started
- **By Format** - Breakdown of streams by type (M3U8, MPD, etc.)
- **Top Domains** - Most frequent domains with stream count

## Installation

### Temporary Installation (for testing)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the extension folder and select the `manifest.json` file
5. The extension is now installed and will appear in your toolbar

### Permanent Installation

To install permanently:
1. Create a Firefox account at https://addons.mozilla.org
2. Package the extension as a .zip file
3. Submit it to Mozilla for review and signing
4. Once signed, install the .xpi file

### Creating Extension Package

```bash
cd M3U8
zip -r adaptive-stream-detector.zip manifest.json background.js popup.html popup.js popup.css storage-manager.js manifest-parser.js options.html options.js icon.png
```

## Usage

### Basic Workflow

1. Navigate to any webpage that loads streaming content
2. The extension badge will show the count of detected streams
3. Click the extension icon to open the popup
4. Browse detected streams in the Current tab
5. Click "Copy ▾" to copy URL or generate player commands
6. Click "Test" to validate if stream is active
7. Click "Details" to view quality information
8. Use "Copy All" or "Export" for batch operations

### Search & Filter

- Use the search box to filter by URL or domain
- Select format from dropdown to show only specific types
- Search works across Current and History tabs

### Viewing History

1. Click the "History" tab
2. Browse all previously detected streams
3. Use search to find specific streams
4. Click "Clear History" to reset

### Statistics

1. Click the "Statistics" tab
2. View total streams and session count
3. See breakdown by format and top domains
4. Click "Reset Statistics" to start fresh

### Settings

1. Click the extension icon
2. Right-click and select "Manage Extension" or go to `about:addons`
3. Click on "Adaptive Stream Detector"
4. Click "Preferences" tab

Available settings:
- **Enable notifications** - Show toast when streams detected
- **Auto-validate streams** - Automatically test stream accessibility
- **Save to history** - Enable/disable persistent storage

## File Structure

```
M3U8/
├── manifest.json          # Extension configuration
├── background.js          # Background script for monitoring requests
├── popup.html            # Popup interface HTML
├── popup.js              # Popup functionality and UI logic
├── popup.css             # Popup styling
├── storage-manager.js    # Persistent storage management
├── manifest-parser.js    # M3U8/MPD manifest parsing
├── options.html          # Settings page HTML
├── options.js            # Settings page logic
├── icon.png             # Extension icon (48x48)
└── README.md            # This file
```

## Icon Note

You'll need to add an `icon.png` file (48x48 pixels) to the extension folder. You can create a simple icon or use any 48x48 PNG image as a placeholder.

## Technical Details

### Architecture

The extension uses a three-tier architecture:
1. **Background Script** - Monitors network requests via webRequest API
2. **Storage Layer** - Manages persistent data using browser.storage.local
3. **UI Layer** - Tabbed popup interface for user interaction

### Manifest Parsing

The extension can parse streaming manifests to extract quality information:

- **M3U8 (HLS)** - Parses #EXT-X-STREAM-INF tags to extract bandwidth, resolution, framerate, and codecs
- **MPD (DASH)** - Parses XML Representation elements for quality variants
- **Automatic** - Fetches manifests automatically when "Details" is clicked

### Storage

Data is stored using `browser.storage.local` with the following structure:

- **streamHistory** - Array of detected streams (max 500)
- **streamStats** - Statistics object with total, byType, byDomain
- **sessionCount** - Counter for current browser session
- **settings** - User preferences

### Permissions

- `webRequest` - Monitor network requests for streaming manifests
- `<all_urls>` - Access to detect streams on any website
- `storage` - Store history and statistics persistently
- `notifications` - Show toast notifications
- `tabs` - Access tab information for page URLs

## Browser Compatibility

This extension is designed for Firefox and uses the `browser` API namespace. For Chrome/Edge compatibility, you would need to:
1. Use manifest v3 format
2. Replace `browser` API calls with `chrome` API
3. Adjust webRequest implementation for manifest v3

## Privacy

- All data is stored locally in your browser
- No data is transmitted to external servers
- History is limited to 500 most recent streams
- You can clear history and statistics at any time from the extension

## Troubleshooting

### Streams Not Detected
- Ensure the page has fully loaded
- Check if the site uses supported formats (M3U8, MPD, ISM)
- Try refreshing the page
- Check browser console for errors

### Quality Information Not Showing
- Ensure manifest URL is accessible
- Check for CORS restrictions on manifest files
- Some simple playlists don't have quality variants

### Notifications Not Showing
- Check Firefox notification settings
- Enable notifications in extension settings
- Ensure Firefox has permission to show notifications

## Contributing

Contributions are welcome! Areas for improvement:
- Support for additional streaming formats
- Enhanced quality detection algorithms
- Additional export formats
- UI/UX improvements
- Performance optimizations

## License

Free to use and modify for personal purposes.

## Changelog

### Version 1.0
- Initial release with full feature set
- Support for M3U8, M3U, MPD, ISM/ISMC formats
- Tabbed interface with Current, History, and Statistics
- Stream type badges and quality detection
- Player command generation
- Search and filtering
- Export functionality
- Persistent storage
- Notifications
- Stream validation
