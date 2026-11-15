# Stream Sniper - One-command native messaging host installer (Windows)
#
# Installs ytdlp-bridge.py to %APPDATA%\StreamSniper, writes the native messaging
# manifests for Firefox and Chromium browsers, and registers them in the registry.
#
# Usage (from the folder containing ytdlp-bridge.py):
#   powershell -ExecutionPolicy Bypass -File .\install-native-host.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-native-host.ps1 -ChromeExtensionId abcdefghijklmnopabcdefghijklmnop
#
# Firefox needs no ID: the extension ships with a fixed ID. Chrome/Edge/Brave assign an
# ID when the extension is loaded; pass it with -ChromeExtensionId (found on chrome://extensions).

param(
    [string]$ChromeExtensionId = "",
    [string]$FirefoxExtensionId = "stream-sniper@c0de128.github.io",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$HostName = "com.streamsniper.ytdlp"
$InstallDir = Join-Path $env:APPDATA "StreamSniper"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!!] $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  [XX] $text" -ForegroundColor Red }

$RegistryTargets = @(
    @{ Name = "Firefox";  Key = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName";                 Manifest = "$HostName.firefox.json" },
    @{ Name = "Chrome";   Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName";           Manifest = "$HostName.chrome.json" },
    @{ Name = "Edge";     Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName";          Manifest = "$HostName.chrome.json" },
    @{ Name = "Brave";    Key = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"; Manifest = "$HostName.chrome.json" },
    @{ Name = "Chromium"; Key = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName";                Manifest = "$HostName.chrome.json" }
)

if ($Uninstall) {
    Write-Step "Removing Stream Sniper native messaging host"
    foreach ($t in $RegistryTargets) {
        if (Test-Path $t.Key) { Remove-Item -Path $t.Key -Recurse -Force; Write-Ok "Unregistered $($t.Name)" }
    }
    if (Test-Path $InstallDir) { Remove-Item -Path $InstallDir -Recurse -Force; Write-Ok "Removed $InstallDir" }
    Write-Host "`nDone." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Stream Sniper - Native Messaging Host Installer" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Python
Write-Step "Checking Python"
$python = $null
foreach ($candidate in @("python", "python3", "py")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) {
        try {
            $ver = & $cmd.Source --version 2>&1
            if ($ver -match "Python 3") { $python = $cmd.Source; break }
        } catch {}
    }
}
if (-not $python) {
    Write-Fail "Python 3 not found. Install it from https://www.python.org/downloads/ (tick 'Add to PATH') and rerun."
    exit 1
}
Write-Ok "Python: $python"

# 2. Copy bridge
Write-Step "Installing bridge script"
$bridgeSource = Join-Path $SourceDir "ytdlp-bridge.py"
if (-not (Test-Path $bridgeSource)) {
    Write-Fail "ytdlp-bridge.py not found next to this script ($SourceDir)."
    exit 1
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$bridgeDest = Join-Path $InstallDir "ytdlp-bridge.py"
Copy-Item -Path $bridgeSource -Destination $bridgeDest -Force
Write-Ok "Copied to $bridgeDest"

# Native messaging on Windows must point at an executable, so wrap python in a .bat launcher
$launcher = Join-Path $InstallDir "ytdlp-bridge.bat"
@"
@echo off
"$python" "$bridgeDest" %*
"@ | Set-Content -Path $launcher -Encoding ASCII
Write-Ok "Launcher: $launcher"

# 3. Manifests
Write-Step "Writing native messaging manifests"
$launcherJson = $launcher.Replace('\', '\\')

$firefoxManifest = @"
{
  "name": "$HostName",
  "description": "Stream Sniper native messaging host (yt-dlp, VLC)",
  "path": "$launcherJson",
  "type": "stdio",
  "allowed_extensions": ["$FirefoxExtensionId"]
}
"@
$firefoxManifestPath = Join-Path $InstallDir "$HostName.firefox.json"
$firefoxManifest | Set-Content -Path $firefoxManifestPath -Encoding UTF8
Write-Ok "Firefox manifest: $firefoxManifestPath (extension $FirefoxExtensionId)"

$chromeManifestPath = Join-Path $InstallDir "$HostName.chrome.json"
if ($ChromeExtensionId) {
    $chromeManifest = @"
{
  "name": "$HostName",
  "description": "Stream Sniper native messaging host (yt-dlp, VLC)",
  "path": "$launcherJson",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ChromeExtensionId/"]
}
"@
    $chromeManifest | Set-Content -Path $chromeManifestPath -Encoding UTF8
    Write-Ok "Chromium manifest: $chromeManifestPath (extension $ChromeExtensionId)"
} else {
    Write-Warn "No -ChromeExtensionId given; skipping Chrome/Edge/Brave. Rerun with the ID from chrome://extensions to enable them."
}

# 4. Registry
Write-Step "Registering with browsers"
foreach ($t in $RegistryTargets) {
    $manifestPath = Join-Path $InstallDir $t.Manifest
    if (-not (Test-Path $manifestPath)) { continue }
    New-Item -Path $t.Key -Force | Out-Null
    Set-ItemProperty -Path $t.Key -Name "(default)" -Value $manifestPath
    Write-Ok "$($t.Name): $($t.Key)"
}

# 5. Optional tools
Write-Step "Checking optional tools"
foreach ($tool in @(@{ n = "yt-dlp"; hint = "winget install yt-dlp.yt-dlp" }, @{ n = "ffmpeg"; hint = "winget install Gyan.FFmpeg" })) {
    if (Get-Command $tool.n -ErrorAction SilentlyContinue) { Write-Ok "$($tool.n) found" }
    else { Write-Warn "$($tool.n) not on PATH. Install with: $($tool.hint)" }
}
$vlc = @("$env:ProgramFiles\VideoLAN\VLC\vlc.exe", "${env:ProgramFiles(x86)}\VideoLAN\VLC\vlc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($vlc -or (Get-Command vlc -ErrorAction SilentlyContinue)) { Write-Ok "VLC found" } else { Write-Warn "VLC not found. 'Play in VLC' falls back to playlist files. Install with: winget install VideoLAN.VLC" }

Write-Host ""
Write-Host "Done. Restart your browser, then open Stream Sniper Settings and click 'Test yt-dlp Connection'." -ForegroundColor Green
Write-Host ""
