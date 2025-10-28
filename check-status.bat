@echo off
color 0B
cls

echo.
echo ================================================================================
echo   STREAM SNIPER - STATUS CHECK
echo ================================================================================
echo.

echo [1] Checking Firefox...
powershell -Command "if (Get-Process firefox -ErrorAction SilentlyContinue) { Write-Host '  OK - Firefox is running' -ForegroundColor Green } else { Write-Host '  NOT RUNNING - Please start Firefox' -ForegroundColor Red }"
echo.

echo [2] Checking Extension Build...
if exist "builds\stream-sniper-firefox-v2.0.zip" (
    echo   OK - Extension file exists
) else (
    echo   ERROR - Extension file not found!
)
echo.

echo [3] Checking Native Messaging...
if exist "%APPDATA%\StreamSniper\ytdlp-bridge.py" (
    echo   OK - Bridge script exists
) else (
    echo   ERROR - Bridge script not found!
)
echo.

if exist "%APPDATA%\StreamSniper\com.streamsniper.ytdlp.json" (
    echo   OK - Manifest file exists
    echo.
    echo   Current manifest content:
    type "%APPDATA%\StreamSniper\com.streamsniper.ytdlp.json"
) else (
    echo   ERROR - Manifest not found!
)
echo.

echo [4] Checking yt-dlp...
python -m yt_dlp --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   OK - yt-dlp is installed
) else (
    echo   ERROR - yt-dlp not working!
)
echo.

echo ================================================================================
echo   WHAT TO DO NEXT:
echo ================================================================================
echo.
echo   Is the extension loaded in Firefox?
echo.
echo   NO  - Double-click START_HERE.bat to load it
echo   YES - Have you updated the manifest with your Extension ID?
echo.
echo         Find your ID at: about:debugging (Internal UUID field)
echo         Then edit: %%APPDATA%%\StreamSniper\com.streamsniper.ytdlp.json
echo         Replace {EXTENSION_ID_PLACEHOLDER} with your actual ID
echo.
echo   After updating manifest:
echo     1. Restart Firefox
echo     2. Reload extension
echo     3. Test in Settings -^> Test yt-dlp Connection
echo.
echo ================================================================================
echo.
pause
