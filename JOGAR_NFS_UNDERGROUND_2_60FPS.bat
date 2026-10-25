@echo off
title Need for Speed Underground 2 - Acelerador Desktop 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   NEED FOR SPEED UNDERGROUND 2 - SONY PLAYSTATION 2 (60 FPS)
echo ======================================================================
echo   Acelerador: PCSX2 1.6.0 (Direct3D 11 Hardware / MTVU Multithread)
echo ======================================================================
echo.

set "EMU_EXE=%~dp0desktop-runner\pcsx2\pcsx2.exe"
set "GAME_ISO=%~dp0library\ps2\Need for Speed - Underground 2 (USA).iso"

if not exist "%EMU_EXE%" (
    echo [ERRO] Executavel do acelerador PCSX2 nao encontrado em: "%EMU_EXE%"
    pause
    exit /b 1
)

if not exist "%GAME_ISO%" (
    for %%F in ("%~dp0library\ps2\*.iso" "%~dp0library\*.iso") do (
        set "GAME_ISO=%%~fF"
    )
)

if not exist "%GAME_ISO%" (
    echo [ERRO] Arquivo ISO de Need for Speed Underground 2 nao encontrado em library\ps2\
    pause
    exit /b 1
)

echo Iniciando Need for Speed Underground 2 a 60 FPS com Direct3D 11 nativo...
echo DICA: Durante o jogo, pressione ESC para pausar ou sair.
echo.

start "" "%EMU_EXE%" --fullscreen "%GAME_ISO%"
exit /b 0
