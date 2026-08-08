@echo off
setlocal enabledelayedexpansion

rem Builds a distributable copy of ChatRPG in a sibling folder, including the
rem current demo data (data/, storage/images/). node_modules, .git, .claude,
rem client/dist, and koboldcpp/'s contents are excluded; koboldcpp/ itself is
rem recreated as an empty folder so the target machine's KoboldCpp
rem executable + models can be dropped in separately.
rem
rem The package also gets a ready-to-run "npm install + start" script and a
rem koboldcpp setup guide, copied in from release-assets\ (see below).

set "SRC=%~dp0"
set "SRC=%SRC:~0,-1%"
for %%I in ("%SRC%") do set "PROJECT_NAME=%%~nI"

echo.
echo ============================================
echo  ChatRPG release package
echo ============================================
echo.
echo  [T] Test package  - for verifying alongside your own running dev
echo                      environment on this PC. Ships with a preset
echo                      .env on a different port (3002) so it won't
echo                      collide with the dev server (3001).
echo  [P] Production package - for distributing to other people/machines.
echo                      No .env is included; the app uses its normal
echo                      defaults (3001) since it'll be the only
echo                      instance running there.
echo.
choice /C TP /N /M "Which kind of package do you want to create? [T/P]: "
if errorlevel 2 (set "PACKAGE_MODE=production") else (set "PACKAGE_MODE=test")

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%T"

set "DEST=%SRC%\..\%PROJECT_NAME%-release-%TIMESTAMP%"

echo.
echo Packaging %PROJECT_NAME% (%PACKAGE_MODE%) into:
echo   %DEST%
echo.
echo NOTE: if a dev server is currently running against data\chatrpg.sqlite,
echo stop it first so the WAL file is checkpointed before copying.
echo.

rem .env is always excluded from the copy: a release package must never
rem silently inherit whatever port/paths the source checkout happens to
rem have configured for local dev.
robocopy "%SRC%" "%DEST%" /E /XD node_modules .git .claude koboldcpp dist release-assets /XF *.log .env >nul

if not exist "%DEST%\koboldcpp" mkdir "%DEST%\koboldcpp"

copy "%SRC%\release-assets\setup-and-start.bat" "%DEST%\" >nul
copy "%SRC%\release-assets\koboldcpp-README.txt" "%DEST%\koboldcpp\README.txt" >nul
copy "%SRC%\release-assets\start-koboldcpp.bat" "%DEST%\koboldcpp\" >nul

if "%PACKAGE_MODE%"=="test" (
  (
    echo PORT=3002
    echo HOST=0.0.0.0
    echo KOBOLD_BASE_URL=http://127.0.0.1:5002
    echo DB_PATH=./data/chatrpg.sqlite
    echo IMAGE_STORAGE_DIR=./storage/images
  ) > "%DEST%\.env"
)

echo Done. Release package created at:
echo   %DEST%
echo.
echo Next steps on the target machine:
echo   1. Read koboldcpp\README.txt and place koboldcpp.exe + models there
echo   2. Run koboldcpp\start-koboldcpp.bat (or start koboldcpp.exe manually)
echo   3. Run setup-and-start.bat (installs deps, migrates DB, starts the app)
echo.
if "%PACKAGE_MODE%"=="test" (
  echo This is a TEST package: .env is preset to PORT=3002 / KOBOLD_BASE_URL
  echo port 5002 so it can run alongside your dev environment ^(3001/5001^)
  echo without a port conflict. If you're also running another test package
  echo at the same time, edit its .env to a further free port.
) else (
  echo This is a PRODUCTION package: no .env is included, so it starts on
  echo the normal default ports. If it needs to run alongside another
  echo ChatRPG instance on the SAME PC, copy .env.example to .env and set
  echo PORT/KOBOLD_BASE_URL to free values before running setup-and-start.bat.
)
echo.
pause
