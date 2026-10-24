import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

const winrar = 'C:\\Program Files\\WinRAR\\WinRAR.exe';

const emulators = [
  {
    name: 'snes9x',
    url: 'https://github.com/snes9xgit/snes9x/releases/download/1.63/snes9x-1.63-win32-x64.zip',
    archive: 'desktop-runner/snes9x.zip',
    dest: 'desktop-runner/snes9x',
    exe: 'snes9x-x64.exe'
  },
  {
    name: 'mgba',
    url: 'https://github.com/mgba-emu/mgba/releases/download/0.10.5/mGBA-0.10.5-win64.7z',
    archive: 'desktop-runner/mgba.7z',
    dest: 'desktop-runner/mgba',
    exe: 'mGBA.exe'
  },
  {
    name: 'fceux',
    url: 'https://github.com/TASEmulators/fceux/releases/download/fceux-2.7.0/fceux-2.7.0-win64.zip',
    archive: 'desktop-runner/fceux.zip',
    dest: 'desktop-runner/fceux',
    exe: 'fceux.exe'
  },
  {
    name: 'ppsspp',
    url: 'https://github.com/hrydgard/ppsspp/releases/download/v1.20.4/PPSSPP-v1.20.4-Windows-x64.zip',
    archive: 'desktop-runner/ppsspp.zip',
    dest: 'desktop-runner/ppsspp',
    exe: 'PPSSPPWindows64.exe'
  },
  {
    name: 'dolphin',
    url: 'https://dl.dolphin-emu.org/releases/2609a/dolphin-2609a-x64.7z',
    archive: 'desktop-runner/dolphin.7z',
    dest: 'desktop-runner/dolphin',
    exe: 'Dolphin.exe'
  }
];

async function main() {
  for (const emu of emulators) {
    try {
      console.log(`\n================ Baixando ${emu.name.toUpperCase()} ================`);
      console.log(`URL: ${emu.url}`);
      const res = await fetch(emu.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(emu.archive, buf);
      console.log(`Salvo ${emu.archive} (${(buf.length / (1024 * 1024)).toFixed(1)} MB)`);

      await mkdir(emu.dest, { recursive: true });
      console.log(`Extraindo para ${emu.dest}...`);
      execSync(`"${winrar}" x -ibck -y "${path.resolve(emu.archive)}" "${path.resolve(emu.dest)}"`);
      console.log(`✓ ${emu.name.toUpperCase()} extraído com sucesso!`);
    } catch (err) {
      console.error(`Erro ao configurar ${emu.name}:`, err.message);
    }
  }
}

main().catch(console.error);
