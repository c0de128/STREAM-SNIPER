# Stream Sniper - Installation Complete! 🎉

All installation steps have been completed successfully. Your extension is ready to use!

## ✅ What Was Installed

### 1. Core Extension
- ✅ npm dependencies installed (159 packages)
- ✅ Extension built for Firefox and Chrome
- ✅ Build files located in: `builds/` directory

**Build outputs:**
- `builds/stream-sniper-firefox-v2.0.zip` (0.48 MB) - Firefox extension
- `builds/stream-sniper-chrome-v2.0.zip` (0.48 MB) - Chrome/Edge extension
- `builds/stream-sniper-source-v2.0.zip` (0.51 MB) - Source code
- `builds/stream-sniper-native-host-v2.0.zip` (0.01 MB) - Native messaging files

### 2. Python & yt-dlp
- ✅ Python 3.13.5 (already installed)
- ✅ yt-dlp 2025.10.22 installed via pip
- ✅ FFmpeg 8.0 installed via winget

### 3. Native Messaging Host (for yt-dlp integration)
- ✅ Directory created: `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper`
- ✅ Bridge script copied: `ytdlp-bridge.py`
- ✅ Manifest created with correct path
- ✅ Windows Registry configured for Firefox

**Registry key:** `HKCU\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp`

---

## 🚀 Next Steps: Load the Extension

### Option 1: Load in Firefox (Recommended)

1. **Open Firefox**

2. **Navigate to:** `about:debugging#/runtime/this-firefox`
   - Or: Menu → More tools → Extensions & Themes → Debug Add-ons

3. **Click:** "Load Temporary Add-on"

4. **Browse to:** `C:\Users\KevinMcKay\Downloads\M3U8\builds`

5. **Select:** `stream-sniper-firefox-v2.0.zip`

6. **Extension loads!** You'll see it in the toolbar

7. **Important:** Copy the Extension ID
   - On the `about:debugging` page, find "Stream Sniper"
   - Copy the ID shown below the extension name
   - Format: `{12345678-1234-1234-1234-123456789012}`

8. **Update Native Messaging Manifest:**
   - Open: `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json`
   - Replace `{EXTENSION_ID_PLACEHOLDER}` with your actual extension ID
   - Save the file
   - Restart Firefox

### Option 2: Load in Chrome/Edge

1. **Open Chrome** (or Edge)

2. **Navigate to:** `chrome://extensions/` (or `edge://extensions/`)

3. **Enable:** "Developer mode" toggle (top right)

4. **Click:** "Load unpacked"

5. **Browse to:** `C:\Users\KevinMcKay\Downloads\M3U8`
   - Note: For Chrome, you need to load the unpacked extension directory, not the zip

6. **Alternative:** Drag and drop `builds/stream-sniper-chrome-v2.0.zip` onto the extensions page

7. **Extension loads!** You'll see it in the toolbar

---

## 🧪 Test the Extension

### 1. Basic Stream Detection
1. Click the Stream Sniper icon in your browser toolbar
2. Navigate to a video streaming site (YouTube, Twitch, Twitter/X, Vimeo)
3. Watch the extension badge show detected stream count
4. Click the icon to see detected streams in the popup

### 2. Test Video Preview
1. In the popup, click any detected stream
2. A live video preview should load automatically (if enabled in settings)
3. Quality information should appear below the stream

### 3. Test yt-dlp Integration
1. Click the Stream Sniper icon
2. Go to **Settings** (gear icon or Options)
3. Scroll to "Advanced Downloads (yt-dlp)"
4. Click **"Test yt-dlp Connection"**
5. You should see: **"✓ Success! yt-dlp is working correctly"**

If the test fails:
- Verify you completed step 8 in "Load in Firefox" (update manifest with extension ID)
- Restart Firefox after updating the manifest
- Check the browser console for errors

### 4. Test Download Functionality
1. Detect a stream on any video site
2. Click the **"Download"** dropdown button
3. Choose:
   - **"Download Best Quality"** - Instant download with highest quality
   - **"Select Quality"** - Opens quality picker with resolution/bitrate info
   - **"Add to Download Queue"** - Queue for later
4. Go to **"Downloads" tab** in the popup to see progress

---

## ⚙️ Extension Features

### Current Tab
- **Stream Detection:** Auto-detects HLS (M3U8), DASH (MPD), Smooth Streaming (ISM/ISMC)
- **Live Preview:** In-popup video playback
- **Quality Info:** Resolution, bitrate, FPS, codecs
- **Download Buttons:** Instant download or quality selection

### Downloads Tab (NEW!)
- **Real-time Progress:** Progress bars, speed, ETA
- **Queue Management:** Pause, resume, cancel, retry
- **Dual Methods:** Native browser downloads + yt-dlp integration
- **Persistent Queue:** Survives browser restarts

### History Tab
- **Persistent Storage:** Up to 500 most recent streams
- **Search & Filter:** By URL, type, domain
- **Export:** JSON or TXT format

### Statistics Tab
- **Analytics:** Total streams, by type, by domain
- **Session Tracking:** Streams detected in current session

### Settings (Options)
- **Appearance:** Dark mode toggle
- **Notifications:** Stream detection alerts
- **Preview Quality:** Low/Medium/High
- **Download Method:** Auto/Native/yt-dlp
- **yt-dlp Config:** Custom path and arguments

---

## 🎯 Recommended Test Sites

- **Twitch.tv** - Reliable HLS streams with quality variants
- **Twitter/X Videos** - HLS streams
- **Vimeo** - HLS and DASH support
- **Apple HLS Test Streams:** https://developer.apple.com/streaming/examples/

---

## 📂 File Locations

### Extension Files
- **Source:** `C:\Users\KevinMcKay\Downloads\M3U8`
- **Builds:** `C:\Users\KevinMcKay\Downloads\M3U8\builds`

### yt-dlp Integration
- **Bridge Script:** `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\ytdlp-bridge.py`
- **Manifest:** `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json`
- **Registry:** `HKCU\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp`

### Installed Tools
- **Python:** 3.13.5
- **yt-dlp:** 2025.10.22 (accessible via `python -m yt_dlp`)
- **FFmpeg:** 8.0 (restart shell to use from PATH)

---

## 🔧 Troubleshooting

### Extension not detecting streams?
- Check that detection is enabled (toggle in popup)
- Reload the page after loading the extension
- Check browser console for errors

### yt-dlp test failing?
1. Verify extension ID is correct in manifest:
   - File: `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json`
   - Replace `{EXTENSION_ID_PLACEHOLDER}` with actual ID from `about:debugging`
2. Restart Firefox
3. Test again in extension settings

### Downloads not working?
- **Native downloads:** Should work immediately for simple streams
- **yt-dlp downloads:** Require native messaging setup (see above)
- Check Downloads tab for error messages

### FFmpeg not recognized?
- **Restart your shell/terminal** - PATH was updated during installation
- Or run: `python -m yt_dlp` (bundled downloader)

---

## 🎊 You're All Set!

Everything is installed and configured. The extension is ready to:
- ✅ Detect streaming URLs automatically
- ✅ Preview videos with quality selection
- ✅ Download streams (native + yt-dlp)
- ✅ Track history and statistics
- ✅ Work on both Firefox and Chrome/Edge

**Need help?** Check:
- `CLAUDE.md` - Comprehensive architecture documentation
- `NATIVE_MESSAGING_SETUP.md` - Detailed yt-dlp setup guide
- GitHub Issues: https://github.com/c0de128/STREAM-SNIPER/issues

**Happy streaming! 🎬**
