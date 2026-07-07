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

set "LLM_MODEL="
if exist "models\llm" (
  for %%f in ("models\llm\*.gguf") do if not defined LLM_MODEL set "LLM_MODEL=%%f"
)
if not defined LLM_MODEL (
  echo No text model ^(.gguf^) found under models\llm\.
  echo Place a .gguf model file there ^(see README.txt^).
  echo.
  pause
  exit /b 1
)

set "SD_MODEL="
if exist "models\sd" (
  for %%f in ("models\sd\*.safetensors") do if not defined SD_MODEL set "SD_MODEL=%%f"
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
  "%EXE%" --model "%LLM_MODEL%" --sdmodel "%SD_MODEL%" --port 5001 --contextsize 8192 --gpulayers 999
) else (
  "%EXE%" --model "%LLM_MODEL%" --port 5001 --contextsize 8192 --gpulayers 999
)

echo.
echo KoboldCpp has stopped.
pause
