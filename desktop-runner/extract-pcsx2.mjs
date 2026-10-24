import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const winrarPath = 'C:\\Program Files\\WinRAR\\WinRAR.exe';
const archivePath = path.resolve('desktop-runner', 'pcsx2-portable.7z');
const outDir = path.resolve('desktop-runner', 'pcsx2') + path.sep;

if (!existsSync(winrarPath)) {
  console.error('WinRAR não encontrado.');
  process.exit(1);
}

console.log('Extraindo com WinRAR:', archivePath, '->', outDir);
execSync(`"${winrarPath}" x -ibck -y "${archivePath}" "${outDir}"`, { stdio: 'inherit' });

console.log('Conteúdo extraído em pcsx2:');
console.log(readdirSync(path.resolve('desktop-runner', 'pcsx2')));
