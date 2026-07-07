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

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TIMESTAMP=%%T"

set "DEST=%SRC%\..\%PROJECT_NAME%-release-%TIMESTAMP%"

echo.
echo Packaging %PROJECT_NAME% into:
echo   %DEST%
echo.
echo NOTE: if a dev server is currently running against data\chatrpg.sqlite,
echo stop it first so the WAL file is checkpointed before copying.
echo.

robocopy "%SRC%" "%DEST%" /E /XD node_modules .git .claude koboldcpp dist release-assets /XF *.log >nul

if not exist "%DEST%\koboldcpp" mkdir "%DEST%\koboldcpp"

copy "%SRC%\release-assets\setup-and-start.bat" "%DEST%\" >nul
copy "%SRC%\release-assets\koboldcpp-README.txt" "%DEST%\koboldcpp\README.txt" >nul
copy "%SRC%\release-assets\start-koboldcpp.bat" "%DEST%\koboldcpp\" >nul

echo Done. Release package created at:
echo   %DEST%
echo.
echo Next steps on the target machine:
echo   1. Read koboldcpp\README.txt and place koboldcpp.exe + models there
echo   2. Run koboldcpp\start-koboldcpp.bat (or start koboldcpp.exe manually)
echo   3. Run setup-and-start.bat (installs deps, migrates DB, starts the app)
echo.
echo NOTE: if you run this alongside another ChatRPG instance on the SAME PC,
echo the server port (default 3001) will conflict (EADDRINUSE). Create a
echo .env file in this package (copy .env.example) and set PORT to a free
echo value, e.g. 3002, before running setup-and-start.bat.
echo.
pause
