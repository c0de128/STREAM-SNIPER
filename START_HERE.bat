@echo off
color 0A
cls

echo.
echo ================================================================================
echo   STREAM SNIPER - COMPLETE INSTALLATION GUIDE
echo ================================================================================
echo.
echo   All dependencies are installed and ready!
echo.
echo   What's installed:
echo     - Extension built for Firefox and Chrome
echo     - yt-dlp 2025.10.22
echo     - FFmpeg 8.0
echo     - Native messaging host configured
echo.
echo ================================================================================
echo   LOAD EXTENSION IN FIREFOX (5 SIMPLE STEPS)
echo ================================================================================
echo.
echo   Step 1: Open Firefox debugging page
echo           (Opening automatically...)
echo.
timeout /t 2 /nobreak >nul

start firefox "about:debugging#/runtime/this-firefox"

echo   Step 2: Click "Load Temporary Add-on..." button
echo.
echo   Step 3: Select this file:
echo           stream-sniper-firefox-v2.0.zip
echo           (Opening builds folder...)
echo.
timeout /t 2 /nobreak >nul

start "" "%~dp0builds"

echo   Step 4: IMPORTANT - Copy Extension ID from Firefox
echo           Look for "Internal UUID" under Stream Sniper
echo           Format: {12345678-1234-1234-1234-123456789012}
echo.
echo   Step 5: Edit the manifest file
echo           (Will open after you press a key...)
echo.
echo ================================================================================
echo.
echo Press any key to open manifest file for editing...
pause >nul

echo.
echo Opening manifest file...
echo REPLACE {EXTENSION_ID_PLACEHOLDER} with your actual Extension ID
echo.
timeout /t 2 /nobreak >nul

notepad "%APPDATA%\StreamSniper\com.streamsniper.ytdlp.json"

echo.
echo ================================================================================
echo   AFTER EDITING:
echo ================================================================================
echo.
echo   1. Save the manifest file
echo   2. Restart Firefox
echo   3. Load extension again (repeat steps 1-3 above)
echo   4. Test: Click extension icon -^> Settings -^> Test yt-dlp Connection
echo   5. You should see: Success!
echo.
echo ================================================================================
echo   QUICK TEST SITES:
echo ================================================================================
echo.
echo   - YouTube:  youtube.com
echo   - Twitch:   twitch.tv
echo   - Twitter:  twitter.com (X)
echo.
echo ================================================================================
echo.
echo Press any key to exit...
pause >nul
