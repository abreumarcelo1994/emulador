@echo off
title RETRO STATION - Console Hub 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETRO STATION OS - CENTRAL DE JOGOS E EMULACAO RETRO (60 FPS)
echo ======================================================================
echo   1 Executavel Nativo Windows - Estilo Console TV/Arcade
echo   Sem barras de navegador - Controles e Emuladores 60 FPS Integrados
echo ======================================================================
echo.

REM 1. Verifica se o servidor local Node.js ja esta rodando
powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 8620 -ErrorAction SilentlyContinue) | Out-Null"
if %ERRORLEVEL% NEQ 0 (
    echo [1/2] Inicializando servidor local de jogos e emuladores...
    start "RetroStationServer" /min cmd /c "node server.mjs"
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 1500"
) else (
    echo [1/2] Servidor de jogos ja esta ativo na porta 8620.
)

REM 2. Busca executavel do Chrome ou Edge para App Mode nativo
set "APP_URL=http://127.0.0.1:8620"
set "BROWSER="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
)
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

echo [2/2] Abrindo Central Retro Station em Modo Console Nativo...
if defined BROWSER (
    start "" "%BROWSER%" --app="%APP_URL%" --start-maximized --disable-features=Translate
) else (
    start "" "%APP_URL%"
)

echo.
echo ======================================================================
echo   SISTEMA CARREGADO COM SUCESSO!
echo   Pressione F11 a qualquer momento para alternar Modo Tela Cheia Total.
echo ======================================================================
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
exit /b 0
