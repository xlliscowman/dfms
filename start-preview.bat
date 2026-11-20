@echo off
cd /d "%~dp0"
echo.
node scripts/build.mjs && node scripts/preview.mjs
pause
