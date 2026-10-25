@echo off
title RetroStation Console - Configuracao Inicial do Dispositivo
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================================================
echo   RETROSTATION CONSOLE - INSTALACAO EM NOVO DISPOSITIVO
echo ======================================================================
echo.

echo [1/3] Verificando instalacao do Node.js...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado neste computador!
    echo Baixe e instale o Node.js v20+ em: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js detectado!

echo.
echo [2/3] Configurando pastas de biblioteca e junctions do EmulationStation...
node -e "
const fs = require('fs');
const path = require('path');
const esRoms = path.resolve('desktop-runner/es-de/ES-DE/ROMs');
const lib = path.resolve('library');
const mappings = [
  ['gc', 'gamecube'], ['gamecube', 'gamecube'],
  ['ps2', 'ps2'], ['psp', 'psp'],
  ['megadrive', 'genesis'], ['genesis', 'genesis'],
  ['snes', 'snes'], ['gba', 'gba'], ['nes', 'nes']
];
if (!fs.existsSync(esRoms)) fs.mkdirSync(esRoms, { recursive: true });
for (const [esFolder, libFolder] of mappings) {
  const target = path.join(lib, libFolder);
  const link = path.join(esRoms, esFolder);
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  if (!fs.existsSync(link)) {
    try { fs.symlinkSync(target, link, 'junction'); } catch {}
  }
}
console.log('[OK] Pastas e links do sistema configurados!');
"

echo.
echo [3/3] Iniciando o Console Retro nativo...
echo.
call "%~dp0INICIAR_CONSOLE_RETRO.bat"
exit /b 0
