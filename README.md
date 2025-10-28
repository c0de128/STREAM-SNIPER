# Stream Sniper

**A powerful Firefox browser extension for detecting, analyzing, and managing streaming media URLs.**

Stream Sniper automatically detects adaptive streaming protocols (HLS M3U8, MPEG-DASH MPD, Microsoft Smooth Streaming) on any webpage, providing advanced features for recording, downloading, quality analysis, and batch management.

---

## Features

### Core Capabilities
- **Automatic Stream Detection** - Monitors all network requests and detects streaming URLs in real-time
- **Multi-Protocol Support** - HLS (M3U8/M3U), MPEG-DASH (MPD), Microsoft Smooth Streaming (ISM/ISMC)
- **Real-time Badge Counter** - Shows number of detected streams on current page
- **Stream History** - Automatically saves up to 500 most recent streams with page context
- **Favorites System** - Bookmark streams for quick access later

### Advanced Features (Phase 2)

#### Live Stream Recorder
- Record live streams with HLS segment capture
- Pause/resume recording capability
- Automatic file splitting for long recordings
- Real-time duration and size tracking
- Export recordings in standard formats

#### Batch Download Manager
- Select multiple streams for batch download
- Priority queue management (Normal/Low/High/Urgent)
- Concurrent download control
- Progress tracking with bandwidth monitoring
- Pause/resume/retry failed downloads
- Download history with completion status

#### Metadata Extraction
- Automatic title and description extraction
- Thumbnail display in stream list
- Category detection (Movies, TV Shows, Sports, etc.)
- Duration estimation
- Enhanced stream information

#### Advanced Analytics Dashboard
- Real-time statistics and metrics
- Download/recording performance tracking
- Category breakdown with visual charts
- Quality distribution analysis
- Time-based activity trends
- Domain-level analytics

#### Smart Quality Selector
- Analyzes all available quality variants
- Recommends optimal quality based on connection speed
- Displays bandwidth, resolution, codecs, compatibility
- Estimated file size for each quality
- Warning system for quality issues
- One-click quality selection for downloads

### User Interface Features (Phase 3)
- **7-Tab Interface**: Current, Downloads, Recordings, Favorites, History, Statistics, About
- **Dark Mode Support** - Toggle between light and dark themes
- **Search & Filter** - Real-time search across all streams, filter by type
- **Batch Selection** - Checkboxes for multi-stream operations
- **Metadata Display** - Rich thumbnails, titles, categories in stream list
- **Visual Analytics** - Bar charts, timelines, progress indicators
- **Quality Modal** - Interactive quality selector with recommendations

---

## Installation

### From Source (Temporary Development Install)

1. **Download/Clone Repository**
   ```bash
   git clone https://github.com/yourusername/stream-sniper.git
   cd stream-sniper
   ```

2. **Load in Firefox**
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox" in the sidebar
   - Click "Load Temporary Add-on"
   - Navigate to the extension directory and select `manifest.json`

3. **Extension Loads**
   - Extension persists until Firefox restart
   - Icon appears in toolbar
   - Badge shows stream count when streams detected

### From Firefox Add-ons Store
*Coming soon - Extension will be submitted to AMO (addons.mozilla.org)*

---

## Usage

### Basic Usage

1. **Navigate to a streaming website** (YouTube, Twitch, Netflix, etc.)
2. **Click the Stream Sniper icon** in the toolbar
3. **View detected streams** in the Current tab
4. **Click action buttons** to interact with streams:
   - **Test** - Verify stream accessibility
   - **Details** - Parse manifest and view quality variants
   - **Copy** - Copy URL to clipboard
   - **Download** - Download stream with external tool
   - **Record** - Start live recording
   - **Quality** - Select specific quality for download
   - **Favorite** - Save to favorites list

### Advanced Features

#### Recording a Live Stream
1. Detect stream on Current tab
2. Click **⏺ Record** button
3. Switch to **Recordings** tab to monitor progress
4. Use **Pause/Resume** buttons during recording
5. Click **Stop** when finished
6. Recording saved with metadata

#### Batch Downloads
1. Enable batch selection mode (appears when streams detected)
2. Check multiple streams in the list
3. Select priority level from dropdown (Normal/Low/High/Urgent)
4. Click **Start Batch Download**
5. Switch to **Downloads** tab to monitor progress
6. Downloads process in priority order with concurrency control

#### Quality Selection
1. Find M3U8 or MPD stream
2. Click **🎞️ Quality** button
3. View connection speed and recommendations
4. Review warnings (if any)
5. Click desired quality card to start download
6. Download begins with selected quality variant

#### Analytics Dashboard
1. Switch to **Statistics** tab
2. View overview cards (Total Streams, Downloads, Recordings, Data Transferred)
3. Explore download/recording metrics
4. Check category breakdown with visual bars
5. Review quality distribution chart
6. Browse activity timeline
7. Click **Refresh Analytics** to update data

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+S` | Open Stream Sniper popup |
| `Alt+Shift+D` | Toggle stream detection on/off |
| `Alt+C` | Copy selected stream URL to clipboard |
| `Alt+D` | Download selected stream |
| `Alt+V` | Validate selected stream |
| `Esc` | Close quality selector modal |

*Keyboard shortcuts can be customized in Firefox settings: `about:addons` → Stream Sniper → Options*

---

## Architecture

### Three-Tier Design

**Background Script** (`background.js`)
- Monitors all network requests via WebRequest API
- Detects streaming URLs using pattern matching
- Manages session storage per tab
- Coordinates message passing between components
- Handles all backend processing

**Backend Modules** (Phase 2)
- `stream-recorder.js` - Live recording with segment capture
- `download-manager.js` - Multi-stream download queue
- `batch-controller.js` - Batch operation coordinator
- `metadata-extractor.js` - Content metadata extraction
- `analytics-engine.js` - Statistics and insights
- `quality-analyzer.js` - Stream quality analysis

**UI Layer** (Popup)
- `popup.html` - 7-tab interface structure
- `popup.css` - Theming, animations, responsive design
- `popup.js` - UI logic, event handling, backend integration

**Storage Layer**
- `storage-manager.js` - Persistent data management
- Browser Storage API for history, favorites, settings
- IndexedDB for large datasets (analytics, recordings)

---

## Supported Streaming Protocols

### HLS (HTTP Live Streaming)
- `.m3u8` and `.m3u` files
- Master playlists with quality variants
- Simple playlists (single quality)
- `#EXT-X-STREAM-INF` tag parsing
- Bandwidth, resolution, framerate, codecs extraction

### MPEG-DASH (Dynamic Adaptive Streaming)
- `.mpd` files (Media Presentation Description)
- XML-based manifest parsing
- `<Representation>` quality variants
- Bandwidth and resolution detection

### Microsoft Smooth Streaming
- `.ism` and `.ismc` manifest files
- Detection supported (parsing not yet implemented)

---

## Technical Details

### Browser Compatibility
- **Firefox**: Fully supported (Manifest V2)
- **Chrome/Edge**: Not yet supported (requires Manifest V3 port)

### Permissions Required
- `webRequest` - Monitor network traffic for stream detection
- `<all_urls>` - Access all URLs for detection
- `storage` - Save history, favorites, settings
- `notifications` - Display status notifications
- `tabs` - Access page titles and URLs
- `downloads` - Manage stream downloads
- `nativeMessaging` - Communicate with external tools (yt-dlp, ffmpeg)

### Storage Limits
- **History**: 500 most recent streams (auto-cleanup)
- **Favorites**: Unlimited
- **Statistics**: Persistent (manual reset)
- **Session Count**: Resets on browser restart

### External Tool Integration
Stream Sniper generates command-line commands for external tools:
- **VLC** - Direct playback
- **mpv** - Media player with advanced features
- **ffmpeg** - Stream processing and conversion
- **youtube-dl** / **yt-dlp** - Stream downloading

---

## Privacy & Security

- **No Data Collection** - All processing happens locally
- **No External Servers** - Extension does not send data anywhere
- **No Tracking** - No analytics or telemetry
- **Open Source** - Full source code available for audit
- **Permissions Explained** - All permissions used only for stated functionality

---

## Contributing

We welcome contributions! Please see [DEVELOPER.md](DEVELOPER.md) for:
- Development setup
- Code architecture
- Coding standards
- Pull request process
- Testing guidelines

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and feature releases.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- **Issues**: Report bugs at [GitHub Issues](https://github.com/yourusername/stream-sniper/issues)
- **Documentation**: See [USER_GUIDE.md](USER_GUIDE.md) for detailed instructions
- **Developer Docs**: See [DEVELOPER.md](DEVELOPER.md) for technical details

---

## Roadmap

### Completed
- ✅ Phase 1: Core Detection & Basic UI
- ✅ Phase 2: Advanced Backend Features
- ✅ Phase 3: UI & Polish
- ✅ Phase 5: Documentation

### Planned
- ⏳ Phase 4: Testing & Refinement
- 📋 Phase 6: Packaging & Deployment
- 📋 Phase 7: Advanced Features (playlist export, cloud sync, scheduled recordings)

---

## Acknowledgments

Built with:
- Firefox WebExtensions API
- Native Messaging Protocol
- HLS.js parsing concepts
- MPEG-DASH XML standards

**Developed with assistance from Claude Code**

---

**Stream Sniper** - Detect. Analyze. Capture.
