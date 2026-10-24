@echo off
title RetroStation Console — EmulationStation Desktop Edition
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETROSTATION CONSOLE — EMULATIONSTATION DESKTOP EDITION (ES-DE)
echo ======================================================================
echo   Interface 100%% Estilo RetroPie / Recalbox Nativa no Windows
echo ======================================================================
echo.

set "ES_EXE=%~dp0desktop-runner\es-de\ES-DE\ES-DE.exe"

if not exist "%ES_EXE%" (
    echo [ERRO] Executavel do EmulationStation nao encontrado em:
    echo "%ES_EXE%"
    pause
    exit /b 1
)

echo Iniciando EmulationStation Desktop Edition em Modo Console Fullscreen...
echo CONTROLES: Suporte completo a Controles USB/Bluetooth e Teclado
echo ATALHOS: F11 (Tela Cheia) ^| ESC / Botao Back (Voltar ao Menu)
echo.

start "" "%ES_EXE%" --fullscreen
exit /b 0
