@echo off
chcp 65001 >nul
set "ISO_PATH=%~1"

if "%ISO_PATH%"=="" (
  echo [ERRO] Nenhuma imagem ISO informada.
  pause
  exit /b 1
)

set "PORTABLE_PCSX2=%~dp0pcsx2\pcsx2.exe"

if exist "%PORTABLE_PCSX2%" (
  echo Iniciando imagem no Acelerador Desktop 60 FPS...
  start "" "%PORTABLE_PCSX2%" --nogui --fullscreen "%ISO_PATH%"
  exit /b 0
)

echo [AVISO] O executavel do emulador ainda nao foi configurado na pasta desktop-runner.
echo Por favor, acesse a interface web em http://127.0.0.1:8620 para configurar o Acelerador Desktop.
pause
