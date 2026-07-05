@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  ChatRPG setup ^& start
echo ============================================
echo.
echo [1/3] Installing dependencies (npm install)...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed. Make sure Node.js is installed.
  pause
  exit /b 1
)

echo.
echo [2/3] Preparing the database (npm run migrate)...
call npm run migrate

echo.
echo [3/3] Starting the server...
echo   Open http://localhost:5180 in your browser.
echo   Press Ctrl+C in this window to stop.
echo.
echo   If this fails with "EADDRINUSE" (port 3001 already in use), another
echo   ChatRPG instance is likely already running on this PC. Create a .env
echo   file here (copy .env.example) and set PORT to a free value, e.g. 3002.
echo.
call npm run dev

pause
