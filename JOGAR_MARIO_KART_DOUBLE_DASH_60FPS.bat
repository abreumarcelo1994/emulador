@echo off
title Mario Kart: Double Dash - Acelerador 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   MARIO KART: DOUBLE DASH - NINTENDO GAMECUBE (60 FPS)
echo ======================================================================
echo   Acelerador: Dolphin (Direct3D 11/12, Vulkan, Audio DSP nativo 60 FPS)
echo ======================================================================
echo.

set "DOLPHIN=%~dp0desktop-runner\dolphin\Dolphin.exe"
set "ROM=%~dp0library\gamecube\Mario Kart - Double Dash!! (USA).rvz"

if not exist "%DOLPHIN%" (
    echo [ERRO] Executavel do emulador Dolphin nao encontrado em: "%DOLPHIN%"
    pause
    exit /b 1
)

if not exist "%ROM%" (
    for %%F in ("%~dp0library\gamecube\*.rvz" "%~dp0library\gamecube\*.iso" "%~dp0library\gamecube\*.gcm") do (
        set "ROM=%%~fF"
    )
)

if not exist "%ROM%" (
    echo [ERRO] Arquivo ROM de Mario Kart nao encontrado em library\gamecube\
    pause
    exit /b 1
)

echo Iniciando Mario Kart: Double Dash a 60 FPS cravados...
echo CONTROLES: Suporte total a Controle USB/Bluetooth ou Teclado
echo ATALHOS: ALT+ENTER (Tela Cheia) / ESC (Sair)
echo.

start "" "%DOLPHIN%" -b -e "%ROM%"
exit /b 0
