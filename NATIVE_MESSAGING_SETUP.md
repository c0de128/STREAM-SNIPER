# Native Messaging Setup Guide

This guide explains how to install the yt-dlp native messaging host for Stream Sniper.

## What is Native Messaging?

Browser extensions run in a sandboxed environment and cannot directly execute system commands. Native messaging allows the extension to communicate with a native application (in this case, yt-dlp) through a secure bridge.

## Prerequisites

1. **Python 3.6 or newer** - Check with: `python --version` or `python3 --version`
2. **yt-dlp installed** - Check with: `yt-dlp --version`
3. **Stream Sniper extension installed** in your browser

## Installation Steps

### Step 1: Install the Bridge Script

#### Windows
```powershell
# Create directory
mkdir "%APPDATA%\StreamSniper"

# Copy ytdlp-bridge.py to this directory
copy ytdlp-bridge.py "%APPDATA%\StreamSniper\"
```

#### macOS
```bash
# Create directory
mkdir -p ~/Library/Application\ Support/StreamSniper

# Copy and make executable
cp ytdlp-bridge.py ~/Library/Application\ Support/StreamSniper/
chmod +x ~/Library/Application\ Support/StreamSniper/ytdlp-bridge.py
```

#### Linux
```bash
# Create directory
mkdir -p ~/.local/share/StreamSniper

# Copy and make executable
cp ytdlp-bridge.py ~/.local/share/StreamSniper/
chmod +x ~/.local/share/StreamSniper/ytdlp-bridge.py
```

### Step 2: Install the Native Messaging Manifest

#### Firefox

**Windows:**
1. Edit `com.streamsniper.ytdlp.firefox.json`:
   - Replace `/path/to/ytdlp-bridge.py` with: `C:\Users\YOUR_USERNAME\AppData\Roaming\StreamSniper\ytdlp-bridge.py`
   - Replace `{EXTENSION_ID}` with your extension ID (found in `about:debugging`)

2. Copy manifest to Firefox directory:
```powershell
# Create directory if it doesn't exist
mkdir "%ProgramFiles%\Mozilla Firefox\distribution" -Force

# Copy manifest
copy com.streamsniper.ytdlp.firefox.json "%ProgramFiles%\Mozilla Firefox\distribution\com.streamsniper.ytdlp.json"
```

3. Register in Windows Registry:
```powershell
reg add "HKCU\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp" /ve /t REG_SZ /d "%ProgramFiles%\Mozilla Firefox\distribution\com.streamsniper.ytdlp.json" /f
```

**macOS:**
1. Edit `com.streamsniper.ytdlp.firefox.json`:
   - Replace `/path/to/ytdlp-bridge.py` with: `/Users/YOUR_USERNAME/Library/Application Support/StreamSniper/ytdlp-bridge.py`
   - Replace `{EXTENSION_ID}` with your extension ID

2. Copy manifest:
```bash
mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts
cp com.streamsniper.ytdlp.firefox.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/com.streamsniper.ytdlp.json
```

**Linux:**
1. Edit `com.streamsniper.ytdlp.firefox.json`:
   - Replace `/path/to/ytdlp-bridge.py` with: `/home/YOUR_USERNAME/.local/share/StreamSniper/ytdlp-bridge.py`
   - Replace `{EXTENSION_ID}` with your extension ID

2. Copy manifest:
```bash
mkdir -p ~/.mozilla/native-messaging-hosts
cp com.streamsniper.ytdlp.firefox.json ~/.mozilla/native-messaging-hosts/com.streamsniper.ytdlp.json
```

#### Chrome / Edge

**Windows:**
1. Edit `com.streamsniper.ytdlp.chrome.json`:
   - Replace `/path/to/ytdlp-bridge.py` with full path
   - Replace `EXTENSION_ID` with your extension ID (found in `chrome://extensions`)

2. Register in Windows Registry:

For Chrome:
```powershell
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.streamsniper.ytdlp" /ve /t REG_SZ /d "C:\path\to\com.streamsniper.ytdlp.json" /f
```

For Edge:
```powershell
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.streamsniper.ytdlp" /ve /t REG_SZ /d "C:\path\to\com.streamsniper.ytdlp.json" /f
```

**macOS:**
1. Edit `com.streamsniper.ytdlp.chrome.json` with correct paths and extension ID

2. Copy manifest:

For Chrome:
```bash
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts
cp com.streamsniper.ytdlp.chrome.json ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.streamsniper.ytdlp.json
```

For Edge:
```bash
mkdir -p ~/Library/Application\ Support/Microsoft\ Edge/NativeMessagingHosts
cp com.streamsniper.ytdlp.chrome.json ~/Library/Application\ Support/Microsoft\ Edge/NativeMessagingHosts/com.streamsniper.ytdlp.json
```

**Linux:**
1. Edit `com.streamsniper.ytdlp.chrome.json` with correct paths and extension ID

2. Copy manifest:

For Chrome:
```bash
mkdir -p ~/.config/google-chrome/NativeMessagingHosts
cp com.streamsniper.ytdlp.chrome.json ~/.config/google-chrome/NativeMessagingHosts/com.streamsniper.ytdlp.json
```

For Chromium:
```bash
mkdir -p ~/.config/chromium/NativeMessagingHosts
cp com.streamsniper.ytdlp.chrome.json ~/.config/chromium/NativeMessagingHosts/com.streamsniper.ytdlp.json
```

### Step 3: Test the Connection

1. Open Stream Sniper extension
2. Go to Settings/Options
3. Scroll to "Advanced Downloads (yt-dlp)" section
4. Click "Test yt-dlp Connection"
5. You should see a success message if everything is configured correctly

## Troubleshooting

### "yt-dlp not found"
- Verify yt-dlp is installed: `yt-dlp --version`
- Ensure yt-dlp is in your system PATH
- Restart your browser after installation

### "Native messaging host not found"
- Verify the manifest file is in the correct location
- Check that the path in the manifest points to the correct location of `ytdlp-bridge.py`
- On macOS/Linux, ensure `ytdlp-bridge.py` is executable: `chmod +x ytdlp-bridge.py`
- Verify Python is installed and accessible: `python3 --version`

### "Permission denied"
- On macOS/Linux, make sure the script is executable
- Check file permissions on `ytdlp-bridge.py`
- Ensure the script has the correct shebang: `#!/usr/bin/env python3`

### Extension ID Not Working
**Firefox:**
- Go to `about:debugging`
- Click "This Firefox"
- Find "Stream Sniper" - the ID is shown under the extension name
- Use format: `{12345678-1234-1234-1234-123456789012}` (with braces)

**Chrome/Edge:**
- Go to `chrome://extensions` or `edge://extensions`
- Enable "Developer mode"
- Find "Stream Sniper" - the ID is shown under the extension name
- Use format: `abcdefghijklmnopqrstuvwxyz123456` (without braces)

### Still Having Issues?
- Check the browser console for error messages
- Verify all paths in the manifest are absolute (not relative)
- Restart your browser after making changes
- Try specifying the full path to yt-dlp in extension settings

## Security Notes

- The native messaging host only accepts messages from the Stream Sniper extension
- Communication is done through stdin/stdout using a secure protocol
- The bridge script only executes yt-dlp commands, nothing else
- No network requests are made by the bridge itself

## Uninstallation

To remove the native messaging host:

1. Delete the bridge script from its installation directory
2. Delete the manifest file from the browser's native messaging directory
3. On Windows, remove the registry entry using `regedit` or:
   ```powershell
   reg delete "HKCU\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp" /f
   ```
