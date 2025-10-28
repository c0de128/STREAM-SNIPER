# Stream Sniper - Verification and Completion Helper
# Helps verify extension is loaded and completes the setup

param(
    [Parameter(Mandatory=$false)]
    [string]$ExtensionId
)

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  Stream Sniper - Setup Verification & Completion" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Check Firefox is running
$firefoxProcess = Get-Process firefox -ErrorAction SilentlyContinue
if ($firefoxProcess) {
    Write-Host "[1/5] Firefox Status:" -ForegroundColor Cyan
    Write-Host "  ✓ Firefox is running (PID: $($firefoxProcess[0].Id))" -ForegroundColor Green
} else {
    Write-Host "[1/5] Firefox Status:" -ForegroundColor Cyan
    Write-Host "  ✗ Firefox is not running!" -ForegroundColor Red
    Write-Host "  Please start Firefox and load the extension first." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check manifest current state
Write-Host ""
Write-Host "[2/5] Checking Native Messaging Manifest:" -ForegroundColor Cyan
$manifestPath = "C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json"

if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $currentId = $manifest.allowed_extensions[0]

    Write-Host "  ✓ Manifest file exists" -ForegroundColor Green
    Write-Host "  Current Extension ID: $currentId" -ForegroundColor White

    if ($currentId -eq "{EXTENSION_ID_PLACEHOLDER}") {
        Write-Host ""
        Write-Host "  ⚠ Manifest still has placeholder ID!" -ForegroundColor Yellow
        Write-Host "  You need to update it with your actual Extension ID" -ForegroundColor Yellow

        if ($ExtensionId) {
            Write-Host ""
            Write-Host "  Updating with provided ID: $ExtensionId" -ForegroundColor Cyan

            $manifest.allowed_extensions = @($ExtensionId)
            $manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath

            Write-Host "  ✓ Manifest updated!" -ForegroundColor Green
            Write-Host ""
            Write-Host "  NEXT STEP: Restart Firefox and reload the extension" -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "  To update, run:" -ForegroundColor Cyan
            Write-Host "    .\verify-and-complete.ps1 YOUR_EXTENSION_ID" -ForegroundColor White
            Write-Host ""
            Write-Host "  Or manually edit: $manifestPath" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✓ Extension ID is configured" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ Manifest file not found!" -ForegroundColor Red
}

# Check registry
Write-Host ""
Write-Host "[3/5] Checking Windows Registry:" -ForegroundColor Cyan
$regPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp"
try {
    $regValue = Get-ItemProperty -Path $regPath -Name "(Default)" -ErrorAction Stop
    Write-Host "  ✓ Registry key exists" -ForegroundColor Green
    Write-Host "  Points to: $($regValue.'(Default)')" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Registry key not found!" -ForegroundColor Red
}

# Check extension build
Write-Host ""
Write-Host "[4/5] Checking Extension Build:" -ForegroundColor Cyan
$extensionPath = "C:\Users\KevinMcKay\Downloads\M3U8\builds\stream-sniper-firefox-v2.0.zip"
if (Test-Path $extensionPath) {
    $size = (Get-Item $extensionPath).Length / 1MB
    Write-Host "  ✓ Extension file exists ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Extension file not found!" -ForegroundColor Red
}

# Check yt-dlp
Write-Host ""
Write-Host "[5/5] Checking yt-dlp:" -ForegroundColor Cyan
try {
    $ytdlpVersion = python -m yt_dlp --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ yt-dlp installed: $ytdlpVersion" -ForegroundColor Green
    } else {
        Write-Host "  ✗ yt-dlp not working" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ yt-dlp not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

if ($currentId -eq "{EXTENSION_ID_PLACEHOLDER}") {
    Write-Host "  1. Load extension in Firefox (if not already loaded):" -ForegroundColor White
    Write-Host "     a. Go to: about:debugging#/runtime/this-firefox" -ForegroundColor Gray
    Write-Host "     b. Click 'Load Temporary Add-on'" -ForegroundColor Gray
    Write-Host "     c. Select: stream-sniper-firefox-v2.0.zip" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Copy the Extension ID from Firefox" -ForegroundColor White
    Write-Host "     (Look for 'Internal UUID' under Stream Sniper)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Update manifest by running:" -ForegroundColor White
    Write-Host "     .\verify-and-complete.ps1 YOUR_EXTENSION_ID" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "  ✓ Manifest is configured!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  If you just updated the manifest:" -ForegroundColor White
    Write-Host "    1. Restart Firefox" -ForegroundColor Gray
    Write-Host "    2. Reload extension from about:debugging" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Test the extension:" -ForegroundColor White
    Write-Host "    1. Visit YouTube or Twitch" -ForegroundColor Gray
    Write-Host "    2. Click Stream Sniper icon" -ForegroundColor Gray
    Write-Host "    3. Go to Settings -> Test yt-dlp Connection" -ForegroundColor Gray
    Write-Host "    4. Should see: ✓ Success!" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
