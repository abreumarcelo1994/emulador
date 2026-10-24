@echo off
title RetroStation Console — Publicar no GitHub
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETROSTATION CONSOLE — PUBLICAR NO GITHUB
echo ======================================================================
echo.
echo O commit com todo o sistema, regras de UX, interface e launchers
echo já foi criado com sucesso no branch 'main' localmente (~19 MB).
echo.
echo Se você ainda não criou o repositório no GitHub:
echo 1. Acesse: https://github.com/new
echo 2. Crie um repositório vazio (sem README nem .gitignore)
echo 3. Copie a URL do repositório (ex: https://github.com/SEU_USER/emulador.git)
echo.
set /p REPO_URL="Cole a URL do seu repositório GitHub aqui: "

if "%REPO_URL%"=="" (
    echo [ERRO] Nenhuma URL informada. Operação cancelada.
    pause
    exit /b 1
)

git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%

echo.
echo Enviando branch main para o GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo   [SUCESSO] PROJETO PUBLICADO COM SUCESSO NO GITHUB!
    echo ======================================================================
    echo No seu outro computador, basta rodar:
    echo   1. git clone %REPO_URL%
    echo   2. Abrir a pasta e clicar 2x em: SETUP_NOVO_DISPOSITIVO.bat
    echo ======================================================================
) else (
    echo.
    echo [AVISO] Houve um problema ao enviar. Verifique suas credenciais do GitHub.
)

echo.
pause
