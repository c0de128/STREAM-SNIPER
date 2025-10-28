# Stream Sniper - Native Messaging Manifest Updater
# Updates the manifest file with the Firefox extension ID

param(
    [Parameter(Mandatory=$false)]
    [string]$ExtensionId
)

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  Stream Sniper - Manifest Updater" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

$manifestPath = "C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json"

# Check if manifest exists
if (-not (Test-Path $manifestPath)) {
    Write-Host "✗ Manifest file not found at:" -ForegroundColor Red
    Write-Host "  $manifestPath" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "✓ Manifest file found" -ForegroundColor Green
Write-Host ""

# If no ID provided, prompt for it
if (-not $ExtensionId) {
    Write-Host "Enter your Firefox Extension ID" -ForegroundColor Yellow
    Write-Host "(Find it at about:debugging - look for 'Internal UUID')" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Format: {12345678-1234-1234-1234-123456789012}" -ForegroundColor Gray
    Write-Host ""
    $ExtensionId = Read-Host "Extension ID"
}

# Validate ID format (should be a GUID in curly braces)
if ($ExtensionId -notmatch '^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$') {
    Write-Host ""
    Write-Host "⚠ Warning: ID format doesn't match expected pattern" -ForegroundColor Yellow
    Write-Host "Expected format: {12345678-1234-1234-1234-123456789012}" -ForegroundColor Gray
    Write-Host "You entered: $ExtensionId" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "Updating manifest with Extension ID: $ExtensionId" -ForegroundColor Cyan
Write-Host ""

# Read manifest file
try {
    $manifestContent = Get-Content $manifestPath -Raw

    # Show current content
    Write-Host "Current manifest:" -ForegroundColor Gray
    Write-Host $manifestContent -ForegroundColor DarkGray
    Write-Host ""

    # Replace placeholder with actual ID
    $updatedContent = $manifestContent -replace '\{EXTENSION_ID_PLACEHOLDER\}', $ExtensionId

    # Backup original
    $backupPath = "$manifestPath.backup"
    Copy-Item $manifestPath $backupPath -Force
    Write-Host "✓ Backup created: $backupPath" -ForegroundColor Green

    # Write updated content
    Set-Content $manifestPath $updatedContent -NoNewline

    Write-Host "✓ Manifest updated successfully!" -ForegroundColor Green
    Write-Host ""

    # Show updated content
    Write-Host "Updated manifest:" -ForegroundColor Gray
    Write-Host $updatedContent -ForegroundColor DarkGray
    Write-Host ""

    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "  NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Restart Firefox" -ForegroundColor White
    Write-Host "  2. Go to about:debugging#/runtime/this-firefox" -ForegroundColor White
    Write-Host "  3. Load the extension again" -ForegroundColor White
    Write-Host "  4. Open extension settings and click 'Test yt-dlp Connection'" -ForegroundColor White
    Write-Host "  5. You should see: ✓ Success!" -ForegroundColor Green
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Host "✗ Error updating manifest: $_" -ForegroundColor Red
    exit 1
}
