# Stream Sniper - Quick Start Guide

## 🚀 Load Extension in Firefox (5 steps)

1. Open Firefox → Navigate to: `about:debugging#/runtime/this-firefox`
2. Click: **"Load Temporary Add-on"**
3. Select: `C:\Users\KevinMcKay\Downloads\M3U8\builds\stream-sniper-firefox-v2.0.zip`
4. **Copy Extension ID** from the debugging page
5. **Update manifest** at: `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json`
   - Replace `{EXTENSION_ID_PLACEHOLDER}` with your ID
   - Restart Firefox

## 🎬 Test It!

1. Visit **YouTube**, **Twitch**, or **Twitter/X**
2. Watch extension badge show stream count
3. Click icon → See detected streams
4. Try **Download** button → Select quality
5. Check **Downloads tab** for progress

## ⚙️ Test yt-dlp Integration

1. Click extension icon → **Settings**
2. Scroll to "Advanced Downloads"
3. Click **"Test yt-dlp Connection"**
4. Should see: ✅ **"Success! yt-dlp is working correctly"**

## 📍 Important Locations

**Extension builds:** `C:\Users\KevinMcKay\Downloads\M3U8\builds`

**yt-dlp files:** `C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\`

## 🆘 Quick Troubleshooting

**yt-dlp test fails?**
- Did you update the manifest with extension ID? (Step 5 above)
- Did you restart Firefox after updating?

**Extension not detecting?**
- Reload the page after loading extension
- Check detection is enabled (toggle in popup)

## 📖 Full Documentation

See `INSTALLATION_COMPLETE.md` for detailed instructions
