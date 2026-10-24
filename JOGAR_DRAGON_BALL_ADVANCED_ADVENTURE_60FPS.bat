@echo off
title Dragon Ball: Advanced Adventure - mGBA 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   DRAGON BALL: ADVANCED ADVENTURE — GAME BOY ADVANCE (60 FPS)
echo ======================================================================
echo   Acelerador: mGBA (Escala de pixels perfeitos, audio stereo 60 FPS)
echo ======================================================================
echo.

set "MGBA=%~dp0desktop-runner\mgba\mGBA.exe"
set "ROM="

if exist "%~dp0library\gba\Dragon Ball - Advanced Adventure (USA).gba" set "ROM=%~dp0library\gba\Dragon Ball - Advanced Adventure (USA).gba"
if not defined ROM (
    for %%F in ("%~dp0library\gba\*.gba") do (
        set "ROM=%%~fF"
        goto :found_gba
    )
)
:found_gba

if not exist "%MGBA%" (
    echo [ERRO] Executavel do emulador mGBA nao encontrado em:
    echo "%MGBA%"
    pause
    exit /b 1
)

if not defined ROM (
    echo [ERRO] Arquivo ROM de Dragon Ball nao encontrado em:
    echo "%~dp0library\gba\"
    pause
    exit /b 1
)

echo Iniciando Dragon Ball: Advanced Adventure a 60 FPS nativo...
echo CONTROLES:
echo   Setas direcionais: Movimentar
echo   X: Pular / Z: Bater / A: Bastao / S: Especial
echo   ENTER: Start / Pausar
echo   ALT+ENTER ou F11: Tela Cheia
echo.

start "" "%MGBA%" -f "%ROM%"
exit /b 0
