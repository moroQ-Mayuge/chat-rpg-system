@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  KoboldCpp start
echo ============================================
echo.

set "EXE=koboldcpp.exe"
if not exist "%EXE%" set "EXE=models\koboldcpp.exe"
if not exist "%EXE%" (
  echo koboldcpp.exe not found in this folder.
  echo Download it from https://github.com/LostRuins/koboldcpp/releases
  echo and place it directly in this folder ^(see README.txt^).
  echo.
  pause
  exit /b 1
)

rem To use a specific model instead of auto-detecting the first file found,
rem set an absolute path here (leave blank to keep auto-detecting).
set "LLM_MODEL_OVERRIDE="
set "SD_MODEL_OVERRIDE="

set "LLM_MODEL=%LLM_MODEL_OVERRIDE%"
if not defined LLM_MODEL (
  if exist "models\llm" (
    for %%f in ("models\llm\*.gguf") do if not defined LLM_MODEL set "LLM_MODEL=%%f"
  )
)
if not defined LLM_MODEL (
  echo No text model ^(.gguf^) found under models\llm\.
  echo Place a .gguf model file there ^(see README.txt^).
  echo.
  pause
  exit /b 1
)

rem KoboldCpp has no fp8 image-model loading mode. The closest it supports is
rem --sdquant (0=off, 1=q8, 2=q4). Edit the line below to 1 or 2 to enable it.
set "SD_QUANT=0"

set "SD_MODEL=%SD_MODEL_OVERRIDE%"
if not defined SD_MODEL (
  if exist "models\sd" (
    for %%f in ("models\sd\*.safetensors") do if not defined SD_MODEL set "SD_MODEL=%%f"
  )
)
if not defined SD_MODEL (
  echo No image model ^(.safetensors^) found under models\sd\.
  echo Image generation will not be available until one is added ^(see README.txt^).
  echo.
)

echo Text model : %LLM_MODEL%
if defined SD_MODEL (
  echo Image model: %SD_MODEL%
) else (
  echo Image model: ^(none^)
)
echo.
echo Starting KoboldCpp on port 5001...
echo   If ChatRPG's .env uses a different KOBOLD_BASE_URL port, edit the
echo   --port value below to match, or edit .env to match this port.
echo.

if defined SD_MODEL (
  if "%SD_QUANT%"=="0" (
    "%EXE%" --model "%LLM_MODEL%" --sdmodel "%SD_MODEL%" --port 5001 --contextsize 8192 --gpulayers 999
  ) else (
    "%EXE%" --model "%LLM_MODEL%" --sdmodel "%SD_MODEL%" --sdquant %SD_QUANT% --port 5001 --contextsize 8192 --gpulayers 999
  )
) else (
  "%EXE%" --model "%LLM_MODEL%" --port 5001 --contextsize 8192 --gpulayers 999
)

echo.
echo KoboldCpp has stopped.
pause
