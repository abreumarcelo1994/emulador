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

set "PPSSPP=%~dp0desktop-runner\ppsspp\PPSSPPWindows64.exe"
set "ROM=%~dp0library\psp\God of War - Ghost of Sparta.iso"

if not exist "%PPSSPP%" (
    echo [ERRO] Emulador PPSSPP nao encontrado em: "%PPSSPP%"
    pause
    exit /b 1
)

if not exist "%ROM%" (
    echo [AVISO] ISO nao encontrada na pasta padrao. Verificando outros formatos...
    for %%F in ("%~dp0library\psp\*.iso" "%~dp0library\psp\*.cso") do (
        set "ROM=%%~fF"
    )
)

if not exist "%ROM%" (
    echo [AVISO] ROM ainda nao encontrada. Executando verificador de download...
    node desktop-runner\download-gow.mjs
    if exist "%~dp0library\psp\God of War - Ghost of Sparta.iso" (
        set "ROM=%~dp0library\psp\God of War - Ghost of Sparta.iso"
    )
)

if not exist "%ROM%" (
    echo [ERRO] Nao foi possivel localizar ou baixar a ROM de God of War.
    pause
    exit /b 1
)

echo [INICIANDO] Executando God of War a 60 FPS no PPSSPP...
echo CONTROLES: Suporte total a Controle USB/Bluetooth ou Teclado
echo ATALHOS: ALT+ENTER (Tela Cheia) / ESC (Menu de Pause/Sair)
echo.

start "" "%PPSSPP%" "%ROM%"
exit /b 0
