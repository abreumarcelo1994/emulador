// ==========================================================================
// PS2 CONSOLE STATION — ENGINE & CLIENT CONTROLLER (LAYOUT OTIMIZADO)
// ==========================================================================
import Play from './Play.js';

if (typeof window !== 'undefined') {
  window.Play = Play;
}

// ==================== DISC DEVICE STREAMER (RANGE REQUESTS) ====================
class DiscImageDevice {
  constructor(module) {
    this.module = module;
    this.doneFlag = false;
    this.file = null;
  }

  read(destinationPointer, offset, size) {
    if (!this.file) throw new Error('Nenhuma imagem selecionada.');
    this.doneFlag = false;
    this.file.slice(offset, offset + size).arrayBuffer().then((value) => {
      this.module.HEAPU8.set(new Uint8Array(value), destinationPointer);
      this.doneFlag = true;
    }).catch((error) => {
      console.error('Falha ao ler bloco da imagem:', error);
      this.doneFlag = true;
    });
  }

  getFileSize() {
    if (!this.file) throw new Error('Nenhuma imagem selecionada.');
    return this.file.size;
  }

  isDone() {
    return this.doneFlag;
  }

  setFile(file) {
    this.file = file;
  }
}

class RemoteDiscImage {
  constructor(game) {
    this.name = game.name;
    this.size = game.size;
    this.url = `/library/${game.id}`;
    this.chunkSize = 128 * 1024; // 128 KB por chunk (64 setores CD/DVD)
    this.cache = new Map(); // chunkIndex -> Uint8Array
    this.maxCachedChunks = 512; // 64 MB de cache veloz em RAM
    this.pendingFetches = new Map();
  }

  async getChunk(chunkIndex) {
    if (this.cache.has(chunkIndex)) {
      const data = this.cache.get(chunkIndex);
      this.cache.delete(chunkIndex);
      this.cache.set(chunkIndex, data);
      return data;
    }

    if (this.pendingFetches.has(chunkIndex)) {
      return this.pendingFetches.get(chunkIndex);
    }

    const start = chunkIndex * this.chunkSize;
    if (start >= this.size) {
      return new Uint8Array(0);
    }
    const end = Math.min(start + this.chunkSize, this.size);

    const fetchPromise = (async () => {
      try {
        const response = await fetch(this.url, {
          headers: { Range: `bytes=${start}-${end - 1}` }
        });
        if (!response.ok && response.status !== 206) {
          throw new Error(`Falha no streaming do bloco ${chunkIndex} (${response.status}).`);
        }
        const buffer = await response.arrayBuffer();
        const u8 = new Uint8Array(buffer);

        if (this.cache.size >= this.maxCachedChunks) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
        this.cache.set(chunkIndex, u8);

        // Previsão sequencial (Read-Ahead): Pré-carrega o bloco seguinte
        const nextIndex = chunkIndex + 1;
        if (!this.cache.has(nextIndex) && !this.pendingFetches.has(nextIndex) && (nextIndex * this.chunkSize < this.size)) {
          this.prefetchChunk(nextIndex);
        }

        return u8;
      } finally {
        this.pendingFetches.delete(chunkIndex);
      }
    })();

    this.pendingFetches.set(chunkIndex, fetchPromise);
    return fetchPromise;
  }

  prefetchChunk(chunkIndex) {
    const start = chunkIndex * this.chunkSize;
    if (start >= this.size) return;
    const end = Math.min(start + this.chunkSize, this.size);

    const promise = fetch(this.url, {
      headers: { Range: `bytes=${start}-${end - 1}` }
    }).then(res => {
      if (res.ok || res.status === 206) return res.arrayBuffer();
      return null;
    }).then(buf => {
      if (buf) {
        if (this.cache.size >= this.maxCachedChunks) {
          const oldestKey = this.cache.keys().next().value;
          this.cache.delete(oldestKey);
        }
        this.cache.set(chunkIndex, new Uint8Array(buf));
      }
    }).catch(() => {}).finally(() => {
      this.pendingFetches.delete(chunkIndex);
    });

    this.pendingFetches.set(chunkIndex, promise);
  }

  slice(start, end) {
    const safeStart = Math.max(0, Math.min(start, this.size));
    const safeEnd = Math.max(safeStart, Math.min(end, this.size));
    const length = safeEnd - safeStart;

    if (length <= 0) {
      return { arrayBuffer: async () => new ArrayBuffer(0) };
    }

    return {
      arrayBuffer: async () => {
        const startChunk = Math.floor(safeStart / this.chunkSize);
        const endChunk = Math.floor((safeEnd - 1) / this.chunkSize);

        if (startChunk === endChunk) {
          const chunk = await this.getChunk(startChunk);
          const offsetInChunk = safeStart - (startChunk * this.chunkSize);
          const sub = chunk.subarray(offsetInChunk, offsetInChunk + length);
          return sub.slice().buffer;
        }

        const out = new Uint8Array(length);
        let bytesWritten = 0;
        for (let c = startChunk; c <= endChunk; c++) {
          const chunk = await this.getChunk(c);
          const chunkStartByte = c * this.chunkSize;
          const readStart = Math.max(safeStart, chunkStartByte);
          const readEnd = Math.min(safeEnd, chunkStartByte + chunk.byteLength);
          const sliceLen = readEnd - readStart;
          if (sliceLen > 0) {
            const offsetInChunk = readStart - chunkStartByte;
            out.set(chunk.subarray(offsetInChunk, offsetInChunk + sliceLen), bytesWritten);
            bytesWritten += sliceLen;
          }
        }
        return out.buffer;
      }
    };
  }
}

// ==================== HARDWARE DETECTOR & OPTIMIZATION ENGINE ====================
class HardwareProfiler {
  constructor() {
    this.cores = navigator.hardwareConcurrency || 4;
    this.ramGb = navigator.deviceMemory || 4;
    this.cpuModel = '';
    this.gpuRenderer = this.detectGpu();
    this.isLegacyHardware = false;
    this.diagnosisMessage = 'Analisando hardware...';
    this.score = 35; // Cauteloso por padrão para evitar travamentos
    this.activePreset = 'eco';
    this.resolutionScale = 0.75;
    this.frameSkip = 1;
    this.pixelated = true;
    this.autoPause = true;

    this.recalculateAndApply();
  }

  detectGpu() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return 'Gráficos de Software / Genérico';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        return gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'Acelerador WebGL';
      }
      return 'WebGL Compatível';
    } catch {
      return 'Desconhecido';
    }
  }

  applyServerHardware(hw) {
    if (!hw) return;
    if (hw.cpu) this.cpuModel = hw.cpu;
    if (hw.gpu) this.gpuRenderer = hw.gpu;
    if (hw.cores) this.cores = hw.cores;
    if (hw.ramGb) this.ramGb = hw.ramGb;

    this.recalculateAndApply();
  }

  recalculateAndApply() {
    this.score = this.calculateScore();
    if (this.isWeakHardware()) {
      this.applyPreset('eco');
    } else {
      this.applyPreset('balanced');
    }
  }

  calculateScore() {
    const cpuLower = (this.cpuModel || '').toLowerCase();
    const gpuLower = (this.gpuRenderer || '').toLowerCase();

    // Detecção cirúrgica de processadores antigos/legados
    // (Intel 1ª a 4ª geração, Sandy Bridge i7-2xxx, Ivy Bridge, Core 2, Celeron, Pentium, AMD FX)
    const isLegacyCpu = cpuLower.includes('2670') || cpuLower.includes('2630') || cpuLower.includes('2600') ||
                        cpuLower.includes('-2') || cpuLower.includes('2nd') ||
                        cpuLower.includes('-3') || cpuLower.includes('3rd') ||
                        cpuLower.includes('-4') || cpuLower.includes('4th') ||
                        cpuLower.includes('core(tm) 2') || cpuLower.includes('celeron') ||
                        cpuLower.includes('pentium') || cpuLower.includes('athlon') ||
                        cpuLower.includes('phenom') || cpuLower.includes('fx-');

    // Detecção específica de chips gráficos integrados legados
    const isLegacyGpu = gpuLower.includes('hd graphics 3000') || gpuLower.includes('hd graphics 2000') ||
                        gpuLower.includes('hd graphics 4000') || gpuLower.includes('hd graphics 2500') ||
                        gpuLower.includes('hd 3000') || gpuLower.includes('hd 2000') ||
                        gpuLower.includes('llvmpipe') || gpuLower.includes('software') ||
                        gpuLower.includes('microsoft basic');

    const isModernDedicatedGpu = gpuLower.includes('rtx') || gpuLower.includes('gtx 16') ||
                                 gpuLower.includes('gtx 10') || gpuLower.includes('radeon rx') ||
                                 gpuLower.includes('apple');

    if (isLegacyGpu || isLegacyCpu) {
      this.isLegacyHardware = true;
      this.diagnosisMessage = '⚠️ Seu PC possui um processador legado (Intel Core 2ª Geração / 2011) e vídeo integrado HD 3000. Embora tenha 8 threads e 16 GB de RAM (ótimo para jogos nativos de PC e Windows), a emulação de PS2 em WebAssembly exige alto IPC de núcleo único. Ativamos o Modo Otimizado com Frame Skip 1 para não travar!';
      return 35; // Modesto / Legado
    }

    if (gpuLower.includes('intel') || gpuLower.includes('uhd') || gpuLower.includes('vega 3') || gpuLower.includes('vega 6')) {
      this.isLegacyHardware = true;
      this.diagnosisMessage = 'Vídeo Integrado detectado. Modo econômico recomendado para evitar sobrecarga e manter 60 FPS.';
      return 45;
    }

    if (isModernDedicatedGpu && this.cores >= 6) {
      this.isLegacyHardware = false;
      this.diagnosisMessage = 'Placa de vídeo dedicada moderna detectada: Pronto para 60 FPS com filtros de alta qualidade!';
      return 85;
    }

    this.isLegacyHardware = false;
    this.diagnosisMessage = 'Hardware intermediário: Desempenho equilibrado.';
    return 65;
  }

  isWeakHardware() {
    return this.score < 55 || this.isLegacyHardware;
  }

  getTierName() {
    if (this.isLegacyHardware || this.score < 50) {
      return 'Modesto / Legado (Otimização Máxima Obrigatória)';
    }
    if (this.score < 75) {
      return 'Equilibrado / PC Médio (Desempenho Bom)';
    }
    return 'Alto Desempenho / PC Gamer';
  }

  applyPreset(presetKey) {
    this.activePreset = presetKey;
    if (presetKey === 'potato') {
      this.resolutionScale = 0.5;
      this.frameSkip = 2;
      this.pixelated = true;
    } else if (presetKey === 'eco') {
      this.resolutionScale = 0.75;
      this.frameSkip = 1;
      this.pixelated = true;
    } else if (presetKey === 'balanced') {
      this.resolutionScale = 1.0;
      this.frameSkip = 0;
      this.pixelated = false;
    } else if (presetKey === 'hd') {
      this.resolutionScale = 1.0;
      this.frameSkip = 0;
      this.pixelated = false;
    }
  }
}

// ==================== EFEITOS SONOROS RETRÔ (LIMIAR DE DOHERTY: < 10ms) ====================
class SoundFX {
  static ctx = null;

  static init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  static playHover() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.025, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.035);
    } catch {}
  }

  static playSelect() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.08); // C6
      gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {}
  }

  static playBlip() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.04); // A5
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {}
  }
}

// ==================== TOAST NOTIFICATION FLUTUANTE ====================
function showToast(message, duration = 3500) {
  const el = document.getElementById('toastNotification');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

// ==================== ESTADO DA APLICAÇÃO ====================
const state = {
  games: [],
  filteredGames: [],
  activeTab: 'optimization',
  activeGame: null,
  featuredGame: null,
  profiler: new HardwareProfiler(),
  playModule: null,
  runtimeInitialized: false,
  gameRunning: false,
  isPaused: false,
  opticalDrives: [],
  fpsInterval: null,
  downloadsInterval: null,
  selectedGenre: 'all'
};

// ==================== ELEMENTOS DO DOM ====================
const dom = {
  // Hero Showcase ("Continuar Jogando")
  heroShowcase: document.getElementById('heroShowcase'),
  heroGameTitle: document.getElementById('heroGameTitle'),
  heroGameDesc: document.getElementById('heroGameDesc'),
  heroCoverImg: document.getElementById('heroCoverImg'),
  heroBackdrop: document.getElementById('heroBackdrop'),
  heroSystemBadge: document.getElementById('heroSystemBadge'),
  heroFpsBadge: document.getElementById('heroFpsBadge'),
  btnHeroPlay: document.getElementById('btnHeroPlay'),
  btnHeroDetails: document.getElementById('btnHeroDetails'),
  btnHeroFolder: document.getElementById('btnHeroFolder'),

  // Tabs & Nav
  tabBtns: document.querySelectorAll('.tool-tab-btn, .tab-btn'),
  views: {
    optimization: document.getElementById('viewOptimization'),
    drive: document.getElementById('viewDrive'),
    roms: document.getElementById('viewRoms'),
    cheats: document.getElementById('viewCheats'),
    controls: document.getElementById('viewControls')
  },
  gameCountBadge: document.getElementById('gameCountBadge'),
  driveStatusDot: document.getElementById('driveStatusDot'),
  systemHealthDot: document.getElementById('systemHealthDot'),
  systemProfileText: document.getElementById('systemProfileText'),

  // Player Elements (Modal Theatre WebAssembly)
  webPlayerModal: document.getElementById('webPlayerModal'),
  theatreCoverArt: document.getElementById('theatreCoverArt'),
  btnCloseTheatre: document.getElementById('btnCloseTheatre'),
  playerContainer: document.getElementById('playerContainer'),
  outputCanvas: document.getElementById('outputCanvas'),
  canvasWrap: document.getElementById('canvasWrap'),
  canvasMessage: document.getElementById('canvasMessage'),
  canvasStatusText: document.getElementById('canvasStatusText'),
  canvasSubText: document.getElementById('canvasSubText'),
  standbyQuickActions: document.getElementById('standbyQuickActions'),
  nowPlayingTitle: document.getElementById('nowPlayingTitle'),
  nowPlayingTier: document.getElementById('nowPlayingTier'),
  playerResolutionBadge: document.getElementById('playerResolutionBadge'),
  playerFrameSkipBadge: document.getElementById('playerFrameSkipBadge'),
  fpsDisplay: document.getElementById('fpsDisplay'),

  // Player Controls
  btnTogglePlay: document.getElementById('btnTogglePlay'),
  btnResetGame: document.getElementById('btnResetGame'),
  btnToggleEcoMode: document.getElementById('btnToggleEcoMode'),
  btnEcoStatus: document.getElementById('btnEcoStatus'),
  btnWidescreenToggle: document.getElementById('btnWidescreenToggle'),
  btnScreenshot: document.getElementById('btnScreenshot'),
  btnFullscreen: document.getElementById('btnFullscreen'),
  btnExitPlayer: document.getElementById('btnExitPlayer'),

  // Catalog & Search
  gameGrid: document.getElementById('gameGrid'),
  btnCarouselPrev: document.getElementById('btnCarouselPrev'),
  btnCarouselNext: document.getElementById('btnCarouselNext'),
  librarySearch: document.getElementById('librarySearch'),
  genreChips: document.querySelectorAll('.console-chip, .genre-chip'),
  manualFilePicker: document.getElementById('manualFilePicker'),
  btnRefreshLibrary: document.getElementById('btnRefreshLibrary'),
  btnOpenPcFolder: document.getElementById('btnOpenPcFolder'),
  btnOpenLibraryFolder: document.getElementById('btnOpenLibraryFolder'),
  btnLaunchEsDe: document.getElementById('btnLaunchEsDe'),
  btnLaunchEsDeCatalog: document.getElementById('btnLaunchEsDeCatalog'),

  // Drive View
  driveDeviceName: document.getElementById('driveDeviceName'),
  driveMediaStatus: document.getElementById('driveMediaStatus'),
  btnCheckDrive: document.getElementById('btnCheckDrive'),
  btnPlayDriveDisc: document.getElementById('btnPlayDriveDisc'),

  // Optimization View
  specCores: document.getElementById('specCores'),
  specRam: document.getElementById('specRam'),
  specGpu: document.getElementById('specGpu'),
  specTierRating: document.getElementById('specTierRating'),
  hardwareDiagnosisBox: document.getElementById('hardwareDiagnosisBox'),
  hardwareDiagnosisText: document.getElementById('hardwareDiagnosisText'),
  btnBenchmarkRedetect: document.getElementById('btnBenchmarkRedetect'),
  presetCards: document.querySelectorAll('.preset-card'),
  sliderResolution: document.getElementById('sliderResolution'),
  sliderResLabel: document.getElementById('sliderResLabel'),
  sliderFrameSkip: document.getElementById('sliderFrameSkip'),
  sliderSkipLabel: document.getElementById('sliderSkipLabel'),
  checkPixelated: document.getElementById('checkPixelated'),
  checkAutoPause: document.getElementById('checkAutoPause'),

  // ROMs View
  downloaderForm: document.getElementById('downloaderForm'),
  downloadUrlInput: document.getElementById('downloadUrlInput'),
  downloadNameInput: document.getElementById('downloadNameInput'),
  downloadsProgressContainer: document.getElementById('downloadsProgressContainer'),
  romSourcesGrid: document.getElementById('romSourcesGrid'),

  // Cheats View
  cheatGameSelect: document.getElementById('cheatGameSelect'),
  cheatCodeDisplay: document.getElementById('cheatCodeDisplay'),
  btnCopyPnach: document.getElementById('btnCopyPnach'),
  btnDownloadPnach: document.getElementById('btnDownloadPnach'),
  btnOpenGameHacking: document.getElementById('btnOpenGameHacking'),

  // Gamepad View
  gamepadDetectedBadge: document.getElementById('gamepadDetectedBadge'),
  gamepadVisualButtons: document.getElementById('gamepadVisualButtons'),

  // Modal
  gameModalBackdrop: document.getElementById('gameModalBackdrop'),
  modalGameTitle: document.getElementById('modalGameTitle'),
  modalGameSerial: document.getElementById('modalGameSerial'),
  modalGameCover: document.getElementById('modalGameCover'),
  modalGameGenre: document.getElementById('modalGameGenre'),
  modalGameYear: document.getElementById('modalGameYear'),
  modalGameTier: document.getElementById('modalGameTier'),
  modalGameDesc: document.getElementById('modalGameDesc'),
  modalGameOptimTip: document.getElementById('modalGameOptimTip'),
  modalNativePcBox: document.getElementById('modalNativePcBox'),
  modalNativePcDesc: document.getElementById('modalNativePcDesc'),
  modalNativePcButtons: document.getElementById('modalNativePcButtons'),
  btnModalLaunchDesktop: document.getElementById('btnModalLaunchDesktop'),
  btnModalClose: document.getElementById('btnModalClose'),
  btnModalPlay: document.getElementById('btnModalPlay'),
  btnModalCheats: document.getElementById('btnModalCheats'),

  // Desktop Runner Modal & RetroPie
  desktopRunnerModal: document.getElementById('desktopRunnerModal'),
  btnRunnerModalClose: document.getElementById('btnRunnerModalClose'),
  btnOpenEmulatorsModal: document.getElementById('btnOpenEmulatorsModal'),
  emulatorsStatusList: document.getElementById('emulatorsStatusList'),
  btnOpenLibraryFolderModal: document.getElementById('btnOpenLibraryFolderModal'),
  runnerPathInput: document.getElementById('runnerPathInput'),
  btnSaveRunnerPath: document.getElementById('btnSaveRunnerPath'),
  btnOpenRunnerFolder: document.getElementById('btnOpenRunnerFolder')
};

// ==================== INICIALIZAÇÃO DO RUNTIME PLAY! WASM ====================
async function initializeEmulatorRuntime() {
  if (state.runtimeInitialized) return state.playModule;

  const playFn = typeof Play === 'function' ? Play : (typeof window !== 'undefined' ? window.Play : null);
  if (typeof playFn !== 'function') {
    throw new Error('O runtime WebAssembly Play!.js não pôde ser instanciado.');
  }

  const baseUrl = new URL('./', window.location.href).href;
  state.playModule = await playFn({
    canvas: dom.outputCanvas,
    locateFile: (file) => new URL(file, baseUrl).href,
    mainScriptUrlOrBlob: new URL('Play.js', baseUrl).href
  });

  state.playModule.FS.mkdir('/work');
  state.playModule.discImageDevice = new DiscImageDevice(state.playModule);
  state.playModule.ccall('initVm', '', [], []);
  state.runtimeInitialized = true;

  if (!state.fpsInterval) {
    state.fpsInterval = window.setInterval(() => {
      if (!state.playModule || !state.gameRunning) return;
      try {
        const frames = state.playModule.getFrames();
        state.playModule.clearStats();
        dom.fpsDisplay.textContent = `${frames} fps`;
        if (frames < 35 && state.profiler.activePreset !== 'eco') {
          dom.fpsDisplay.style.color = '#f87171';
        } else {
          dom.fpsDisplay.style.color = '#4ade80';
        }
      } catch {}
    }, 1000);
  }

  return state.playModule;
}

// ==================== INICIAÇÃO DO JOGO NO PLAYER ====================
async function launchGame(imageOrGame) {
  try {
    SoundFX.playSelect();
    const ext = (imageOrGame.extension || '').toUpperCase();
    const isDirectLaunch = imageOrGame.isNative ||
      (imageOrGame.systemTag && imageOrGame.systemTag !== 'ps2') ||
      imageOrGame.isGenesis ||
      ['MD', 'GEN', 'SMD', 'SMC', 'SFC', 'GBA', 'GBC', 'GB', 'NES', 'EXE', 'LNK', 'BAT', 'RVZ', 'GCM', 'GCZ'].includes(ext);

    if (imageOrGame && !(imageOrGame instanceof File)) {
      updateHeroShowcase(imageOrGame);
    }

    if (imageOrGame && !(imageOrGame instanceof File) && isDirectLaunch) {
      const platformName = imageOrGame.platform || 'Console';
      showToast(`🚀 Iniciando ${imageOrGame.title || imageOrGame.name} a 60 FPS (${platformName})...`, 4500);
      dom.canvasMessage.hidden = false;
      dom.canvasStatusText.textContent = `Iniciando ${imageOrGame.title || imageOrGame.name}...`;
      dom.canvasSubText.textContent = `Executando no Acelerador ${platformName} a 60 FPS com aceleração Direct3D / OpenGL no Windows.`;
      const res = await fetch(`/api/launch-native/${imageOrGame.id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao iniciar jogo.');
      dom.canvasStatusText.textContent = 'Jogo em Execução';
      dom.canvasSubText.textContent = `O jogo foi aberto com sucesso (${platformName}) a 60 FPS com áudio perfeito e sem travamentos.`;
      return;
    }

    if (dom.webPlayerModal) dom.webPlayerModal.hidden = false;
    showToast('🎮 Carregando máquina virtual PlayStation 2...', 3500);
    dom.canvasMessage.hidden = false;
    dom.canvasStatusText.textContent = 'Preparando máquina virtual...';
    dom.canvasSubText.textContent = 'Configurando aceleração gráfica e streaming...';

    applyGraphicsToCanvas();

    const module = await initializeEmulatorRuntime();

    let imageDeviceTarget = null;
    let fileName = '';
    let gameTitle = '';
    let tier = 'Médio';

    if (imageOrGame instanceof File) {
      imageDeviceTarget = imageOrGame;
      fileName = imageOrGame.name;
      gameTitle = fileName.replace(/\.[^/.]+$/, "");
    } else {
      imageDeviceTarget = new RemoteDiscImage(imageOrGame);
      fileName = imageOrGame.name;
      gameTitle = imageOrGame.title || imageOrGame.name;
      tier = imageOrGame.requirementTier || 'Médio';
    }

    dom.nowPlayingTitle.textContent = gameTitle;
    dom.nowPlayingTier.textContent = tier;
    dom.nowPlayingTier.className = `now-playing-tier tier-${tier.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
    if (dom.theatreCoverArt) {
      dom.theatreCoverArt.src = (imageOrGame && imageOrGame.coverUrl) ? imageOrGame.coverUrl : '/covers/ps2_default.jpg';
    }

    dom.canvasStatusText.textContent = `Carregando ${gameTitle}...`;
    dom.canvasSubText.textContent = 'Inicializando subsistemas MIPS R5900, VU0/VU1 e sintetizador gráfico GS...';

    const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (extension === '.elf') {
      const buffer = await (imageOrGame instanceof File ? imageOrGame.arrayBuffer() : imageDeviceTarget.slice(0, imageOrGame.size).arrayBuffer());
      const data = new Uint8Array(buffer);
      const stream = module.FS.open(fileName, 'w+');
      module.FS.write(stream, data, 0, data.length, 0);
      module.FS.close(stream);
      module.bootElf(fileName);
    } else {
      module.discImageDevice.setFile(imageDeviceTarget);
      module.bootDiscImage(fileName);
    }

    state.gameRunning = true;
    state.isPaused = false;
    dom.canvasMessage.hidden = true;
    applyGraphicsToCanvas();
    dom.outputCanvas.focus();
  } catch (error) {
    console.error('Falha ao iniciar jogo:', error);
    dom.canvasStatusText.textContent = 'Erro ao inicializar o jogo';
    dom.canvasSubText.textContent = error.message || 'Verifique se a imagem ISO é válida.';
  }
}

function stopCurrentGame() {
  state.gameRunning = false;
  dom.canvasMessage.hidden = false;
  dom.canvasStatusText.textContent = 'Pronto para Jogar';
  dom.canvasSubText.textContent = 'Selecione um jogo na biblioteca ao lado ou abra uma ISO no botão do topo.';
  dom.nowPlayingTitle.textContent = 'Nenhum Jogo em Execução';
  dom.nowPlayingTier.textContent = 'Standby';
  dom.fpsDisplay.textContent = '-- fps';
}

// ==================== AJUSTE E ESCALA DO VÍDEO (SEM CORTES) ====================
function resizeCanvasDisplay() {
  const wrap = dom.canvasWrap;
  if (!wrap) return;
  const wrapW = wrap.clientWidth;
  const wrapH = wrap.clientHeight;
  if (!wrapW || !wrapH) return;

  const isWide = wrap.classList.contains('widescreen-mode');
  const targetRatio = isWide ? (16 / 9) : (4 / 3);
  const scale = state.profiler.resolutionScale || 1.0;

  // Calcula dimensões máximas que cabem dentro do container respeitando a proporção exata
  let dispW, dispH;
  if (wrapW / wrapH > targetRatio) {
    dispH = wrapH;
    dispW = wrapH * targetRatio;
  } else {
    dispW = wrapW;
    dispH = wrapW / targetRatio;
  }

  // Se a escala for menor que 1.0x (ex: 0.5x ou 0.75x para PC Fraco / Batata),
  // ajustamos a exibição proporcionalmente para reduzir fillrate sem cortar nada
  if (scale < 1.0) {
    dispW *= scale;
    dispH *= scale;
  }

  dom.outputCanvas.style.width = `${Math.round(dispW)}px`;
  dom.outputCanvas.style.height = `${Math.round(dispH)}px`;
}

// ==================== GRÁFICOS & OTIMIZAÇÃO (PC FRACO) ====================
function applyGraphicsToCanvas() {
  const p = state.profiler;

  // O buffer interno WebGL do runtime Play! WASM é estritamente 640x480.
  // JAMAIS modifique dom.outputCanvas.width ou height para valores diferentes de 640x480,
  // pois a viewport WebGL em C++ é configurada para 640x480. Qualquer alteração aqui
  // cortava fisicamente a lateral direita e a parte inferior do vídeo!
  if (dom.outputCanvas.width !== 640) dom.outputCanvas.width = 640;
  if (dom.outputCanvas.height !== 480) dom.outputCanvas.height = 480;

  if (p.pixelated) {
    dom.outputCanvas.classList.add('render-pixelated');
  } else {
    dom.outputCanvas.classList.remove('render-pixelated');
  }

  // Recalcula as dimensões de exibição na tela para ajuste 100% perfeito
  resizeCanvasDisplay();

  const isWide = dom.canvasWrap.classList.contains('widescreen-mode');
  const ratioLabel = isWide ? '16:9' : '4:3';
  dom.playerResolutionBadge.textContent = `Escala: ${p.resolutionScale}x (${ratioLabel} • Sem Cortes)`;
  dom.playerFrameSkipBadge.textContent = `Frame Skip: ${p.frameSkip > 0 ? `${p.frameSkip} frame(s)` : 'Desativado'}`;
  
  if (p.activePreset === 'potato') {
    dom.btnEcoStatus.textContent = 'Ultra Leve (0.5x) 🚀';
    dom.btnToggleEcoMode.classList.add('btn-eco-active');
  } else if (p.activePreset === 'eco') {
    dom.btnEcoStatus.textContent = 'Leve (0.75x) 🟢';
    dom.btnToggleEcoMode.classList.add('btn-eco-active');
  } else {
    dom.btnEcoStatus.textContent = 'Desativado (1.0x)';
    dom.btnToggleEcoMode.classList.remove('btn-eco-active');
  }
}

function updateProfilerUI() {
  const p = state.profiler;
  const cpuLabel = p.cpuModel ? p.cpuModel.replace(/CPU\s+@.*/i, '').trim() : `${p.cores} núcleos`;
  dom.specCores.textContent = `${cpuLabel} (${p.cores} threads)`;
  dom.specRam.textContent = `${p.ramGb} GB RAM`;
  dom.specGpu.textContent = p.gpuRenderer;
  dom.specGpu.title = p.gpuRenderer;
  dom.specTierRating.textContent = p.getTierName();

  if (p.isLegacyHardware) {
    dom.systemProfileText.textContent = 'Modo PC Fraco Ativo (i7 2ª Gen • HD 3000) 🟢';
  } else if (p.isWeakHardware()) {
    dom.systemProfileText.textContent = 'Modo PC Fraco Ativo (Otimizado) 🟢';
  } else {
    dom.systemProfileText.textContent = 'Hardware Equilibrado (60 FPS) 🔵';
  }

  if (dom.hardwareDiagnosisText && p.diagnosisMessage) {
    dom.hardwareDiagnosisText.textContent = p.diagnosisMessage;
    if (dom.hardwareDiagnosisBox) {
      dom.hardwareDiagnosisBox.classList.toggle('gaming-ready', !p.isWeakHardware());
    }
  }

  dom.presetCards.forEach(card => {
    if (card.dataset.preset === p.activePreset) {
      card.classList.add('active-preset');
    } else {
      card.classList.remove('active-preset');
    }
  });

  dom.sliderResolution.value = p.resolutionScale;
  let scaleDesc = `${p.resolutionScale}x (Ajustado à Tela - Padrão)`;
  if (p.resolutionScale === 0.5) scaleDesc = '0.5x (Modo Batata / 50% - Ultra Leve)';
  else if (p.resolutionScale === 0.75) scaleDesc = '0.75x (Modo Econômico / 75% - PC Fraco)';
  else if (p.resolutionScale === 1.25) scaleDesc = '1.25x (Super Resolução)';
  else if (p.resolutionScale === 1.5) scaleDesc = '1.5x (Modo HD - Nitidez Máxima)';
  dom.sliderResLabel.textContent = scaleDesc;

  dom.sliderFrameSkip.value = p.frameSkip;
  dom.sliderSkipLabel.textContent = p.frameSkip === 0 ? '0 (Desativado)' : `${p.frameSkip} frame(s)`;

  dom.checkPixelated.checked = p.pixelated;
  dom.checkAutoPause.checked = p.autoPause;
}

// ==================== TELEMETRIA DE HARDWARE DO SISTEMA ====================
async function loadSystemHardware() {
  try {
    const response = await fetch('/api/system-info');
    if (!response.ok) return;
    const data = await response.json();
    if (data.hardware) {
      state.profiler.applyServerHardware(data.hardware);
      applyGraphicsToCanvas();
      updateProfilerUI();
    }
  } catch (err) {
    console.warn('Não foi possível obter dados detalhados de hardware do servidor:', err);
  }
}

// ==================== HERO SHOWCASE ("CONTINUAR JOGANDO") ====================
function updateHeroShowcase(game) {
  if (!game) return;
  state.featuredGame = game;

  if (dom.heroGameTitle) dom.heroGameTitle.textContent = game.title || game.name;
  if (dom.heroGameDesc) {
    dom.heroGameDesc.textContent = game.description || 
      `Experiência retrô definitiva com aceleração por hardware nativa a 60 FPS cravados no seu PC. Controle configurado e zero engasgos.`;
  }
  if (dom.heroCoverImg) {
    dom.heroCoverImg.src = game.coverUrl || '/covers/ps2_default.jpg';
    dom.heroCoverImg.onerror = () => { dom.heroCoverImg.src = '/covers/ps2_default.jpg'; };
  }
  if (dom.heroBackdrop && game.coverUrl) {
    dom.heroBackdrop.style.backgroundImage = `url('${game.coverUrl}')`;
  }

  // Badges
  if (dom.heroSystemBadge) {
    let sysName = '🎮 Console';
    if (game.isNative) sysName = '💻 PC Game';
    else if (game.systemTag === 'gamecube') sysName = '🎲 GameCube';
    else if (game.systemTag === 'genesis') sysName = '⚡ Mega Drive';
    else if (game.systemTag === 'snes') sysName = '🍄 Super Nintendo';
    else if (game.systemTag === 'gba') sysName = '🔴 GBA';
    else if (game.systemTag === 'nes') sysName = '⭐ NES';
    else if (game.systemTag === 'psp') sysName = '📱 PSP';
    else if (game.systemTag === 'ps2') sysName = '💿 PlayStation 2';
    dom.heroSystemBadge.textContent = sysName;
  }

  if (dom.btnHeroPlay) {
    dom.btnHeroPlay.onclick = () => {
      SoundFX.playSelect();
      launchGame(game);
    };
  }
  if (dom.btnHeroDetails) {
    dom.btnHeroDetails.onclick = () => {
      openGameModal(game);
    };
  }
  if (dom.btnHeroFolder) {
    dom.btnHeroFolder.onclick = () => {
      const type = game.systemTag || (game.isNative ? 'pc-games' : 'library');
      fetch(`/api/open-folder?type=${encodeURIComponent(type)}`);
    };
  }
}

// ==================== CARREGAMENTO DA BIBLIOTECA ====================
async function loadLibrary(refresh = false) {
  try {
    dom.btnRefreshLibrary.disabled = true;
    const url = refresh ? '/api/games?refresh=1' : '/api/games';
    const response = await fetch(url);
    const data = await response.json();
    state.games = data.games || [];
    dom.gameCountBadge.textContent = `${state.games.length} jogos`;

    populateCheatsSelector();
    filterAndRenderGames();

    if (state.games.length > 0) {
      // Prioriza Mario Kart ou o primeiro jogo na lista
      const topPick = state.games.find(g => (g.title || '').includes('Mario Kart') || (g.title || '').includes('Underground')) || state.games[0];
      updateHeroShowcase(topPick);
    }
  } catch (err) {
    console.error('Erro ao carregar biblioteca:', err);
    dom.gameGrid.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">
        ⚠️ Erro ao conectar ao servidor local. Verifique se o server.mjs está rodando.
      </div>
    `;
  } finally {
    dom.btnRefreshLibrary.disabled = false;
  }
}

function filterAndRenderGames() {
  const query = (dom.librarySearch.value || '').trim().toLowerCase();
  const genre = state.selectedGenre;

  state.filteredGames = state.games.filter(g => {
    const titleMatch = (g.title || g.name).toLowerCase().includes(query) || (g.serial || '').toLowerCase().includes(query);
    if (!titleMatch) return false;

    if (genre === 'all') return true;
    if (['ps2', 'gamecube', 'genesis', 'snes', 'gba', 'nes', 'psp'].includes(genre)) {
      return g.systemTag === genre;
    }
    if (genre === 'pc') return Boolean(g.isNative || g.hasPcVersion);
    if (genre === 'leve') return (g.requirementTier || '').toLowerCase().includes('leve');
    const gGenre = (g.genre || '').toLowerCase();
    if (genre === 'luta') return gGenre.includes('luta');
    if (genre === 'acao') return gGenre.includes('ação') || gGenre.includes('aventura');
    if (genre === 'corrida') return gGenre.includes('corrida');
    return true;
  });

  renderSidebarGames();
}

function renderSidebarGames() {
  if (state.filteredGames.length === 0) {
    dom.gameGrid.innerHTML = `
      <div style="padding: 3rem 1rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 0.8rem;">
        <div style="font-size: 2.8rem; opacity: 0.7;">💿</div>
        <strong style="font-size: 1.1rem; color: #fff;">Nenhum jogo encontrado nesta categoria</strong>
        <p style="font-size: 0.85rem; max-width: 50ch;">Use o botão <strong>"Pastas de Jogos"</strong> no topo para adicionar ROMs na pasta correspondente ou tente outro filtro.</p>
      </div>
    `;
    return;
  }

  dom.gameGrid.innerHTML = '';
  state.filteredGames.forEach((game) => {
    const card = document.createElement('article');
    card.className = 'game-card-cohesive';
    card.tabIndex = 0;
    card.dataset.id = game.id;

    let sysBadge = '🎮 PS2';
    if (game.isNative) sysBadge = '💻 PC Game';
    else if (game.systemTag === 'gamecube') sysBadge = '🎲 GameCube';
    else if (game.systemTag === 'genesis') sysBadge = '⚡ Mega Drive';
    else if (game.systemTag === 'snes') sysBadge = '🍄 SNES';
    else if (game.systemTag === 'gba') sysBadge = '🔴 GBA';
    else if (game.systemTag === 'nes') sysBadge = '⭐ NES';
    else if (game.systemTag === 'psp') sysBadge = '📱 PSP';

    card.innerHTML = `
      <div class="game-card-poster">
        ${game.coverUrl
          ? `<img src="${game.coverUrl}" alt="${game.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'game-poster-fallback\\'>🎮</div>'" />`
          : `<div class="game-poster-fallback">🎮</div>`
        }
        <div class="game-card-badges-overlay">
          <span class="game-badge-pill game-badge-system">${sysBadge}</span>
          <span class="game-badge-pill game-badge-fps">60 FPS</span>
        </div>
      </div>
      <div class="game-card-body">
        <h4 class="game-card-title" title="${game.title}">${game.title}</h4>
        <div class="game-card-submeta">
          <span>${game.displaySize || 'Auto'}</span>
          <span>${game.genre || 'Retrô'}</span>
        </div>
        <button type="button" class="btn-card-launch" data-id="${game.id}">
          <span>▶</span> JOGAR
        </button>
      </div>
    `;

    // Áudio retrô e sincronização do banner de destaque ao passar o mouse ou focar (Limiar de Doherty: < 10ms)
    card.addEventListener('mouseenter', () => {
      SoundFX.playHover();
      dom.gameGrid.querySelectorAll('.game-card-cohesive').forEach(c => c.classList.remove('game-card-focused'));
      card.classList.add('game-card-focused');
      updateHeroShowcase(game);
    });
    card.addEventListener('focus', () => {
      SoundFX.playHover();
      dom.gameGrid.querySelectorAll('.game-card-cohesive').forEach(c => c.classList.remove('game-card-focused'));
      card.classList.add('game-card-focused');
      updateHeroShowcase(game);
    });

    // Clique no botão ou no card
    const playBtn = card.querySelector('.btn-card-launch');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      launchGame(game);
    });

    card.addEventListener('click', () => {
      launchGame(game);
    });

    dom.gameGrid.appendChild(card);
  });
}

// ==================== MODAL DE DETALHES ====================
function openGameModal(game) {
  state.activeGame = game;
  dom.modalGameTitle.textContent = game.title || game.name;
  dom.modalGameSerial.textContent = game.serial || (game.isNative ? 'PC-X86' : 'PS2-ISO');
  dom.modalGameCover.src = game.coverUrl || '';
  dom.modalGameGenre.textContent = game.genre || 'PlayStation 2';
  dom.modalGameYear.textContent = game.year ? `Ano ${game.year}` : '2000-2008';
  
  const tier = game.requirementTier || 'Médio';
  if (game.isNative) {
    dom.modalGameTier.textContent = '⚡ Versão Nativa de PC (60 FPS)';
    dom.modalGameTier.className = 'tab-badge tier-nativopc';
    dom.modalGameDesc.textContent = 'Este jogo roda diretamente no Windows como um aplicativo nativo x86 com aceleração total da sua GPU Intel HD Graphics 3000 e Core i7, sem a sobrecarga pesada de emulação.';
    dom.modalGameOptimTip.textContent = 'Desempenho máximo: 60 FPS cravados e gráficos nítidos no Windows!';
    dom.btnModalPlay.innerHTML = '<span>⚡</span> Jogar Versão PC (60 FPS)';
    if (dom.btnModalLaunchDesktop) dom.btnModalLaunchDesktop.hidden = true;
    if (dom.modalNativePcBox) dom.modalNativePcBox.hidden = true;
  } else if (game.systemTag && game.systemTag !== 'ps2') {
    dom.modalGameTier.textContent = `⚡ ${game.platform} (60 FPS)`;
    dom.modalGameTier.className = 'tab-badge tier-leve';
    dom.modalGameDesc.textContent = game.requirementDesc || `Jogo clássico emulado via ${game.runner ? game.runner.toUpperCase() : 'Acelerador'} com aceleração nativa a 60 FPS cravados.`;
    dom.modalGameOptimTip.textContent = 'Desempenho perfeito: 60 FPS sem engasgos ou sobrecarga na sua Intel HD 3000 e Core i7.';
    dom.btnModalPlay.innerHTML = '<span>⚡</span> Jogar no Acelerador (60 FPS)';
    if (dom.btnModalLaunchDesktop) dom.btnModalLaunchDesktop.hidden = true;
    if (dom.modalNativePcBox) dom.modalNativePcBox.hidden = true;
  } else {
    dom.modalGameTier.textContent = `Exigência: ${tier}`;
    dom.modalGameTier.className = `tab-badge tier-${tier.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
    dom.modalGameDesc.textContent = game.requirementDesc || 'Compatível com aceleração WebGL no navegador.';
    dom.btnModalPlay.innerHTML = '<span>▶</span> Jogar no Navegador';
    if (dom.btnModalLaunchDesktop) dom.btnModalLaunchDesktop.hidden = false;

    // Destaca se o jogo possui versão oficial nativa de PC
    if (game.hasPcVersion && game.pcVersionDetails && dom.modalNativePcBox) {
      dom.modalNativePcBox.hidden = false;
      dom.modalNativePcDesc.textContent = game.pcVersionDetails.whyBetter || 'Este jogo possui versão nativa de PC que roda a 60 FPS na sua máquina!';
      dom.modalNativePcButtons.innerHTML = `
        <button type="button" class="btn-native-action" id="btnActionOpenPcFolder">
          <span>📂</span> Colocar na Pasta pc-games
        </button>
        ${game.pcVersionDetails.sourceUrl ? `
          <a href="${game.pcVersionDetails.sourceUrl}" target="_blank" rel="noreferrer" class="btn-native-action">
            <span>🌐</span> Ver Edição de PC
          </a>
        ` : ''}
        ${game.pcVersionDetails.widescreenFixUrl ? `
          <a href="${game.pcVersionDetails.widescreenFixUrl}" target="_blank" rel="noreferrer" class="btn-native-action">
            <span>📺</span> Patch Widescreen PC
          </a>
        ` : ''}
      `;
      const btnFold = document.getElementById('btnActionOpenPcFolder');
      if (btnFold) {
        btnFold.addEventListener('click', () => fetch('/api/open-folder?type=pc-games'));
      }
    } else if (dom.modalNativePcBox) {
      dom.modalNativePcBox.hidden = true;
    }

    if (game.isPs2Exclusive) {
      dom.modalGameOptimTip.textContent = game.exclusiveRunnerTip || 'Jogo 100% exclusivo de console. Para 60 FPS no seu hardware, utilize o Acelerador Desktop com Direct3D acelerado.';
    } else {
      dom.modalGameOptimTip.textContent = state.profiler.isLegacyHardware
        ? 'Hardware Legado (i7 2011 / HD 3000): No navegador, o "Modo PC Fraco" com Frame Skip 1 está ativo para evitar travamentos. Para 60 FPS limpos, use o Acelerador Desktop ou a Versão de PC.'
        : (tier === 'Pesado' ? 'Recomendado ativar "Modo PC Fraco" com Frame Skip 1 para não perder fluidez.' : 'Roda super liso no modo Equilibrado padrão a 60 FPS.');
    }
  }

  dom.gameModalBackdrop.hidden = false;
}

function closeGameModal() {
  dom.gameModalBackdrop.hidden = true;
}

// ==================== MODAL ACELERADOR DESKTOP & RETROPIE ====================
async function openDesktopRunnerModal() {
  try {
    const res = await fetch('/api/desktop-runner/status');
    const data = await res.json();
    const emus = data.emulators || [];

    if (dom.emulatorsStatusList) {
      const icons = {
        pcsx2: '🎮',
        blastem: '🦔',
        snes9x: '🍄',
        mgba: '🔴',
        fceux: '⭐',
        ppsspp: '📱'
      };

      dom.emulatorsStatusList.innerHTML = emus.map(e => {
        const icon = icons[e.id] || '🕹️';
        const statusBadge = e.installed
          ? '<span style="color:#34d399; font-size:0.75rem; font-weight:600;">🟢 Pronto (60 FPS)</span>'
          : '<span style="color:#f87171; font-size:0.75rem;">⚠️ Não Encontrado</span>';
        
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(20,36,62,0.6); padding:0.6rem 0.8rem; border-radius:6px; border:1px solid var(--border-subtle);">
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <span style="font-size:1.2rem;">${icon}</span>
              <div>
                <strong style="font-size:0.86rem; color:#fff;">${e.name}</strong>
                <div style="font-size:0.72rem; color:var(--text-muted);">${e.path ? e.path.split('\\\\').slice(-2).join('\\') : ''}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              ${statusBadge}
              <button type="button" class="btn-ctrl btn-folder-mini" data-sys="${e.id}" style="padding:0.25rem 0.5rem; font-size:0.72rem;" title="Abrir pasta de ROMs deste console">
                📁 ROMs
              </button>
            </div>
          </div>
        `;
      }).join('');

      dom.emulatorsStatusList.querySelectorAll('.btn-folder-mini').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const sys = btn.dataset.sys;
          const folderType = sys === 'blastem' ? 'genesis' : sys === 'pcsx2' ? 'ps2' : sys === 'dolphin' ? 'gamecube' : sys;
          fetch(`/api/open-folder?type=${folderType}`);
        });
      });
    }

    if (data.config?.emulatorPath && dom.runnerPathInput) {
      dom.runnerPathInput.value = data.config.emulatorPath;
    }
  } catch {
    if (dom.emulatorsStatusList) {
      dom.emulatorsStatusList.innerHTML = '<div style="color:#f87171; font-size:0.82rem;">Erro ao consultar status dos emuladores.</div>';
    }
  }
  dom.desktopRunnerModal.hidden = false;
}

function closeDesktopRunnerModal() {
  dom.desktopRunnerModal.hidden = true;
}

async function launchDesktopRunner(gameId) {
  try {
    const res = await fetch(`/api/desktop-runner/launch/${gameId}`);
    const data = await res.json();
    if (!data.success && data.needsSetup) {
      openDesktopRunnerModal();
      return;
    }
    if (!data.success) throw new Error(data.error || 'Falha ao acionar acelerador.');
    alert(`🚀 Sucesso!\n\n${data.message}\nO jogo foi iniciado em janela nativa de desktop com Direct3D acelerado a 60 FPS.`);
  } catch (err) {
    alert(`Erro ao iniciar acelerador desktop: ${err.message}`);
  }
}

// ==================== DETECÇÃO DE UNIDADE DE CD/DVD ====================
async function checkDrives() {
  try {
    dom.btnCheckDrive.disabled = true;
    dom.driveMediaStatus.textContent = 'Consultando unidades óticas e virtuais do sistema...';
    const response = await fetch('/api/drives');
    const data = await response.json();
    state.opticalDrives = data.drives || [];

    if (state.opticalDrives.length === 0) {
      dom.driveDeviceName.textContent = 'Nenhuma unidade ótica detectada';
      dom.driveMediaStatus.textContent = 'Nenhum leitor físico de CD/DVD ou imagem virtual montada.';
      dom.driveStatusDot.className = 'status-dot idle';
      dom.btnPlayDriveDisc.disabled = true;
      return;
    }

    const drive = state.opticalDrives[0];
    dom.driveDeviceName.textContent = `${drive.name} (${drive.drive})`;

    if (drive.mediaLoaded) {
      dom.driveMediaStatus.textContent = `Disco detectado: ${drive.gameTitle} ${drive.serial ? `(${drive.serial})` : ''}`;
      dom.driveStatusDot.className = 'status-dot';
      dom.btnPlayDriveDisc.disabled = false;
    } else {
      dom.driveMediaStatus.textContent = 'Bandeja vazia. Insira um DVD de PS2 ou monte uma imagem .ISO no Windows para iniciar.';
      dom.driveStatusDot.className = 'status-dot idle';
      dom.btnPlayDriveDisc.disabled = true;
    }
  } catch (err) {
    dom.driveMediaStatus.textContent = 'Erro ao consultar unidades do Windows.';
  } finally {
    dom.btnCheckDrive.disabled = false;
  }
}

// ==================== CENTRAL DE ROMs & DOWNLOADER ====================
async function loadRomSources() {
  try {
    const response = await fetch('/api/roms/sources');
    const data = await response.json();
    const sources = data.sources || [];

    dom.romSourcesGrid.innerHTML = '';
    sources.forEach(src => {
      const card = document.createElement('article');
      card.className = 'source-card';
      card.innerHTML = `
        <div>
          <div class="source-header">
            <h3>${src.name}</h3>
            <span class="source-badge">${src.badge}</span>
          </div>
          <p class="source-desc" style="margin: 0.6rem 0;">${src.description}</p>
          <div class="source-speed">⚡ Velocidade: ${src.speed}</div>
        </div>
        <div style="display:flex; gap: 0.5rem; margin-top: 1rem;">
          <a href="${src.baseUrl}" target="_blank" rel="noreferrer" class="btn-ctrl btn-accent" style="flex:1; text-decoration:none; justify-content:center;">
            <span>🌐</span> Acessar Acervo
          </a>
        </div>
      `;
      dom.romSourcesGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Erro ao carregar fontes de ROMs:', err);
  }
}

async function handleDownloaderSubmit(e) {
  e.preventDefault();
  const url = dom.downloadUrlInput.value.trim();
  const name = dom.downloadNameInput.value.trim();
  if (!url) return;

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao iniciar download');

    dom.downloadUrlInput.value = '';
    dom.downloadNameInput.value = '';
    startDownloadsPolling();
  } catch (err) {
    alert(`Erro ao iniciar download: ${err.message}`);
  }
}

function startDownloadsPolling() {
  if (state.downloadsInterval) return;
  state.downloadsInterval = window.setInterval(async () => {
    try {
      const res = await fetch('/api/downloads');
      const data = await res.json();
      const list = data.downloads || [];

      if (list.length === 0) {
        dom.downloadsProgressContainer.innerHTML = '';
        window.clearInterval(state.downloadsInterval);
        state.downloadsInterval = null;
        return;
      }

      dom.downloadsProgressContainer.innerHTML = list.map(d => `
        <div style="padding: 0.85rem; background: rgba(10, 18, 32, 0.9); border: 1px solid var(--border-subtle); border-radius: 8px; display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600;">
            <span>${d.name}</span>
            <span>${d.progress}% (${d.speedMbps} MB/s)</span>
          </div>
          <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:99px; overflow:hidden;">
            <div style="height:100%; background:linear-gradient(90deg, var(--ps-blue) 0%, var(--neon-cyan) 100%); width:${d.progress}%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
            <span>${d.displayDownloaded} de ${d.displayTotal}</span>
            <span style="color:${d.status === 'completed' ? '#34d399' : d.status === 'error' ? '#f87171' : 'var(--neon-cyan)'}">
              ${d.status === 'downloading' ? 'Baixando...' : d.status === 'completed' ? 'Concluído! ✔' : d.status === 'error' ? `Erro: ${d.error}` : 'Conectando...'}
            </span>
          </div>
        </div>
      `).join('');

      if (list.every(d => d.status === 'completed' || d.status === 'error')) {
        loadLibrary();
      }
    } catch {}
  }, 1000);
}

// ==================== CHEATS & WIDESCREEN ====================
function populateCheatsSelector() {
  dom.cheatGameSelect.innerHTML = '<option value="">Selecione um jogo da biblioteca...</option>';
  state.games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.title} (${g.serial || 'PS2'})`;
    dom.cheatGameSelect.appendChild(opt);
  });
}

function displayCheatsForGame(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) {
    dom.cheatCodeDisplay.textContent = 'Selecione um jogo para visualizar os códigos.';
    dom.btnDownloadPnach.href = '#';
    return;
  }

  const cheats = game.cheats;
  let text = `// ==========================================================\n`;
  text += `// CHEATS E PATCHES PARA: ${game.title}\n`;
  text += `// SERIAL OFICIAL: ${game.serial || 'DESCONHECIDO'}\n`;
  text += `// ==========================================================\n\n`;

  if (cheats?.pnach) {
    text += cheats.pnach;
  } else {
    text += `// Nenhum código pré-configurado encontrado no banco de dados local.\n`;
    text += `// Você pode buscar códigos em: ${game.cheatsSearchUrl}\n`;
  }

  dom.cheatCodeDisplay.textContent = text;
  dom.btnDownloadPnach.href = `/api/pnach/${game.id}`;
  dom.btnOpenGameHacking.href = game.cheatsSearchUrl;
}

// ==================== GAMEPAD API & NAVEGAÇÃO DE CONSOLE ====================
function toggleEcoMode() {
  if (state.profiler.activePreset === 'balanced') {
    state.profiler.applyPreset('eco');
    showToast('🟢 Modo PC Fraco Ativado: 0.75x Resolução • 60 FPS');
  } else if (state.profiler.activePreset === 'eco') {
    state.profiler.applyPreset('potato');
    showToast('🚀 Modo Batata Ativado: 0.5x Resolução • Ultra Leve');
  } else {
    state.profiler.applyPreset('balanced');
    showToast('🔵 Modo Equilibrado: Resolução Nativa 1.0x');
  }
  applyGraphicsToCanvas();
  updateProfilerUI();
}

function setupGamepadSupport() {
  window.addEventListener('gamepadconnected', (e) => {
    dom.gamepadDetectedBadge.textContent = `Controle conectado: ${e.gamepad.id}`;
    dom.gamepadDetectedBadge.style.color = '#34d399';
    showToast(`🎮 Controle Conectado: ${e.gamepad.id.slice(0, 24)}`);
  });

  window.addEventListener('gamepaddisconnected', () => {
    dom.gamepadDetectedBadge.textContent = 'Nenhum controle detectado';
    dom.gamepadDetectedBadge.style.color = 'var(--text-muted)';
    showToast('🔌 Controle desconectado');
  });

  const buttonLabels = ['✕ Cruz / A', '○ Círculo / B', '□ Quadrado / X', '△ Triângulo / Y', 'L1 / LB', 'R1 / RB', 'L2 / LT', 'R2 / RT', 'Select / Back', 'Start', 'L3', 'R3', 'Cima', 'Baixo', 'Esquerda', 'Direita'];
  dom.gamepadVisualButtons.innerHTML = buttonLabels.map((lbl, idx) => `
    <div id="btnVisual${idx}" style="padding:0.45rem; text-align:center; background:rgba(20,36,62,0.6); border:1px solid var(--border-subtle); border-radius:6px; font-size:0.75rem;">
      ${lbl}
    </div>
  `).join('');

  let lastNavMove = 0;
  const prevBtnPressed = new Map();
  const consoleCategories = ['all', 'ps2', 'psp', 'gamecube', 'genesis', 'snes', 'gba', 'nes', 'pc'];
  let currentCategoryIndex = 0;

  function cycleConsoleCategory(direction) {
    currentCategoryIndex = (currentCategoryIndex + direction + consoleCategories.length) % consoleCategories.length;
    const targetTag = consoleCategories[currentCategoryIndex];
    state.selectedGenre = targetTag;
    
    // Atualiza chip ativo
    dom.genreChips.forEach(chip => {
      const match = chip.dataset.genre === targetTag;
      chip.classList.toggle('active', match);
    });

    SoundFX.playBlip();
    filterAndRenderGames();
    const label = targetTag === 'all' ? 'TODOS OS JOGOS' : targetTag.toUpperCase();
    showToast(`🎮 Filtro de Console: ${label}`);
  }

  function getActiveCards() {
    return Array.from(dom.gameGrid.querySelectorAll('.game-card-cohesive'));
  }

  function setGamepadFocus(newIndex) {
    const cards = getActiveCards();
    if (cards.length === 0) return;
    
    if (newIndex < 0) newIndex = cards.length - 1;
    if (newIndex >= cards.length) newIndex = 0;

    cards.forEach((c, idx) => {
      const isTarget = idx === newIndex;
      c.classList.toggle('game-card-focused', isTarget);
      if (isTarget) {
        c.focus();
        c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });

    if (state.filteredGames[newIndex]) {
      updateHeroShowcase(state.filteredGames[newIndex]);
      SoundFX.playHover();
    }
  }

  function pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (gp) {
      // 1. Visualizer no menu de controles
      gp.buttons.forEach((b, idx) => {
        const el = document.getElementById(`btnVisual${idx}`);
        if (el) {
          if (b.pressed) {
            el.style.background = 'var(--neon-cyan)';
            el.style.color = '#000';
            el.style.fontWeight = 'bold';
          } else {
            el.style.background = 'rgba(20,36,62,0.6)';
            el.style.color = '#fff';
            el.style.fontWeight = 'normal';
          }
        }
      });

      // 2. Navegação de Console no Menu
      const now = performance.now();
      const isPlayerActive = state.gameRunning && dom.webPlayerModal && !dom.webPlayerModal.hidden;

      if (!isPlayerActive) {
        // Analógico esquerdo e D-pad Left/Right
        const axisX = gp.axes[0] || 0;
        const dpadLeft = gp.buttons[14]?.pressed;
        const dpadRight = gp.buttons[15]?.pressed;

        if (now - lastNavMove > 180) {
          const cards = getActiveCards();
          const currentIdx = cards.findIndex(c => c.classList.contains('game-card-focused'));
          const safeIdx = currentIdx === -1 ? 0 : currentIdx;

          if (axisX < -0.45 || dpadLeft) {
            lastNavMove = now;
            setGamepadFocus(safeIdx - 1);
            if (gp.vibrationActuator?.playEffect) {
              gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 25, weakMagnitude: 0.3, strongMagnitude: 0.1 }).catch(() => {});
            }
          } else if (axisX > 0.45 || dpadRight) {
            lastNavMove = now;
            setGamepadFocus(safeIdx + 1);
            if (gp.vibrationActuator?.playEffect) {
              gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: 25, weakMagnitude: 0.3, strongMagnitude: 0.1 }).catch(() => {});
            }
          }
        }

        // Leitura de botões (disparo único no clique inicial)
        const isPressed = (btnIdx) => {
          const b = gp.buttons[btnIdx];
          const pressed = b ? (b.pressed || b.value > 0.5) : false;
          const wasPressed = prevBtnPressed.get(btnIdx) || false;
          prevBtnPressed.set(btnIdx, pressed);
          return pressed && !wasPressed;
        };

        // [A] ou ✕ (Botão 0): Jogar jogo selecionado
        if (isPressed(0)) {
          if (dom.gameModalBackdrop && !dom.gameModalBackdrop.hidden) {
            dom.btnModalPlay.click();
          } else {
            const cards = getActiveCards();
            const currentIdx = cards.findIndex(c => c.classList.contains('game-card-focused'));
            if (currentIdx !== -1 && state.filteredGames[currentIdx]) {
              SoundFX.playSelect();
              launchGame(state.filteredGames[currentIdx]);
            } else if (state.featuredGame) {
              SoundFX.playSelect();
              launchGame(state.featuredGame);
            }
          }
        }

        // [B] ou ○ (Botão 1): Voltar / Fechar Modal
        if (isPressed(1)) {
          if (dom.gameModalBackdrop && !dom.gameModalBackdrop.hidden) {
            closeGameModal();
          } else if (dom.emulatorsModalBackdrop && !dom.emulatorsModalBackdrop.hidden) {
            closeEmulatorsModal();
          }
        }

        // [X] ou □ (Botão 2): Abrir Detalhes do Jogo Selecionado
        if (isPressed(2)) {
          const cards = getActiveCards();
          const currentIdx = cards.findIndex(c => c.classList.contains('game-card-focused'));
          if (currentIdx !== -1 && state.filteredGames[currentIdx]) {
            openGameModal(state.filteredGames[currentIdx]);
          }
        }

        // [Y] ou △ (Botão 3): Alternar Modo Batata / Eco Mode
        if (isPressed(3)) {
          toggleEcoMode();
        }

        // [L1 / LB] (Botão 4): Trocar para Console Anterior
        if (isPressed(4)) {
          cycleConsoleCategory(-1);
        }

        // [R1 / RB] (Botão 5): Trocar para Próximo Console
        if (isPressed(5)) {
          cycleConsoleCategory(1);
        }

        // [Start] (Botão 9): Jogar jogo em destaque
        if (isPressed(9)) {
          if (state.featuredGame) {
            SoundFX.playSelect();
            launchGame(state.featuredGame);
          }
        }
      }
    }
    requestAnimationFrame(pollGamepads);
  }
  requestAnimationFrame(pollGamepads);
}

// ==================== NAVEGAÇÃO DE ABAS DE CONFIGURAÇÃO (ABAIXO) ====================
function switchTab(tabKey) {
  state.activeTab = tabKey;
  dom.tabBtns.forEach(btn => {
    const isActive = btn.dataset.tab === tabKey;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  Object.keys(dom.views).forEach(key => {
    if (dom.views[key]) {
      dom.views[key].hidden = (key !== tabKey);
    }
  });

  if (tabKey === 'drive') checkDrives();
  if (tabKey === 'roms') loadRomSources();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Busca e filtros na sidebar
  dom.librarySearch.addEventListener('input', filterAndRenderGames);
  dom.genreChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dom.genreChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedGenre = chip.dataset.genre;
      filterAndRenderGames();
    });
  });

  dom.btnRefreshLibrary.addEventListener('click', () => loadLibrary(true));
  dom.btnOpenPcFolder?.addEventListener('click', () => fetch('/api/open-folder?type=pc-games'));
  dom.btnOpenLibraryFolder?.addEventListener('click', () => fetch('/api/open-folder?type=library'));

  // Lançador EmulationStation Desktop Edition
  const handleLaunchEsDe = async () => {
    try {
      SoundFX.playSelect();
      showToast('📺 Iniciando EmulationStation Desktop Edition em tela cheia...');
      const res = await fetch('/api/launch-es-de');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar');
      showToast('🚀 EmulationStation ativo!');
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  };
  dom.btnLaunchEsDe?.addEventListener('click', handleLaunchEsDe);
  dom.btnLaunchEsDeCatalog?.addEventListener('click', handleLaunchEsDe);

  // Navegação entre o player (topo) e o painel de configurações
  const btnScrollToSettings = document.getElementById('btnScrollToSettings');
  const btnScrollDown = document.getElementById('btnScrollDown');
  const btnBackToPlayer = document.getElementById('btnBackToPlayer');
  const settingsSection = document.getElementById('settingsSection');

  if (btnScrollToSettings && settingsSection) {
    btnScrollToSettings.addEventListener('click', () => {
      settingsSection.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (btnScrollDown && settingsSection) {
    btnScrollDown.addEventListener('click', () => {
      settingsSection.scrollIntoView({ behavior: 'smooth' });
    });
  }
  if (btnBackToPlayer) {
    btnBackToPlayer.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Botão de buscar arquivo no topo
  dom.manualFilePicker.addEventListener('change', () => {
    const [file] = dom.manualFilePicker.files || [];
    if (file) launchGame(file);
  });

  // Player controls
  dom.btnTogglePlay.addEventListener('click', () => {
    if (!state.playModule) return;
    state.isPaused = !state.isPaused;
    dom.btnTogglePlay.innerHTML = state.isPaused ? '<span>▶</span> Continuar' : '<span>⏸</span> Pausar';
  });

  dom.btnResetGame.addEventListener('click', () => {
    if (confirm('Deseja reiniciar a partida?')) {
      window.location.reload();
    }
  });

  dom.btnToggleEcoMode.addEventListener('click', toggleEcoMode);

  dom.btnWidescreenToggle.addEventListener('click', () => {
    const isNowWide = dom.canvasWrap.classList.toggle('widescreen-mode');
    dom.btnWidescreenToggle.classList.toggle('btn-widescreen-active', isNowWide);
    dom.btnWidescreenToggle.innerHTML = isNowWide 
      ? '<span>📺</span> Formato: 16:9 (Widescreen)' 
      : '<span>📺</span> Formato: 4:3 (Original)';
    applyGraphicsToCanvas();
  });

  dom.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      dom.canvasWrap.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
    setTimeout(applyGraphicsToCanvas, 60);
  });
  document.addEventListener('fullscreenchange', () => {
    setTimeout(applyGraphicsToCanvas, 60);
  });

  dom.btnScreenshot.addEventListener('click', () => {
    try {
      const dataUrl = dom.outputCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `ps2-screenshot-${Date.now()}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      alert('Não foi possível capturar a tela no momento.');
    }
  });

  dom.btnExitPlayer.addEventListener('click', () => {
    if (confirm('Deseja parar o jogo e voltar ao modo Standby?')) {
      stopCurrentGame();
      if (dom.webPlayerModal) dom.webPlayerModal.hidden = true;
    }
  });

  dom.btnCloseTheatre?.addEventListener('click', () => {
    if (dom.webPlayerModal) dom.webPlayerModal.hidden = true;
  });

  // ==================== NAVEGAÇÃO POR TECLADO / CONTROLE (LEI DE JAKOB) ====================
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      dom.librarySearch.focus();
      return;
    }

    if (e.key === 'Escape') {
      if (dom.webPlayerModal && !dom.webPlayerModal.hidden) {
        dom.webPlayerModal.hidden = true;
        return;
      }
      if (dom.gameModalBackdrop && !dom.gameModalBackdrop.hidden) {
        closeGameModal();
        return;
      }
      if (dom.desktopRunnerModal && !dom.desktopRunnerModal.hidden) {
        closeDesktopRunnerModal();
        return;
      }
    }

    const cards = Array.from(dom.gameGrid.querySelectorAll('.game-card-cohesive'));
    if (cards.length === 0) return;

    const focusedIndex = cards.findIndex(c => c === document.activeElement);

    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      let nextIndex = 0;
      if (focusedIndex === -1) {
        nextIndex = 0;
      } else {
        const cols = Math.floor(dom.gameGrid.clientWidth / (cards[0].clientWidth || 220)) || 1;
        if (e.key === 'ArrowRight') nextIndex = (focusedIndex + 1) % cards.length;
        else if (e.key === 'ArrowLeft') nextIndex = (focusedIndex - 1 + cards.length) % cards.length;
        else if (e.key === 'ArrowDown') nextIndex = Math.min(focusedIndex + cols, cards.length - 1);
        else if (e.key === 'ArrowUp') nextIndex = Math.max(focusedIndex - cols, 0);
      }
      cards.forEach((c, idx) => c.classList.toggle('game-card-focused', idx === nextIndex));
      cards[nextIndex].focus();
      cards[nextIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      if (state.filteredGames[nextIndex]) {
        updateHeroShowcase(state.filteredGames[nextIndex]);
      }
      SoundFX.playHover();
      return;
    }

    if (e.key === 'Enter') {
      const activeIdx = cards.findIndex(c => c.classList.contains('game-card-focused') || c === document.activeElement);
      if (activeIdx !== -1) {
        const gameId = cards[activeIdx].dataset.id;
        const targetGame = state.games.find(g => g.id === gameId);
        if (targetGame) {
          SoundFX.playSelect();
          launchGame(targetGame);
        }
      }
    }

    if (e.key === 'e' || e.key === 'E') {
      toggleEcoMode();
    }
  });

  // Navegação do Carrossel por botões (◀ e ▶)
  if (dom.btnCarouselPrev) {
    dom.btnCarouselPrev.addEventListener('click', () => {
      SoundFX.playHover();
      dom.gameGrid.scrollBy({ left: -460, behavior: 'smooth' });
    });
  }
  if (dom.btnCarouselNext) {
    dom.btnCarouselNext.addEventListener('click', () => {
      SoundFX.playHover();
      dom.gameGrid.scrollBy({ left: 460, behavior: 'smooth' });
    });
  }

  // Modal
  dom.btnModalClose.addEventListener('click', closeGameModal);
  dom.gameModalBackdrop.addEventListener('click', (e) => {
    if (e.target === dom.gameModalBackdrop) closeGameModal();
  });
  dom.btnModalPlay.addEventListener('click', () => {
    if (state.activeGame) {
      closeGameModal();
      launchGame(state.activeGame);
    }
  });
  dom.btnModalCheats.addEventListener('click', () => {
    if (state.activeGame) {
      closeGameModal();
      switchTab('cheats');
      dom.cheatGameSelect.value = state.activeGame.id;
      displayCheatsForGame(state.activeGame.id);
      document.querySelector('.bottom-settings-section').scrollIntoView({ behavior: 'smooth' });
    }
  });
  dom.btnModalLaunchDesktop?.addEventListener('click', () => {
    if (state.activeGame) {
      launchDesktopRunner(state.activeGame.id);
    }
  });

  // Desktop Runner Modal & RetroPie
  dom.btnOpenEmulatorsModal?.addEventListener('click', openDesktopRunnerModal);
  dom.btnRunnerModalClose?.addEventListener('click', closeDesktopRunnerModal);
  dom.desktopRunnerModal?.addEventListener('click', (e) => {
    if (e.target === dom.desktopRunnerModal) closeDesktopRunnerModal();
  });
  dom.btnOpenRunnerFolder?.addEventListener('click', () => fetch('/api/open-folder?type=desktop-runner'));
  dom.btnOpenLibraryFolderModal?.addEventListener('click', () => fetch('/api/open-folder?type=library'));
  dom.btnSaveRunnerPath?.addEventListener('click', async () => {
    const p = dom.runnerPathInput.value.trim();
    if (!p) return;
    try {
      const res = await fetch('/api/desktop-runner/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emulatorPath: p })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      alert('Caminho do emulador salvo com sucesso!');
      openDesktopRunnerModal();
    } catch (err) {
      alert(`Erro ao salvar caminho: ${err.message}`);
    }
  });

  // Drive controls
  dom.btnCheckDrive.addEventListener('click', checkDrives);
  dom.btnPlayDriveDisc.addEventListener('click', () => {
    const drive = state.opticalDrives.find(d => d.mediaLoaded);
    if (!drive) return;
    launchGame({
      name: `${drive.gameTitle || 'PS2_DISC'}.iso`,
      title: drive.gameTitle || 'Disco de PlayStation 2',
      id: 'drive-disc',
      size: 4 * 1024 * 1024 * 1024,
      requirementTier: 'Médio'
    });
  });

  // Optimization Presets
  dom.presetCards.forEach(card => {
    card.addEventListener('click', () => {
      state.profiler.applyPreset(card.dataset.preset);
      applyGraphicsToCanvas();
      updateProfilerUI();
    });
  });

  // Sliders
  dom.sliderResolution.addEventListener('input', (e) => {
    state.profiler.resolutionScale = parseFloat(e.target.value);
    applyGraphicsToCanvas();
    updateProfilerUI();
  });

  dom.sliderFrameSkip.addEventListener('input', (e) => {
    state.profiler.frameSkip = parseInt(e.target.value, 10);
    applyGraphicsToCanvas();
    updateProfilerUI();
  });

  dom.checkPixelated.addEventListener('change', (e) => {
    state.profiler.pixelated = e.target.checked;
    applyGraphicsToCanvas();
  });

  dom.btnBenchmarkRedetect.addEventListener('click', async () => {
    dom.btnBenchmarkRedetect.disabled = true;
    dom.btnBenchmarkRedetect.innerHTML = '<span>⚡</span> Detectando hardware e otimizando...';
    await loadSystemHardware();
    dom.btnBenchmarkRedetect.disabled = false;
    dom.btnBenchmarkRedetect.innerHTML = '<span>⚡</span> Reavaliar e Otimizar Automaticamente';
    alert(`Diagnóstico e Otimização Concluída!\n\nProcessador: ${state.profiler.cpuModel || 'Detectado'}\nVídeo: ${state.profiler.gpuRenderer}\nClassificação: ${state.profiler.getTierName()}\n\nConfigurações aplicadas:\n• Escala: ${state.profiler.resolutionScale}x (Sem cortes)\n• Frame Skip: ${state.profiler.frameSkip} (Fluidez e 60 FPS garantidos)\n• Filtro: ${state.profiler.pixelated ? 'Pixelado Retrô (Ultra Rápido)' : 'Bilinear'}`);
  });

  // Downloader
  dom.downloaderForm.addEventListener('submit', handleDownloaderSubmit);

  // Cheats
  dom.cheatGameSelect.addEventListener('change', (e) => {
    displayCheatsForGame(e.target.value);
  });

  dom.btnCopyPnach.addEventListener('click', () => {
    navigator.clipboard.writeText(dom.cheatCodeDisplay.textContent).then(() => {
      alert('Cheats copiados para a área de transferência!');
    });
  });

  // Drag and Drop de ISOs na tela
  ['dragenter', 'dragover'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dom.canvasWrap.classList.add('drag-hover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dom.canvasWrap.classList.remove('drag-hover');
      if (name === 'drop') {
        const file = e.dataTransfer?.files?.[0];
        if (file) launchGame(file);
      }
    });
  });
}

// ==================== INICIALIZAÇÃO GERAL ====================
async function main() {
  applyGraphicsToCanvas();
  updateProfilerUI();
  setupEventListeners();
  setupGamepadSupport();

  // Observador de redimensionamento contínuo para manter o vídeo sempre 100% ajustado sem cortes
  if (window.ResizeObserver && dom.canvasWrap) {
    const ro = new ResizeObserver(() => {
      resizeCanvasDisplay();
    });
    ro.observe(dom.canvasWrap);
  }
  window.addEventListener('resize', resizeCanvasDisplay);

  await loadSystemHardware();
  await loadLibrary();
  await checkDrives();
}

main();
