@echo off
title Need for Speed Underground 2 - Acelerador Desktop 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   NEED FOR SPEED UNDERGROUND 2 — ACELERADOR DESKTOP 60 FPS
echo ======================================================================
echo   Processador: Intel Core i7-2670QM (8 Threads com MTVU ativado)
echo   Placa de Video: Intel HD Graphics 3000 (Direct3D 11 Hardware)
echo ======================================================================
echo.

set "EMU_EXE=%~dp0desktop-runner\pcsx2\pcsx2.exe"
set "GAME_ISO="

if exist "%~dp0library\ps2\Need for Speed - Underground 2 (USA).iso" set "GAME_ISO=%~dp0library\ps2\Need for Speed - Underground 2 (USA).iso"
if not defined GAME_ISO if exist "%~dp0library\Need for Speed - Underground 2 (USA).iso" set "GAME_ISO=%~dp0library\Need for Speed - Underground 2 (USA).iso"
if not defined GAME_ISO (
    for %%F in ("%~dp0library\ps2\*.iso" "%~dp0library\*.iso") do (
        set "GAME_ISO=%%~fF"
        goto :found_iso
    )
)
:found_iso

if not exist "%EMU_EXE%" (
    echo [ERRO] Executavel do acelerador PCSX2 nao encontrado em:
    echo "%EMU_EXE%"
    pause
    exit /b 1
)

if not defined GAME_ISO (
    echo [ERRO] Arquivo ISO de Need for Speed Underground 2 nao encontrado em:
    echo "%~dp0library\ps2\"
    pause
    exit /b 1
)

echo Iniciando Need for Speed Underground 2 a 60 FPS com Direct3D 11 nativo...
echo DICA: Durante o jogo, pressione ESC para pausar ou sair.
echo.

start "" "%EMU_EXE%" --fullscreen "%GAME_ISO%"
exit /b 0
