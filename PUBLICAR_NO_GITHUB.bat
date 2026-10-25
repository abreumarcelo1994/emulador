@echo off
title RetroStation Console - Publicar no GitHub
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETROSTATION CONSOLE - PUBLICAR NO GITHUB
echo ======================================================================
echo.
echo O repositorio ja esta configurado e sincronizado com o GitHub:
echo https://github.com/abreumarcelo1994/emulador
echo.
git push -u origin main
echo.
pause
exit /b 0
