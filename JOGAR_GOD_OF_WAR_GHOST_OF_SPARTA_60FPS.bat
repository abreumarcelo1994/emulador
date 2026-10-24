@echo off
title God of War: Ghost of Sparta - PPSSPP 60 FPS
chcp 65001 >nul
cd /d "%~dp0"
echo ======================================================================
echo   GOD OF WAR: GHOST OF SPARTA - SONY PSP (60 FPS NATIVO)
echo ======================================================================
echo   Acelerador: PPSSPP Windows 64-bit (Direct3D 11 / Vulkan)
echo ======================================================================
echo.

node desktop-runner\download-gow.mjs

if %ERRORLEVEL% EQU 0 (
  set "ROM="
  if exist "%~dp0library\psp\God of War - Ghost of Sparta.iso" set "ROM=%~dp0library\psp\God of War - Ghost of Sparta.iso"
  if not defined ROM if exist "%~dp0library\psp\God of War - Ghost of Sparta (USA).cso" set "ROM=%~dp0library\psp\God of War - Ghost of Sparta (USA).cso"
  if not defined ROM (
    for %%F in ("%~dp0library\psp\*.iso" "%~dp0library\psp\*.cso") do (
      set "ROM=%%~fF"
      goto :found
    )
  )
:found
  echo.
  echo [INICIANDO] Executando God of War a 60 FPS no PPSSPP...
  echo CONTROLES: Suporte total a Controle USB/Bluetooth ou Teclado
  echo ATALHOS: ALT+ENTER (Tela Cheia) ^| ESC (Menu de Pause/Sair)
  echo.
  start "" "%~dp0desktop-runner\ppsspp\PPSSPPWindows64.exe" "%ROM%"
) else (
  echo.
  echo [ERRO] Ocorreu uma falha na verificacao do jogo.
  pause
)

