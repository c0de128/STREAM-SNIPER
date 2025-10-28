# Stream Sniper - Installation Test Script
# Verifies all components are properly installed

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  Stream Sniper - Installation Test" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# Test 1: Check Python
Write-Host "[1/7] Checking Python..." -ForegroundColor Cyan
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Python installed: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Python not found" -ForegroundColor Red
    $allGood = $false
}

# Test 2: Check yt-dlp
Write-Host "[2/7] Checking yt-dlp..." -ForegroundColor Cyan
try {
    $ytdlpVersion = python -m yt_dlp --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ yt-dlp installed: $ytdlpVersion" -ForegroundColor Green
    } else {
        Write-Host "  ✗ yt-dlp not working" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "  ✗ yt-dlp not found" -ForegroundColor Red
    $allGood = $false
}

# Test 3: Check FFmpeg
Write-Host "[3/7] Checking FFmpeg..." -ForegroundColor Cyan
try {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-Object -First 1
    if ($ffmpegVersion -match "ffmpeg version") {
        Write-Host "  ✓ FFmpeg installed: $($ffmpegVersion -split ' ' | Select-Object -First 3 -Skip 2)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ FFmpeg not in PATH (restart terminal)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ FFmpeg not found (restart terminal)" -ForegroundColor Yellow
}

# Test 4: Check ytdlp-bridge.py
Write-Host "[4/7] Checking ytdlp-bridge.py..." -ForegroundColor Cyan
$bridgePath = "C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\ytdlp-bridge.py"
if (Test-Path $bridgePath) {
    Write-Host "  ✓ Bridge script exists" -ForegroundColor Green
} else {
    Write-Host "  ✗ Bridge script not found" -ForegroundColor Red
    $allGood = $false
}

# Test 5: Check manifest file
Write-Host "[5/7] Checking native messaging manifest..." -ForegroundColor Cyan
$manifestPath = "C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json"
if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    Write-Host "  ✓ Manifest exists" -ForegroundColor Green

    # Check if extension ID is still placeholder
    if ($manifest.allowed_extensions -contains "{EXTENSION_ID_PLACEHOLDER}") {
        Write-Host "  ⚠ Extension ID is still placeholder - needs update!" -ForegroundColor Yellow
        Write-Host "    Run: .\update-manifest.ps1 YOUR_EXTENSION_ID" -ForegroundColor Gray
    } else {
        Write-Host "  ✓ Extension ID configured: $($manifest.allowed_extensions[0])" -ForegroundColor Green
    }
} else {
    Write-Host "  ✗ Manifest not found" -ForegroundColor Red
    $allGood = $false
}

# Test 6: Check Windows Registry
Write-Host "[6/7] Checking Windows Registry..." -ForegroundColor Cyan
$regPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.streamsniper.ytdlp"
try {
    $regValue = Get-ItemProperty -Path $regPath -Name "(Default)" -ErrorAction Stop
    if ($regValue.'(Default)' -eq $manifestPath) {
        Write-Host "  ✓ Registry configured correctly" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Registry points to wrong path" -ForegroundColor Yellow
        Write-Host "    Expected: $manifestPath" -ForegroundColor Gray
        Write-Host "    Actual: $($regValue.'(Default)')" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ Registry key not found" -ForegroundColor Red
    $allGood = $false
}

# Test 7: Check extension builds
Write-Host "[7/7] Checking extension builds..." -ForegroundColor Cyan
$firefoxBuild = "C:\Users\KevinMcKay\Downloads\M3U8\builds\stream-sniper-firefox-v2.0.zip"
$chromeBuild = "C:\Users\KevinMcKay\Downloads\M3U8\builds\stream-sniper-chrome-v2.0.zip"

if (Test-Path $firefoxBuild) {
    $size = (Get-Item $firefoxBuild).Length / 1MB
    Write-Host "  ✓ Firefox build exists ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Firefox build not found" -ForegroundColor Red
    $allGood = $false
}

if (Test-Path $chromeBuild) {
    $size = (Get-Item $chromeBuild).Length / 1MB
    Write-Host "  ✓ Chrome build exists ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  ✗ Chrome build not found" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "  ✓ ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "  ⚠ SOME TESTS FAILED" -ForegroundColor Yellow
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

if ($allGood) {
    Write-Host "Your installation is complete! Next steps:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  1. Load extension in Firefox:" -ForegroundColor White
    Write-Host "     Run: .\load-extension.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. After loading, update manifest:" -ForegroundColor White
    Write-Host "     Run: .\update-manifest.ps1 YOUR_EXTENSION_ID" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host ""
