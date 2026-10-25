import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pspDir = path.join(rootDir, 'library', 'psp');
const targetIso = path.join(pspDir, 'God of War - Ghost of Sparta.iso');
const partIso = path.join(pspDir, 'God of War - Ghost of Sparta.iso.part');
const oldCso = path.join(pspDir, 'God of War - Ghost of Sparta (USA).cso');

const GOW_URL = 'https://archive.org/download/god-of-war-ghost-of-sparta-europe-australia-en-fr-de-es-it_202608/God%20of%20War%20-%20Ghost%20of%20Sparta%20(Europe%2C%20Australia)%20(En%2CFr%2CDe%2CEs%2CIt).iso';
const EXPECTED_SIZE = 1787232256; // 1704.4 MB (Authentic Sony PSP UMD ISO)

function isAuthenticPspIso(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 500 * 1024 * 1024) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(2048);
    fs.readSync(fd, buf, 0, 2048, 32768);
    fs.closeSync(fd);
    const systemId = buf.toString('latin1', 8, 40).trim();
    return systemId === 'PSP GAME';
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderProgressBar(pct, currentBytes, totalBytes, speedMbps, etaSec) {
  const barWidth = 25;
  const filled = Math.min(barWidth, Math.max(0, Math.round((pct / 100) * barWidth)));
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let etaStr = '--:--';
  if (etaSec > 0 && isFinite(etaSec)) {
    const mins = Math.floor(etaSec / 60);
    const secs = Math.floor(etaSec % 60);
    etaStr = `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }

  const speedStr = `${speedMbps.toFixed(2)} MB/s`;
  process.stdout.write(`\r[DOWNLOAD] [${bar}] ${pct.toFixed(1)}% (${formatBytes(currentBytes)} / ${formatBytes(totalBytes)}) | ${speedStr} | ETA: ${etaStr}   `);
}

async function startDownload() {
  if (!fs.existsSync(pspDir)) {
    fs.mkdirSync(pspDir, { recursive: true });
  }

  // 1. Verificar se a ISO já está 100% pronta e válida (PSP GAME)
  if (fs.existsSync(targetIso)) {
    if (isAuthenticPspIso(targetIso)) {
      const s = fs.statSync(targetIso);
      console.log(`\n[PRONTO] God of War: Ghost of Sparta já está 100% baixado e validado (${formatBytes(s.size)})!`);
      process.exit(0);
    } else {
      console.log('\n[AVISO] ISO existente identificada como inválida ou corrompida. Removendo para baixar a versão original...');
      try { fs.unlinkSync(targetIso); } catch {}
    }
  }

  console.log('======================================================================');
  console.log('   RECUPERADOR AUTOMÁTICO DE DOWNLOAD: GOD OF WAR (PSP)');
  console.log('======================================================================');
  console.log('Fonte: Internet Archive High-Speed Mirror (ISO Original PSP 1.7 GB)');
  console.log('Destino:', targetIso);
  console.log('----------------------------------------------------------------------\n');

  let downloadedBytes = 0;
  if (fs.existsSync(partIso)) {
    downloadedBytes = fs.statSync(partIso).size;
    console.log(`[RESUMO] Arquivo parcial detectado com ${formatBytes(downloadedBytes)}. Continuando download...`);
  }

  let attempts = 0;
  const maxAttempts = 15;

  while (downloadedBytes < EXPECTED_SIZE && attempts < maxAttempts) {
    attempts++;
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RetroStation/2.0'
      };

      if (downloadedBytes > 0) {
        headers['Range'] = `bytes=${downloadedBytes}-`;
      }

      const response = await fetch(GOW_URL, { headers });

      if (response.status !== 200 && response.status !== 206) {
        throw new Error(`Servidor retornou status HTTP ${response.status} (${response.statusText})`);
      }

      const isRange = response.status === 206;
      let totalBytes = EXPECTED_SIZE;
      const contentLen = response.headers.get('content-length');
      if (contentLen) {
        totalBytes = isRange ? downloadedBytes + parseInt(contentLen, 10) : parseInt(contentLen, 10);
      }

      const writeStream = fs.createWriteStream(partIso, {
        flags: isRange ? 'a' : 'w'
      });

      if (!isRange) {
        downloadedBytes = 0;
      }

      const reader = response.body.getReader();
      let lastReportTime = Date.now();
      let bytesSinceReport = 0;
      let speedMbps = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        writeStream.write(Buffer.from(value));
        downloadedBytes += value.length;
        bytesSinceReport += value.length;

        const now = Date.now();
        const elapsedSec = (now - lastReportTime) / 1000;
        if (elapsedSec >= 0.5) {
          speedMbps = (bytesSinceReport / (1024 * 1024)) / elapsedSec;
          lastReportTime = now;
          bytesSinceReport = 0;

          const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
          const etaSec = speedMbps > 0 ? remainingBytes / (speedMbps * 1024 * 1024) : 0;
          const pct = Math.min(100, (downloadedBytes / totalBytes) * 100);

          renderProgressBar(pct, downloadedBytes, totalBytes, speedMbps, etaSec);
        }
      }

      await new Promise(res => writeStream.end(res));

      if (downloadedBytes >= totalBytes - 1024 * 1024) {
        // Finalizado com sucesso!
        console.log(`\n\n[CONCLUÍDO] Download 100% finalizado com sucesso (${formatBytes(downloadedBytes)})!`);
        if (fs.existsSync(targetIso)) fs.unlinkSync(targetIso);
        fs.renameSync(partIso, targetIso);

        // Se houver CSO antigo incompleto, removemos para evitar confusão
        if (fs.existsSync(oldCso)) {
          const sOld = fs.statSync(oldCso);
          if (sOld.size < 1300000000) {
            try { fs.unlinkSync(oldCso); } catch {}
          }
        }

        console.log('[SISTEMA] ROM instalada na biblioteca PSP. Pronto para jogar!\n');
        process.exit(0);
      } else {
        console.log(`\n[AVISO] Conexão fechada prematuramente em ${formatBytes(downloadedBytes)}. Reconectando...`);
      }
    } catch (err) {
      console.log(`\n[AVISO] Erro temporário de rede (${err.message}). Tentativa ${attempts} de ${maxAttempts}. Aguardando 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  if (downloadedBytes < EXPECTED_SIZE) {
    console.error(`\n[ERRO] Não foi possível completar o download após ${maxAttempts} tentativas.`);
    process.exit(1);
  }
}

startDownload();
