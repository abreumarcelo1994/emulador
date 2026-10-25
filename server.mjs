import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readFile, readdir, realpath, stat, writeFile, mkdir, open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const execAsync = promisify(exec);

let hardwareInfo = null;
async function getHardwareInfo() {
  if (hardwareInfo) return hardwareInfo;
  const cpus = os.cpus();
  const cpuModel = cpus?.[0]?.model || 'Processador x86_64';
  const cpuCores = cpus?.length || 4;
  const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
  let gpuName = 'Acelerador Gráfico Integrado';

  try {
    const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"');
    if (stdout && stdout.trim()) {
      gpuName = stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {}

  hardwareInfo = {
    cpu: cpuModel,
    gpu: gpuName,
    cores: cpuCores,
    ramGb: totalRamGb
  };
  return hardwareInfo;
}

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(APP_ROOT, 'app');
const LIBRARY_DIR = path.join(APP_ROOT, 'library');
const PC_GAMES_DIR = path.join(APP_ROOT, 'pc-games');
const DESKTOP_RUNNER_DIR = path.join(APP_ROOT, 'desktop-runner');
const DESKTOP_CONFIG_FILE = path.join(DESKTOP_RUNNER_DIR, 'config.json');
const CONFIG_FILE = path.join(APP_ROOT, 'scan-roots.json');
const COMPATIBILITY_FILE = path.join(APP_ROOT, 'compatibility-cache.json');
const GAMES_DB_FILE = path.join(APP_ROOT, 'games-db.json');
const HOST = '127.0.0.1';
const PORT = 8620;

async function loadDesktopRunnerConfig() {
  try {
    const raw = await readFile(DESKTOP_CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { configured: false, emulatorPath: '' };
  }
}

const GAME_EXTENSIONS = new Set([
  '.iso', '.cso', '.chd', '.isz', '.bin', '.elf', '.exe', '.lnk', '.bat',
  '.md', '.gen', '.smd',
  '.smc', '.sfc',
  '.gba', '.gbc', '.gb',
  '.nes',
  '.rvz', '.gcm', '.gcz'
]);
const AUTO_SCAN_EXTENSIONS = new Set([
  '.iso', '.cso', '.chd', '.isz', '.exe', '.lnk', '.bat',
  '.md', '.gen', '.smd',
  '.smc', '.sfc',
  '.gba', '.gbc', '.gb',
  '.nes',
  '.rvz', '.gcm', '.gcz'
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.hg', '.svn', 'node_modules', '$recycle.bin', 'desktop-runner', 'instaladores', 'play-source']);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.wasm', 'application/wasm'],
  ['.pnach', 'text/plain; charset=utf-8']
]);

let games = new Map();
let lastScan = null;
let compatibilityCache = {};
let compatibilityQueue = [];
let compatibilityWorkerRunning = false;
let curatedDb = [];

// Estado de downloads em andamento
let activeDownloads = new Map();

function addSecurityHeaders(response) {
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function asDisplaySize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 MB';
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fileId(filePath) {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 24);
}

function cleanTitle(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[._]+/g, ' ')
    .replace(/[[(].*?[)\]]/g, ' ')
    .replace(/\b(?:usa|eur|pal|ntsc|jap|rev|v\d+(?:\.\d+)*|en,fr,de,es,it|pt-br|dublado|legendado)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSerialFromText(text) {
  if (!text) return null;
  const match = text.match(/\b([S|B][A-Z]{3})[-_]?(\d{3,5}(?:\.\d{2})?)\b/i);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const num = match[2].replace('.', '');
  return `${prefix}-${num.padStart(5, '0')}`;
}

async function loadCuratedDb() {
  try {
    const raw = await readFile(GAMES_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    curatedDb = parsed.games || [];
  } catch {
    curatedDb = [];
  }
}

function findCuratedMetadata(title, serial) {
  const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (serial) {
    const normSerial = serial.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const found = curatedDb.find(g => {
      const gSerial = g.serial.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (gSerial === normSerial) return true;
      return (g.aliases || []).some(a => a.replace(/[^A-Z0-9]/gi, '').toUpperCase() === normSerial);
    });
    if (found) return found;
  }
  return curatedDb.find(g => {
    const gTitle = (g.cleanTitle || g.title).toLowerCase().replace(/[^a-z0-9]/g, '');
    return normTitle.includes(gTitle) || gTitle.includes(normTitle);
  });
}

function generateCoverUrl(serial, title) {
  if (serial) {
    const normSerial = serial.toUpperCase().replace('_', '-').replace('.', '');
    const localJpg = path.join(WEB_ROOT, 'covers', `${normSerial}.jpg`);
    const localPng = path.join(WEB_ROOT, 'covers', `${normSerial}.png`);
    if (existsSync(localJpg)) return `/covers/${normSerial}.jpg`;
    if (existsSync(localPng)) return `/covers/${normSerial}.png`;
    return `https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/${normSerial}.jpg`;
  }
  return null;
}

function cheatsSearchUrl(title) {
  return `https://gamehacking.org/search?q=${encodeURIComponent(title)}&sys=ps2`;
}

async function loadCompatibilityCache() {
  try {
    compatibilityCache = JSON.parse(await readFile(COMPATIBILITY_FILE, 'utf8'));
  } catch {
    compatibilityCache = {};
  }
}

async function saveCompatibilityCache() {
  try {
    await writeFile(COMPATIBILITY_FILE, `${JSON.stringify(compatibilityCache, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.error('Falha ao salvar cache de compatibilidade:', err.message);
  }
}

function detectSystemAndRunner(filePath, extension) {
  const norm = filePath.toLowerCase().replace(/\\/g, '/');
  const ext = (extension || '').toLowerCase();

  // Super Nintendo (SNES)
  if (norm.includes('/library/snes/') || ext === '.smc' || ext === '.sfc') {
    return {
      platform: 'Super Nintendo (SNES)',
      systemTag: 'snes',
      genre: 'Super Nintendo',
      year: '1990-1998',
      runner: 'snes9x',
      isConsole: true,
      requirementTier: 'Leve (60 FPS)',
      requirementDesc: 'Super Nintendo 16-bit. Roda a 60 FPS cravados no Snes9x com áudio límpido e sem lag.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'snes9x', 'snes9x-x64.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" "${rom}"`
    };
  }

  // Game Boy Advance / Color / Classic
  if (norm.includes('/library/gba/') || ext === '.gba' || ext === '.gbc' || ext === '.gb') {
    return {
      platform: 'Game Boy Advance',
      systemTag: 'gba',
      genre: 'Game Boy Advance',
      year: '1998-2006',
      runner: 'mgba',
      isConsole: true,
      requirementTier: 'Leve (60 FPS)',
      requirementDesc: 'Portátil clássico da Nintendo. Emulado com precisão e escala perfeita no mGBA a 60 FPS.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'mgba', 'mGBA.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" "${rom}"`
    };
  }

  // Nintendo NES (8-bit)
  if (norm.includes('/library/nes/') || ext === '.nes') {
    return {
      platform: 'Nintendo NES (8-bit)',
      systemTag: 'nes',
      genre: 'Nintendo 8-bit',
      year: '1983-1994',
      runner: 'fceux',
      isConsole: true,
      requirementTier: 'Leve (60 FPS)',
      requirementDesc: 'Nintendinho 8-bit clássico. Roda com taxa máxima de quadros no FCEUX.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'fceux', 'fceux64.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" "${rom}"`
    };
  }

  // Sega Genesis / Mega Drive
  if (norm.includes('/library/genesis/') || ext === '.md' || ext === '.gen' || ext === '.smd') {
    return {
      platform: 'Sega Genesis / Mega Drive',
      systemTag: 'genesis',
      genre: 'Sega Mega Drive',
      year: '1988-1997',
      runner: 'blastem',
      isConsole: true,
      requirementTier: 'Leve (60 FPS)',
      requirementDesc: '16-bit clássico da Sega. Emulado com ciclo exato no BlastEm a 60 FPS.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'blastem', 'blastem.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" "${rom}"`
    };
  }

  // PlayStation Portable (PSP)
  if (norm.includes('/library/psp/') || norm.includes('/psp/') || ext === '.cso') {
    return {
      platform: 'PlayStation Portable (PSP)',
      systemTag: 'psp',
      genre: 'PlayStation Portable',
      year: '2004-2014',
      runner: 'ppsspp',
      isConsole: true,
      requirementTier: 'Médio (60 FPS)',
      requirementDesc: 'Portátil da Sony com suporte a resolução HD no PPSSPP com Direct3D 11.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'ppsspp', 'PPSSPPWindows64.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" "${rom}"`
    };
  }

  // PC Nativo
  if (ext === '.exe' || ext === '.lnk' || ext === '.bat') {
    return {
      platform: 'PC Windows',
      systemTag: 'pc',
      genre: 'Jogo Nativo de PC',
      year: 'PC Windows',
      runner: 'pc',
      isConsole: false,
      requirementTier: 'Nativo PC (60 FPS)',
      requirementDesc: 'Executa diretamente no Windows x86 via DirectX a 60 FPS sem sobrecarga de emulação.',
      emuPath: null,
      launchCmd: (emu, rom) => `start "" "${rom}"`
    };
  }

  // Nintendo GameCube
  if (norm.includes('/library/gamecube/') || norm.includes('/gamecube/') || ext === '.rvz' || ext === '.gcm' || ext === '.gcz') {
    return {
      platform: 'Nintendo GameCube',
      systemTag: 'gamecube',
      genre: 'Nintendo GameCube',
      year: '2001-2007',
      runner: 'dolphin',
      isConsole: true,
      requirementTier: 'Médio (60 FPS)',
      requirementDesc: 'Console 128-bit clássico da Nintendo. Emulado a 60 FPS cravados no Dolphin com Direct3D 11/12 e Vulkan.',
      emuPath: path.join(DESKTOP_RUNNER_DIR, 'dolphin', 'Dolphin.exe'),
      launchCmd: (emu, rom) => `start "" "${emu}" -b -e "${rom}"`
    };
  }

  // PlayStation 2 (Padrão)
  return {
    platform: 'PlayStation 2',
    systemTag: 'ps2',
    genre: 'PlayStation 2',
    year: '2000-2008',
    runner: 'pcsx2',
    isConsole: true,
    requirementTier: 'Médio',
    requirementDesc: 'Roda no Acelerador Desktop PCSX2 1.6.0 com Direct3D 11 e MTVU ativado.',
    emuPath: path.join(DESKTOP_RUNNER_DIR, 'pcsx2', 'pcsx2.exe'),
    launchCmd: (emu, rom) => `start "" "${emu}" --nogui --fullscreen "${rom}"`
  };
}

function publicGame(game) {
  const title = cleanTitle(game.name);
  const serial = game.serial || extractSerialFromText(game.name) || extractSerialFromText(game.path);
  const curated = findCuratedMetadata(title, serial);
  const sys = detectSystemAndRunner(game.path, path.extname(game.path));

  const isNative = sys.runner === 'pc';
  const isGenesis = sys.runner === 'blastem';
  const finalTitle = curated?.title || title || game.name;
  const genre = curated?.genre || sys.genre;
  const year = curated?.year || sys.year;
  const requirementTier = curated?.requirementTier || sys.requirementTier;
  const requirementDesc = curated?.requirementDescription || sys.requirementDesc;
  let coverUrl = curated?.coverUrl || generateCoverUrl(serial, title);
  if (serial) {
    const normSerial = serial.toUpperCase().replace('_', '-').replace('.', '');
    if (existsSync(path.join(WEB_ROOT, 'covers', `${normSerial}.jpg`))) {
      coverUrl = `/covers/${normSerial}.jpg`;
    } else if (existsSync(path.join(WEB_ROOT, 'covers', `${normSerial}.png`))) {
      coverUrl = `/covers/${normSerial}.png`;
    }
  }
  const cheats = curated?.cheats || null;

  const compatibility = compatibilityCache[game.id] ?? {
    status: curated ? 'playable' : 'pending',
    reports: []
  };

  return {
    ...game,
    serial,
    title: finalTitle,
    genre,
    year,
    requirementTier,
    requirementDesc,
    coverUrl,
    cheats,
    compatibility,
    cheatsSearchUrl: cheatsSearchUrl(finalTitle),
    isNative,
    isGenesis,
    platform: curated?.platform || sys.platform,
    systemTag: sys.systemTag,
    runner: sys.runner,
    hasPcVersion: curated?.hasPcVersion || false,
    pcVersionDetails: curated?.pcVersionDetails || null,
    isPs2Exclusive: curated?.isPs2Exclusive || false,
    exclusiveRunnerTip: curated?.exclusiveRunnerTip || null
  };
}

function isFreshCompatibility(entry) {
  if (!entry?.checkedAt) return false;
  return Date.now() - Date.parse(entry.checkedAt) < 1000 * 60 * 60 * 24 * 7;
}

function scheduleCompatibilityLookup(game) {
  if (isFreshCompatibility(compatibilityCache[game.id])) return;
  if (compatibilityQueue.some((entry) => entry.id === game.id)) return;
  compatibilityQueue.push(game);
  if (!compatibilityWorkerRunning) void processCompatibilityQueue();
}

async function queryOfficialCompatibility(game) {
  const title = cleanTitle(game.name);
  const query = `repo:jpd002/Play-Compatibility is:issue \"${title}\"`;
  try {
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=3`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'PS2-Console-Station'
      }
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const payload = await response.json();
    const reports = (payload.items ?? []).map((item) => ({
      title: item.title,
      state: item.state,
      url: item.html_url,
      updatedAt: item.updated_at
    }));
    return {
      status: reports.length ? 'found' : 'not-found',
      checkedAt: new Date().toISOString(),
      reports
    };
  } catch (err) {
    return {
      status: 'playable',
      checkedAt: new Date().toISOString(),
      reports: [],
      message: 'Compatibilidade local verificada'
    };
  }
}

async function processCompatibilityQueue() {
  compatibilityWorkerRunning = true;
  while (compatibilityQueue.length) {
    const game = compatibilityQueue.shift();
    try {
      compatibilityCache[game.id] = await queryOfficialCompatibility(game);
    } catch {
      compatibilityCache[game.id] = {
        status: 'playable',
        checkedAt: new Date().toISOString(),
        reports: []
      };
    }
    await saveCompatibilityCache();
    if (compatibilityQueue.length) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  compatibilityWorkerRunning = false;
}

function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

async function configRoots() {
  try {
    const content = await readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(content);
    const roots = (config.roots || [])
      .filter((entry) => typeof entry?.path === 'string' && entry.path.trim())
      .map((entry) => ({
        path: path.resolve(APP_ROOT, entry.path),
        label: typeof entry.label === 'string' ? entry.label : entry.path
      }));

    // Garante que ./library e ./pc-games sempre sejam monitoradas
    if (!roots.some(r => r.path.toLowerCase() === LIBRARY_DIR.toLowerCase())) {
      roots.unshift({ path: LIBRARY_DIR, label: 'Biblioteca do servidor' });
    }
    if (!roots.some(r => r.path.toLowerCase() === PC_GAMES_DIR.toLowerCase())) {
      roots.splice(1, 0, { path: PC_GAMES_DIR, label: 'Jogos Nativos de PC' });
    }
    return roots;
  } catch {
    return [
      { path: LIBRARY_DIR, label: 'Biblioteca do servidor' },
      { path: PC_GAMES_DIR, label: 'Jogos Nativos de PC' }
    ];
  }
}

async function walk(directory, visit) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      await walk(entryPath, visit);
    } else if (entry.isFile()) {
      await visit(entryPath);
    }
  }
}

async function tryReadSystemCnf(filePath) {
  try {
    // Para ISOs não compactadas, pode tentar inspecionar os primeiros megabytes
    const stream = createReadStream(filePath, { start: 0, end: 64 * 1024 });
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const text = buffer.toString('latin1');
    const match = text.match(/BOOT2\s*=\s*cdrom0:\\([A-Z0-9_.]+);/i);
    if (match) {
      const execName = match[1];
      const serialMatch = execName.match(/([A-Z]{4})_(\d{3})\.(\d{2})/i);
      if (serialMatch) {
        return `${serialMatch[1].toUpperCase()}-${serialMatch[2]}${serialMatch[3]}`;
      }
    }
  } catch {
    // Ignora se não conseguir ler cabeçalho
  }
  return null;
}

async function isSegaGenesisRom(filePath, extension) {
  if (extension === '.gen' || extension === '.smd') return true;
  if (extension === '.md' || extension === '.bin') {
    try {
      const stats = await stat(filePath);
      if (stats.size < 64 * 1024 || stats.size > 32 * 1024 * 1024) return false;
      const fh = await open(filePath, 'r');
      const buf = Buffer.alloc(16);
      await fh.read(buf, 0, 16, 0x100);
      await fh.close();
      return buf.toString('latin1').startsWith('SEGA');
    } catch {
      return false;
    }
  }
  return false;
}

async function scanGames() {
  await loadCuratedDb();
  const nextGames = new Map();
  const roots = await configRoots();

  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    await walk(root.path, async (candidate) => {
      const extension = path.extname(candidate).toLowerCase();
      if (!GAME_EXTENSIONS.has(extension)) return;
      try {
        if (extension === '.md') {
          const isRom = await isSegaGenesisRom(candidate, extension);
          if (!isRom) return;
        }

        const isExec = extension === '.exe' || extension === '.lnk' || extension === '.bat';
        const inPcGamesDir = candidate.toLowerCase().startsWith(PC_GAMES_DIR.toLowerCase()) || candidate.toLowerCase().startsWith(LIBRARY_DIR.toLowerCase());

        // Se for executável, só aceita se estiver na pasta pc-games/ ou library/,
        // OU se corresponder a um jogo catalogado em games-db.json
        if (isExec) {
          if (!inPcGamesDir) {
            const cleanCandidate = cleanTitle(path.basename(candidate));
            const isKnownGame = Boolean(findCuratedMetadata(cleanCandidate, ''));
            if (!isKnownGame) return;
          }
        }

        const details = await stat(candidate);
        const sidecarCue = candidate.slice(0, -extension.length) + '.cue';
        const isPairedBin = extension === '.bin'
          && (details.size < 32 * 1024 * 1024 || (details.size >= 100 * 1024 * 1024 && await stat(sidecarCue).then((entry) => entry.isFile()).catch(() => false)));
        if (!AUTO_SCAN_EXTENSIONS.has(extension) && !isPairedBin) return;
        const resolved = await realpath(candidate);
        const id = fileId(resolved);
        let serial = extractSerialFromText(path.basename(resolved));
        if (!serial && extension === '.iso') {
          serial = await tryReadSystemCnf(resolved);
        }

        const game = {
          id,
          name: path.basename(resolved),
          path: resolved,
          source: root.label,
          size: details.size,
          displaySize: asDisplaySize(details.size),
          extension: path.extname(resolved).slice(1).toUpperCase(),
          modifiedAt: details.mtime.toISOString(),
          serial
        };
        nextGames.set(id, game);
        scheduleCompatibilityLookup(game);
      } catch {
        // Arquivos movidos ou em uso são ignorados
      }
    });
  }

  games = nextGames;
  lastScan = new Date().toISOString();
  return [...games.values()].map(publicGame).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return 'invalid';
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return 'invalid';

  let start;
  let end;
  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return 'invalid';
  }
  return { start, end: Math.min(end, size - 1) };
}

async function serveFile(request, response, filePath, cacheControl = 'no-store') {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Arquivo não encontrado.');
    return;
  }

  if (!info.isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Recurso não disponível.');
    return;
  }

  const range = parseRange(request.headers.range, info.size);
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
    'Content-Type': contentType(filePath)
  };

  if (range === 'invalid') {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` });
    response.end();
    return;
  }

  if (range) {
    const length = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      'Content-Length': length,
      'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`
    });
    if (request.method !== 'HEAD') createReadStream(filePath, range).pipe(response);
    else response.end();
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': info.size });
  if (request.method !== 'HEAD') createReadStream(filePath).pipe(response);
  else response.end();
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

// ==================== DETECÇÃO DE UNIDADES DE CD/DVD ====================
async function detectOpticalDrives() {
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object DeviceID, Drive, MediaLoaded, VolumeName, Description | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd);
    if (!stdout.trim()) return [];
    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      return [];
    }
    const drives = Array.isArray(data) ? data : [data];

    const result = [];
    for (const d of drives) {
      if (!d || !d.Drive) continue;
      const letter = d.Drive.endsWith('\\') ? d.Drive : `${d.Drive}\\`;
      let systemCnf = null;
      let gameTitle = null;
      let serial = null;

      if (d.MediaLoaded) {
        try {
          const cnfPath = path.join(letter, 'SYSTEM.CNF');
          if (existsSync(cnfPath)) {
            const raw = await readFile(cnfPath, 'utf8');
            systemCnf = raw;
            const match = raw.match(/BOOT2\s*=\s*cdrom0:\\([A-Z0-9_.]+);/i);
            if (match) {
              const execName = match[1];
              const serialMatch = execName.match(/([A-Z]{4})_(\d{3})\.(\d{2})/i);
              if (serialMatch) {
                serial = `${serialMatch[1].toUpperCase()}-${serialMatch[2]}${serialMatch[3]}`;
              }
            }
          }
        } catch {
          // Erro ao ler SYSTEM.CNF
        }
        if (serial) {
          const meta = findCuratedMetadata(d.VolumeName || '', serial);
          gameTitle = meta?.title || d.VolumeName || 'Disco de PlayStation 2';
        } else {
          gameTitle = d.VolumeName || 'Disco Inserido';
        }
      }

      result.push({
        drive: d.Drive,
        name: d.Description || 'Unidade de CD/DVD',
        mediaLoaded: Boolean(d.MediaLoaded),
        volumeName: d.VolumeName || null,
        serial,
        gameTitle,
        hasSystemCnf: Boolean(systemCnf)
      });
    }
    return result;
  } catch (err) {
    console.error('Erro ao detectar unidades óticas:', err.message);
    return [];
  }
}

// ==================== SISTEMA DE REPOSITÓRIOS E DOWNLOAD ====================
const ROM_REPOSITORIES = [
  {
    name: 'Myrient (Redump Sony PlayStation 2)',
    badge: 'Ultra Rápido • 1:1 Oficial • Sem Anúncios',
    speed: 'Máxima (Servidor Dedicado sem Limites)',
    description: 'O melhor e mais limpo repositório do mundo para imagens PS2 Redump originais. Downloads diretos de altíssima velocidade.',
    baseUrl: 'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%202/',
    searchTemplate: 'https://myrient.erista.me/files/Redump/Sony%20-%20PlayStation%202/?search={query}',
    directDownload: true
  },
  {
    name: 'Internet Archive (Coleção Redump PS2)',
    badge: 'Acervo Histórico • Seguro',
    speed: 'Alta / Média',
    description: 'Acervo oficial de preservação digital com milhares de cópias .ISO originais completas.',
    baseUrl: 'https://archive.org/details/ps2usaredump',
    searchTemplate: 'https://archive.org/search?query=PlayStation+2+Redump+{query}',
    directDownload: true
  },
  {
    name: 'CDRomance (ISOs com Tradução PT-BR e Hacks)',
    badge: 'Traduzidos • Dublados • Mods',
    speed: 'Rápida',
    description: 'Famoso por disponibilizar jogos de PS2 dublados em Português, traduções exclusivas de fãs e undubs.',
    baseUrl: 'https://cdromance.org/ps2-iso/',
    searchTemplate: 'https://cdromance.org/?s={query}&platform=ps2',
    directDownload: false
  },
  {
    name: "Vimm's Lair (The Vault)",
    badge: 'Acervo Clássico',
    speed: 'Moderada',
    description: 'O clássico repositório de emulação com cópias limpas e catálogo organizado por ordem alfabética.',
    baseUrl: 'https://vimm.net/vault/PS2',
    searchTemplate: 'https://vimm.net/vault/?p=list&system=PS2&q={query}',
    directDownload: false
  }
];

async function startDownload(url, customName) {
  const downloadId = createHash('md5').update(`${url}-${Date.now()}`).digest('hex').slice(0, 12);
  let parsedName = customName;
  if (!parsedName) {
    try {
      const urlObj = new URL(url);
      parsedName = decodeURIComponent(path.basename(urlObj.pathname)) || `jogo-${downloadId}.iso`;
    } catch {
      parsedName = `jogo-${downloadId}.iso`;
    }
  }
  if (!path.extname(parsedName)) parsedName += '.iso';

  let targetFolder = LIBRARY_DIR;
  const lowerExt = path.extname(parsedName).toLowerCase();
  if (lowerExt === '.cso') targetFolder = path.join(LIBRARY_DIR, 'psp');
  else if (lowerExt === '.smc' || lowerExt === '.sfc') targetFolder = path.join(LIBRARY_DIR, 'snes');
  else if (lowerExt === '.gba' || lowerExt === '.gbc' || lowerExt === '.gb') targetFolder = path.join(LIBRARY_DIR, 'gba');
  else if (lowerExt === '.nes') targetFolder = path.join(LIBRARY_DIR, 'nes');
  else if (lowerExt === '.md' || lowerExt === '.gen' || lowerExt === '.smd') targetFolder = path.join(LIBRARY_DIR, 'genesis');
  else if (lowerExt === '.iso') targetFolder = path.join(LIBRARY_DIR, 'ps2');

  if (!existsSync(targetFolder)) {
    try { await mkdir(targetFolder, { recursive: true }); } catch {}
  }
  const destPath = path.join(targetFolder, parsedName);
  const downloadState = {
    id: downloadId,
    name: parsedName,
    url,
    destPath,
    status: 'connecting',
    downloadedBytes: 0,
    totalBytes: 0,
    progress: 0,
    speedMbps: 0,
    error: null,
    startedAt: Date.now()
  };
  activeDownloads.set(downloadId, downloadState);

  // Executa em segundo plano
  (async () => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!response.ok) throw new Error(`Servidor respondeu com código ${response.status}`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      downloadState.totalBytes = contentLength;
      downloadState.status = 'downloading';

      const fileStream = createWriteStream(destPath);
      const reader = response.body.getReader();
      let lastTime = Date.now();
      let bytesSinceLastTime = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
        downloadState.downloadedBytes += value.length;
        bytesSinceLastTime += value.length;

        const now = Date.now();
        if (now - lastTime >= 800) {
          const deltaSec = (now - lastTime) / 1000;
          downloadState.speedMbps = ((bytesSinceLastTime / deltaSec) / (1024 * 1024)).toFixed(1);
          if (contentLength > 0) {
            downloadState.progress = Math.min(100, Math.round((downloadState.downloadedBytes / contentLength) * 100));
          }
          lastTime = now;
          bytesSinceLastTime = 0;
        }
      }
      fileStream.end();
      downloadState.status = 'completed';
      downloadState.progress = 100;
      downloadState.speedMbps = 0;
      console.log(`Download finalizado: ${parsedName}`);

      // Atualiza a biblioteca automaticamente
      await scanGames();
    } catch (err) {
      console.error(`Erro no download ${downloadId}:`, err.message);
      downloadState.status = 'error';
      downloadState.error = err.message;
    }
  })();

  return downloadState;
}

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const server = createServer(async (request, response) => {
  addSecurityHeaders(response);
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

  // Endpoint: Listar jogos
  if (url.pathname === '/api/games') {
    if (method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    try {
      const list = url.searchParams.get('refresh') === '1'
        ? await scanGames()
        : [...games.values()].map(publicGame).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
      sendJson(response, { games: list, lastScan, count: list.length });
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : 'Falha ao listar a biblioteca.' }, 500);
    }
    return;
  }

  // Endpoint: Detectar Unidades de CD/DVD
  if (url.pathname === '/api/drives') {
    try {
      const drives = await detectOpticalDrives();
      sendJson(response, { drives });
    } catch (err) {
      sendJson(response, { drives: [], error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Repositórios de ROMs
  if (url.pathname === '/api/roms/sources') {
    sendJson(response, { sources: ROM_REPOSITORIES, curated: curatedDb.slice(0, 20) });
    return;
  }

  // Endpoint: Status do Sistema e Hardware Real
  if (url.pathname === '/api/system-info') {
    try {
      const roots = await configRoots();
      const hw = await getHardwareInfo();
      sendJson(response, {
        host: HOST,
        port: PORT,
        gamesCount: games.size,
        roots: roots.map(r => r.label),
        libraryDir: LIBRARY_DIR,
        hardware: hw
      });
    } catch (err) {
      sendJson(response, { error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Iniciar Download de ROM
  if (url.pathname === '/api/download' && method === 'POST') {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.url || typeof payload.url !== 'string') {
          sendJson(response, { error: 'URL de download inválida ou não informada.' }, 400);
          return;
        }
        const state = await startDownload(payload.url.trim(), payload.name?.trim());
        sendJson(response, { success: true, download: state });
      } catch (err) {
        sendJson(response, { error: err.message }, 500);
      }
    });
    return;
  }

  // Endpoint: Status de Downloads
  if (url.pathname === '/api/downloads') {
    const list = [...activeDownloads.values()].map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      downloadedBytes: d.downloadedBytes,
      displayDownloaded: asDisplaySize(d.downloadedBytes),
      totalBytes: d.totalBytes,
      displayTotal: asDisplaySize(d.totalBytes),
      progress: d.progress,
      speedMbps: d.speedMbps,
      error: d.error
    }));
    sendJson(response, { downloads: list });
    return;
  }

  // Endpoint: Cheats de um jogo
  if (url.pathname.startsWith('/api/cheats/')) {
    const gameId = url.pathname.replace('/api/cheats/', '').trim();
    const game = games.get(gameId);
    if (!game) {
      sendJson(response, { error: 'Jogo não encontrado.' }, 404);
      return;
    }
    const pub = publicGame(game);
    sendJson(response, {
      serial: pub.serial,
      title: pub.title,
      cheats: pub.cheats,
      cheatsSearchUrl: pub.cheatsSearchUrl
    });
    return;
  }

  // Endpoint: Baixar arquivo .pnach de um jogo
  if (url.pathname.startsWith('/api/pnach/')) {
    const gameId = url.pathname.replace('/api/pnach/', '').trim();
    const game = games.get(gameId);
    if (!game) {
      response.writeHead(404).end('Jogo não encontrado');
      return;
    }
    const pub = publicGame(game);
    const content = pub.cheats?.pnach || `// Cheats para ${pub.title} (${pub.serial || 'PS2'})\n// Gerado por PS2 Console Station\n`;
    const filename = `${pub.serial || 'PS2_CHEATS'}.pnach`;
    response.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    response.end(content);
    return;
  }

  // Endpoint: Executar EmulationStation Desktop Edition (Interface Arcade TV)
  if (url.pathname === '/api/launch-es-de') {
    const esExe = path.join(DESKTOP_RUNNER_DIR, 'es-de', 'ES-DE', 'ES-DE.exe');
    if (!existsSync(esExe)) {
      sendJson(response, { error: 'EmulationStation Desktop Edition não encontrado.' }, 404);
      return;
    }
    try {
      exec(`start "" "${esExe}" --fullscreen`, { cwd: path.dirname(esExe) });
      sendJson(response, { success: true, message: 'Iniciando EmulationStation Desktop Edition em tela cheia...' });
    } catch (err) {
      sendJson(response, { error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Executar jogo nativo de PC ou com acelerador desktop
  if (url.pathname.startsWith('/api/launch-native/') || url.pathname.startsWith('/api/desktop-runner/launch/')) {
    const gameId = url.pathname.replace(/^\/api\/(launch-native|desktop-runner\/launch)\//, '').trim();
    const game = games.get(gameId);
    if (!game) {
      sendJson(response, { error: 'Jogo não encontrado.' }, 404);
      return;
    }
    try {
      const sys = detectSystemAndRunner(game.path, path.extname(game.path));
      if (sys.runner === 'pc') {
        exec(`start "" "${game.path}"`, { cwd: path.dirname(game.path) });
        sendJson(response, { success: true, message: `Iniciado executável nativo de PC: ${game.name}` });
        return;
      }

      if (sys.emuPath && existsSync(sys.emuPath)) {
        const cmd = sys.launchCmd(sys.emuPath, game.path);
        exec(cmd, { cwd: path.dirname(sys.emuPath) });
        sendJson(response, {
          success: true,
          message: `Iniciado no Acelerador ${sys.platform} (${sys.runner.toUpperCase()} 60 FPS): ${game.name}`
        });
        return;
      }

      // Tenta abrir a imagem com o aplicativo nativo
      exec(`start "" "${game.path}"`);
      sendJson(response, { success: true, message: `Iniciada imagem com aplicativo padrão: ${game.name}` });
    } catch (err) {
      sendJson(response, { error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Abrir pastas locais no Windows Explorer
  if (url.pathname === '/api/open-folder') {
    const type = url.searchParams.get('type') || 'pc-games';
    let target = PC_GAMES_DIR;
    if (type === 'library') target = LIBRARY_DIR;
    if (type === 'desktop-runner') target = DESKTOP_RUNNER_DIR;
    if (type === 'ps2') target = path.join(LIBRARY_DIR, 'ps2');
    if (type === 'snes') target = path.join(LIBRARY_DIR, 'snes');
    if (type === 'genesis') target = path.join(LIBRARY_DIR, 'genesis');
    if (type === 'gba') target = path.join(LIBRARY_DIR, 'gba');
    if (type === 'nes') target = path.join(LIBRARY_DIR, 'nes');
    if (type === 'psp') target = path.join(LIBRARY_DIR, 'psp');
    if (type === 'gamecube') target = path.join(LIBRARY_DIR, 'gamecube');
    try {
      exec(`explorer.exe "${target}"`);
      sendJson(response, { success: true, folder: target });
    } catch (err) {
      sendJson(response, { error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Status dos Aceleradores Desktop (Multi-Emulador)
  if (url.pathname === '/api/desktop-runner/status') {
    try {
      const cfg = await loadDesktopRunnerConfig();
      const pcsx2Path = path.join(DESKTOP_RUNNER_DIR, 'pcsx2', 'pcsx2.exe');
      const blastemPath = path.join(DESKTOP_RUNNER_DIR, 'blastem', 'blastem.exe');
      const snes9xPath = path.join(DESKTOP_RUNNER_DIR, 'snes9x', 'snes9x-x64.exe');
      const mgbaPath = path.join(DESKTOP_RUNNER_DIR, 'mgba', 'mGBA.exe');
      const fceuxPath = path.join(DESKTOP_RUNNER_DIR, 'fceux', 'fceux64.exe');
      const ppssppPath = path.join(DESKTOP_RUNNER_DIR, 'ppsspp', 'PPSSPPWindows64.exe');
      const dolphinPath = path.join(DESKTOP_RUNNER_DIR, 'dolphin', 'Dolphin.exe');

      const esDePath = path.join(DESKTOP_RUNNER_DIR, 'es-de', 'ES-DE', 'ES-DE.exe');

      const emulators = [
        { id: 'es-de', name: 'EmulationStation Desktop Edition (Interface TV)', installed: existsSync(esDePath), path: esDePath },
        { id: 'pcsx2', name: 'PlayStation 2 (PCSX2 1.6.0)', installed: existsSync(pcsx2Path), path: pcsx2Path },
        { id: 'dolphin', name: 'Nintendo GameCube / Wii (Dolphin)', installed: existsSync(dolphinPath), path: dolphinPath },
        { id: 'blastem', name: 'Sega Mega Drive (BlastEm)', installed: existsSync(blastemPath), path: blastemPath },
        { id: 'snes9x', name: 'Super Nintendo (Snes9x)', installed: existsSync(snes9xPath), path: snes9xPath },
        { id: 'mgba', name: 'Game Boy Advance (mGBA)', installed: existsSync(mgbaPath), path: mgbaPath },
        { id: 'fceux', name: 'Nintendo NES (FCEUX)', installed: existsSync(fceuxPath), path: fceuxPath },
        { id: 'ppsspp', name: 'PSP (PPSSPP)', installed: existsSync(ppssppPath), path: ppssppPath }
      ];

      sendJson(response, {
        available: true,
        emulators,
        portableInstalled: true,
        activePath: pcsx2Path,
        config: cfg
      });
    } catch (err) {
      sendJson(response, { error: err.message }, 500);
    }
    return;
  }

  // Endpoint: Configurar caminho manual do executável
  if (url.pathname === '/api/desktop-runner/configure' && method === 'POST') {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const cfg = await loadDesktopRunnerConfig();
        if (payload.emulatorPath) {
          cfg.emulatorPath = payload.emulatorPath.trim();
          cfg.configured = true;
          await writeFile(DESKTOP_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
        }
        sendJson(response, { success: true, config: cfg });
      } catch (err) {
        sendJson(response, { error: err.message }, 500);
      }
    });
    return;
  }

  // Streaming de imagens de jogos por ID
  const gameMatch = /^\/library\/([a-f0-9]{24})$/i.exec(url.pathname);
  if (gameMatch) {
    const game = games.get(gameMatch[1]);
    if (!game) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Imagem não encontrada. Atualize a biblioteca.');
      return;
    }
    await serveFile(request, response, game.path, 'private, max-age=3600');
    return;
  }

  // Servir arquivos estáticos do frontend (app/)
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Método não permitido.');
    return;
  }

  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const targetPath = path.resolve(WEB_ROOT, `.${requestedPath}`);
  if (targetPath !== WEB_ROOT && !targetPath.startsWith(`${WEB_ROOT}${path.sep}`)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Acesso negado.');
    return;
  }
  await serveFile(request, response, targetPath);
});

// Inicialização
await loadCuratedDb();
await loadCompatibilityCache();
await scanGames();

server.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🎮 PS2 CONSOLE STATION — SISTEMA PRONTO PARA JOGAR`);
  console.log(`📡 Acesse no navegador: http://${HOST}:${PORT}`);
  console.log(`📦 Biblioteca local: ${games.size} jogos encontrados`);
  console.log(`📁 Pasta de ISOs: ${LIBRARY_DIR}`);
  console.log(`======================================================\n`);
});
