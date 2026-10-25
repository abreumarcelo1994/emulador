@echo off
title Sonic the Hedgehog 2 - Acelerador 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   SONIC THE HEDGEHOG 2 - SEGA MEGA DRIVE / GENESIS (60 FPS)
echo ======================================================================
echo   Acelerador: BlastEm (Ciclo exato, audio nativo 60 FPS)
echo ======================================================================
echo.

set "BLASTEM=%~dp0desktop-runner\blastem\blastem.exe"
set "ROM=%~dp0library\genesis\Sonic The Hedgehog 2 (World).md"

if not exist "%BLASTEM%" (
    echo [ERRO] Executavel do emulador BlastEm nao encontrado em: "%BLASTEM%"
    pause
    exit /b 1
)

if not exist "%ROM%" (
    for %%F in ("%~dp0library\genesis\*.md" "%~dp0library\genesis\*.gen" "%~dp0library\*.md") do (
        set "ROM=%%~fF"
    )
)

if not exist "%ROM%" (
    echo [ERRO] Arquivo ROM de Sonic the Hedgehog 2 nao encontrado em library\genesis\
    pause
    exit /b 1
)

echo Iniciando Sonic the Hedgehog 2 a 60 FPS sem engasgos...
echo CONTROLES PADRAO: Setas (Movimentar) / A, S, D (Pular) / ENTER (Start) / ESC (Sair)
echo.

start "" "%BLASTEM%" "%ROM%"
exit /b 0
