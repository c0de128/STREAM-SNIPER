# Stream Sniper - Firefox Extension Loader Helper
# This script helps automate the extension loading process

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  Stream Sniper Extension Loader" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Firefox is running
$firefoxProcess = Get-Process firefox -ErrorAction SilentlyContinue
if ($firefoxProcess) {
    Write-Host "✓ Firefox is running" -ForegroundColor Green
} else {
    Write-Host "⚠ Firefox is not running. Starting Firefox..." -ForegroundColor Yellow
    Start-Process "firefox" "about:debugging#/runtime/this-firefox"
    Start-Sleep -Seconds 3
}

# Extension file location
$extensionPath = "C:\Users\KevinMcKay\Downloads\M3U8\builds\stream-sniper-firefox-v2.0.zip"
$buildsFolder = "C:\Users\KevinMcKay\Downloads\M3U8\builds"

Write-Host ""
Write-Host "Extension Location:" -ForegroundColor Cyan
Write-Host "  $extensionPath" -ForegroundColor White
Write-Host ""

# Check if extension file exists
if (Test-Path $extensionPath) {
    Write-Host "✓ Extension file found" -ForegroundColor Green
} else {
    Write-Host "✗ Extension file not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  STEPS TO LOAD THE EXTENSION:" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. In Firefox, click 'Load Temporary Add-on...' button" -ForegroundColor White
Write-Host "  2. Select: stream-sniper-firefox-v2.0.zip" -ForegroundColor White
Write-Host "  3. Copy the Extension ID from the debugging page" -ForegroundColor Yellow
Write-Host "  4. Run: .\update-manifest.ps1 <EXTENSION_ID>" -ForegroundColor Cyan
Write-Host "  5. Restart Firefox" -ForegroundColor White
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# Open builds folder in explorer
Write-Host "Opening builds folder in File Explorer..." -ForegroundColor Cyan
Start-Process explorer $buildsFolder

Write-Host ""
Write-Host "Press any key to open Firefox debugging page..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Open Firefox to debugging page
Start-Process "firefox" "about:debugging#/runtime/this-firefox"

Write-Host ""
Write-Host "✓ Firefox debugging page opened" -ForegroundColor Green
Write-Host ""
Write-Host "After loading the extension, copy the ID and run:" -ForegroundColor Yellow
Write-Host "  .\update-manifest.ps1 YOUR_EXTENSION_ID" -ForegroundColor Cyan
Write-Host ""
