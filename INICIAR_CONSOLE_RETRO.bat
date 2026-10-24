@echo off
title RETRO STATION - Console Hub 60 FPS
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETRO STATION OS - CENTRAL DE JOGOS & EMULAÇÃO RETRÔ (60 FPS)
echo ======================================================================
echo   1 Executável Nativo Windows • Estilo Console TV/Arcade
echo   Sem barras de navegador • Controles e Emuladores 60 FPS Integrados
echo ======================================================================
echo.

:: 1. Verifica se o servidor local Node.js já está rodando
netstat -ano | findstr /r ":8620 " >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/2] Inicializando servidor local de jogos e emuladores...
    start /min "" cmd /c "node server.mjs"
    timeout /t 2 /nobreak >nul
) else (
    echo [1/2] Servidor de jogos já está ativo na porta 8620.
)

:: 2. Busca o executável do navegador para rodar em MODO APLICATIVO NATIVO (App Mode / Kiosk)
:: O App Mode remove completamente a barra de endereço, abas e moldura, transformando em um app nativo de console!
set "APP_URL=http://127.0.0.1:8620"
set "BROWSER="

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
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
timeout /t 3 >nul
exit /b 0
