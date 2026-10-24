import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const url = 'https://github.com/PCSX2/pcsx2/releases/download/v1.6.0/pcsx2-v1.6.0-windows-32bit-portable.7z';
const dest7z = path.resolve('desktop-runner', 'pcsx2-portable.7z');
const outDir = path.resolve('desktop-runner', 'pcsx2');

async function main() {
  console.log('Baixando PCSX2 1.6.0 portátil (6 MB)...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha no download: ${res.status}`);

  if (!existsSync('desktop-runner')) mkdirSync('desktop-runner', { recursive: true });
  await pipeline(res.body, createWriteStream(dest7z));
  console.log('Download concluído com sucesso!');

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log('Extraindo arquivo...');
  try {
    execSync(`tar -xf "${dest7z}" -C "${outDir}"`, { stdio: 'inherit' });
    console.log('Extração concluída com sucesso!');
  } catch (err) {
    console.error('Erro na extração com tar:', err.message);
  }
}

main().catch(console.error);
