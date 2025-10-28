@echo off
echo.
echo ================================================================================
echo  Stream Sniper - Edit Native Messaging Manifest
echo ================================================================================
echo.
echo Opening manifest file for editing...
echo.
echo IMPORTANT: Replace {EXTENSION_ID_PLACEHOLDER} with your actual extension ID
echo.
echo Your extension ID can be found at: about:debugging#/runtime/this-firefox
echo Look for "Stream Sniper" and copy the Internal UUID shown
echo.
echo Press any key to open the manifest file in Notepad...
pause >nul

notepad "C:\Users\KevinMcKay\AppData\Roaming\StreamSniper\com.streamsniper.ytdlp.json"

echo.
echo ================================================================================
echo  After saving the file, restart Firefox for changes to take effect
echo ================================================================================
echo.
pause
