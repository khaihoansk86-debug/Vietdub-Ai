import express from 'express';
import 'dotenv/config';
import multer from 'multer';
import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import WebSocket from 'ws';

const app = express();
const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = process.env.VIETDUB_ROOT || path.resolve('.');
const DATA_DIR = process.env.VIETDUB_DATA_DIR || path.join(ROOT, 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const PUBLIC_DIR = process.env.VIETDUB_PUBLIC_DIR || path.join(ROOT, 'public');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const FFMPEG_BIN = process.env.FFMPEG_BIN || unpackAsarPath(ffmpegStatic) || 'ffmpeg';
const YTDLP_BIN = process.env.YTDLP_BIN || unpackAsarPath(path.join(ROOT, 'node_modules', 'yt-dlp-exec', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'));
const TTS_CUE_GUARD_MS = 40;
const TTS_SYNC_OFFSET_MS = 30;
const MAX_TTS_TEMPO = 1.30;

let dialog = null;
let kokoroProcess = null;
let kokoroStatus = 'stopped'; // 'stopped', 'installing', 'starting', 'ready', 'error'
let kokoroInstallLog = '';
let kokoroServerLog = '';
if (process.versions.electron) {
  try {
    const electronModule = await import('electron');
    dialog = electronModule.dialog || electronModule.default?.dialog;
  } catch (err) {
    console.error('Không thể load Electron dialog:', err);
  }
}
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OUTPUT_FPS = 60;
const OUTPUT_CRF = '18';
const OUTPUT_PRESET = 'slow';
const OUTPUT_AUDIO_BITRATE = '256k';

function unpackAsarPath(filePath) {
  if (!filePath) return filePath;
  return process.versions.electron ? filePath.replace('app.asar', 'app.asar.unpacked') : filePath;
}

await fs.mkdir(JOBS_DIR, { recursive: true });

const upload = multer({ dest: path.join(os.tmpdir(), 'vietdub_uploads') });
const jobs = new Map();
const pendingQueue = [];
let activeJobCount = 0;
const MAX_CONCURRENT_JOBS = 1;

function enqueueJob(job, payload) {
  pendingQueue.push({ job, payload });
  triggerNextJob();
}

function triggerNextJob() {
  if (activeJobCount >= MAX_CONCURRENT_JOBS) return;
  const next = pendingQueue.shift();
  if (!next) return;

  activeJobCount++;
  processJob(next.job, next.payload)
    .catch((error) => fail(next.job, error))
    .finally(() => {
      activeJobCount--;
      triggerNextJob();
    });
}

const EDGE_VOICES = new Map([
  ['vi-VN-HoaiMyNeural', 'vi-VN-HoaiMyNeural'],
  ['vi-VN-NamMinhNeural', 'vi-VN-NamMinhNeural']
]);

const OPENAI_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'cedar'
]);

const KOKORO_VOICES = new Set([
  'diem_trinh',
  'hung_thinh',
  'mai_linh',
  'mai_loan',
  'manh_dung',
  'my_yen',
  'ngoc_huyen',
  'phat_tai',
  'thanh_dat',
  'thuc_trinh',
  'tuan_ngoc',
  'storyvert',
  'duc_an',
  'duc_duy'
]);

const TTS_STYLES = new Map([
  ['natural', 'Đọc như hội thoại đời thường: tự nhiên, rõ chữ, nhịp vừa phải, không diễn quá lố.'],
  ['friendly', 'Đọc thân thiện và ấm áp, có nụ cười nhẹ trong giọng, gần gũi như đang nói chuyện với người quen.'],
  ['cheerful', 'Đọc tươi sáng, vui hơn, có năng lượng và nhấn nhá rõ hơn nhưng vẫn tự nhiên.'],
  ['calm', 'Đọc bình tĩnh, nhẹ, chậm hơn một chút, phát âm từng chữ rõ và không vội.'],
  ['serious', 'Đọc nghiêm túc, chắc giọng, ít cười, phù hợp nội dung thông tin hoặc cảnh căng thẳng.'],
  ['story', 'Đọc như kể chuyện, có cảm xúc, lên xuống giọng theo ý nghĩa câu, giữ nhịp cuốn hút.'],
  ['news', 'Đọc như người dẫn chương trình: rõ, mạch lạc, chuyên nghiệp, ít cảm xúc cá nhân.'],
  ['soft', 'Đọc mềm, nhẹ, êm tai, giảm lực ở cuối câu, phù hợp nội dung tình cảm hoặc đời thường.']
]);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/results', express.static(JOBS_DIR));

app.post('/api/jobs', upload.fields([
  { name: 'videos', maxCount: 20 },
  { name: 'srtFile', maxCount: 1 },
  { name: 'watermarkFile', maxCount: 1 }
]), async (req, res) => {
  const id = crypto.randomUUID();
  const dir = path.join(JOBS_DIR, id);
  await fs.mkdir(dir, { recursive: true });

  const job = {
    id,
    dir,
    status: 'queued',
    logs: [],
    result: null,
    error: null,
    createdAt: new Date().toISOString()
  };
  jobs.set(id, job);

  const payload = {
    linksText: String(req.body.links || ''),
    srtUrl: String(req.body.srtUrl || ''),
    mode: String(req.body.mode || 'dub'),
    ai: parseAiOptions(req.body),
    tts: parseTtsOptions(req.body),
    subtitle: parseSubtitleOptions(req.body),
    cleanup: parseCleanupOptions(req.body),
    watermark: parseWatermarkOptions(req.body),
    aspectRatio: String(req.body.aspectRatio || '9:16'),
    outputDir: String(req.body.outputDir || ''),
    videos: req.files?.videos || [],
    srtFile: req.files?.srtFile?.[0] || null,
    watermarkFile: req.files?.watermarkFile?.[0] || null
  };

  res.json({ id });
  enqueueJob(job, payload);
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(publicJob(job));
});

app.get('/api/jobs', (_req, res) => {
  const items = [...jobs.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8)
    .map((job) => {
      const snapshot = publicJob(job);
      snapshot.logs = snapshot.logs.slice(-3);
      return snapshot;
    });
  res.json({ jobs: items });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  let cursor = 0;
  const send = () => {
    const snapshot = publicJob(job);
    snapshot.logs = job.logs.slice(cursor);
    cursor = job.logs.length;
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    if (job.status === 'done' || job.status === 'error') clearInterval(timer);
  };
  const timer = setInterval(send, 1000);
  send();
  req.on('close', () => clearInterval(timer));
});

app.post('/api/tts-preview', async (req, res) => {
  const tts = parseTtsOptions(req.body);
  const text = String(req.body.previewText || 'Xin chào, đây là giọng đọc thử của VietDub AI.').slice(0, 180);
  const file = path.join(os.tmpdir(), `vietdub_tts_preview_${crypto.randomUUID()}.mp3`);
  try {
    await synthesizeTtsText(text, file, tts, null);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(file, () => fs.rm(file, { force: true }).catch(() => {}));
  } catch (error) {
    await fs.rm(file, { force: true }).catch(() => {});
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post('/api/audio-mix-preview', upload.single('previewVideo'), async (req, res) => {
  const tts = parseTtsOptions(req.body);
  const text = String(req.body.previewText || 'Xin chao, day la giong doc thu cua VietDub AI.').slice(0, 180);
  const id = crypto.randomUUID();
  const voiceFile = path.join(os.tmpdir(), `vietdub_mix_voice_${id}.mp3`);
  const originalFile = path.join(os.tmpdir(), `vietdub_mix_original_${id}.wav`);
  const mixedFile = path.join(os.tmpdir(), `vietdub_mix_preview_${id}.mp3`);
  try {
    await synthesizeTtsText(text, voiceFile, tts, null);
    if (req.file?.path) {
      await run(FFMPEG_BIN, [
        '-y',
        '-t', '8',
        '-i', req.file.path,
        '-vn',
        '-af', `volume=${tts.originalVolume.toFixed(2)}`,
        '-ar', '44100',
        '-ac', '2',
        originalFile
      ], null);
      await run(FFMPEG_BIN, [
        '-y',
        '-i', originalFile,
        '-i', voiceFile,
        '-filter_complex', `[1:a]volume=${tts.volume.toFixed(2)}[v];[0:a][v]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=-15:TP=-1.0:LRA=11[aout]`,
        '-map', '[aout]',
        '-t', '10',
        '-c:a', 'libmp3lame',
        '-q:a', '4',
        mixedFile
      ], null);
    } else {
      await run(FFMPEG_BIN, [
        '-y',
        '-i', voiceFile,
        '-af', `volume=${tts.volume.toFixed(2)},loudnorm=I=-15:TP=-1.0:LRA=11`,
        '-c:a', 'libmp3lame',
        '-q:a', '4',
        mixedFile
      ], null);
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(mixedFile, () => {
      fs.rm(voiceFile, { force: true }).catch(() => {});
      fs.rm(originalFile, { force: true }).catch(() => {});
      fs.rm(mixedFile, { force: true }).catch(() => {});
      if (req.file?.path) fs.rm(req.file.path, { force: true }).catch(() => {});
    });
  } catch (error) {
    await fs.rm(voiceFile, { force: true }).catch(() => {});
    await fs.rm(originalFile, { force: true }).catch(() => {});
    await fs.rm(mixedFile, { force: true }).catch(() => {});
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post('/api/api-check', async (req, res) => {
  const ai = parseAiOptions(req.body);
  const tts = parseTtsOptions(req.body);
  const result = {
    gemini: await checkGeminiApi(ai),
    openai: await checkOpenAiApi(tts),
    rapidapi: checkRapidApi(ai)
  };
  res.json(result);
});

app.post('/api/cleanup', async (_req, res) => {
  await fs.rm(JOBS_DIR, { recursive: true, force: true });
  await fs.mkdir(JOBS_DIR, { recursive: true });
  jobs.clear();
  res.json({ ok: true });
});

app.get('/api/system/disk', async (_req, res) => {
  res.json(await getDiskInfo());
});

app.get('/api/system/update', async (_req, res) => {
  res.json(await checkForUpdate());
});

app.post('/api/system/ytdlp-update', async (req, res) => {
  try {
    const result = await runCapture(YTDLP_BIN, ['-U']);
    res.json({
      success: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/system/git-pull', async (req, res) => {
  try {
    const result = await runCapture('git', ['pull']);
    res.json({
      success: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/system/select-folder', async (req, res) => {
  try {
    if (!dialog) {
      return res.status(400).json({ success: false, error: 'Hộp thoại chọn thư mục chỉ khả dụng trên ứng dụng Desktop (Electron).' });
    }
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Chọn thư mục lưu video'
    });
    if (result.canceled || result.filePaths.length === 0) {
      return res.json({ success: true, canceled: true });
    }
    res.json({ success: true, canceled: false, path: result.filePaths[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/kokoro/status', (_req, res) => {
  res.json({
    success: true,
    status: kokoroStatus,
    log: kokoroInstallLog,
    serverLog: kokoroServerLog
  });
});

app.post('/api/kokoro/retry', (_req, res) => {
  if (kokoroStatus === 'installing' || kokoroStatus === 'starting') {
    return res.json({ success: false, error: 'Tiến trình đang chạy, không thể thử lại lúc này.' });
  }
  kokoroStatus = 'stopped';
  kokoroInstallLog = 'Đang bắt đầu cài đặt/sửa chữa lại...\n';
  kokoroServerLog = '';
  startKokoroBackend().catch((err) => console.error('Lỗi khi thử lại khởi chạy Kokoro:', err));
  res.json({ success: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`VietDub AI is running at http://${HOST}:${PORT}`);
  startKokoroBackend().catch((err) => console.error('Lỗi khi tự động khởi chạy Kokoro:', err));
});

async function processJob(job, payload) {
  job.status = 'running';
  log(job, 'Đã tiếp nhận yêu cầu.');

  const videoInputs = await prepareInputs(job, payload);
  if (!videoInputs.length) throw new Error('Chưa có video hoặc link video.');

  const merged = path.join(job.dir, 'merged_input.mp4');
  await mergeVideos(job, videoInputs, merged, payload.aspectRatio);
  const watermarkPath = await prepareWatermark(job, payload.watermarkFile, payload.watermark);

  if (payload.mode === 'download' || payload.mode === 'raw') {
    const out = path.join(job.dir, 'Raw_Video.mp4');
    if (watermarkPath) {
      await renderWatermarkedVideo(job, merged, out, watermarkPath, payload.watermark);
    } else {
      await fs.copyFile(merged, out);
    }
    await copyToOutputDir(job, payload, out);
    finish(job, out, 'Hoàn tất tải/gộp video.', payload.cleanup);
    return;
  }

  const srt = path.join(job.dir, 'subtitle.srt');
  if (payload.srtFile) {
    await fs.copyFile(payload.srtFile.path, srt);
    log(job, 'Đã dùng file SRT tải lên.');
  } else if (payload.srtUrl) {
    await downloadToFile(payload.srtUrl, srt);
    log(job, 'Đã tải SRT từ URL.');
  } else {
    await createSrtWithGemini(job, merged, srt, payload.ai);
  }

  const normalizedSrt = path.join(job.dir, 'subtitle_normalized.srt');
  const cues = await normalizeAndParseSrt(srt, normalizedSrt, payload.subtitle.maxLineLength);
  log(job, `Đã chuẩn hóa ${cues.length} dòng phụ đề.`);

  const voiceFiles = await createTtsFiles(job, cues, payload.tts);
  const finalVideo = path.join(job.dir, 'VietDub_Final.mp4');
  await renderFinal(job, merged, normalizedSrt, cues, voiceFiles, finalVideo, payload.subtitle, watermarkPath, payload.watermark, payload.tts);
  await copyToOutputDir(job, payload, finalVideo);
  finish(job, finalVideo, 'Hoàn tất tạo phụ đề và lồng tiếng.', payload.cleanup);
}

function parseTtsOptions(body) {
  const provider = ['edge-neural', 'openai-tts', 'kokoro-local'].includes(body.ttsProvider) ? body.ttsProvider : 'edge-neural';
  const requestedVoice = String(body.voice || '');
  const style = TTS_STYLES.has(String(body.ttsStyle || '')) ? String(body.ttsStyle) : 'natural';
  const originalVolumeRaw = clampNumber(body.originalVolume, 0, 150, 52);
  let voice;
  if (provider === 'openai-tts') {
    voice = OPENAI_VOICES.has(requestedVoice) ? requestedVoice : 'nova';
  } else if (provider === 'kokoro-local') {
    voice = KOKORO_VOICES.has(requestedVoice) ? requestedVoice : 'diem_trinh';
  } else {
    voice = EDGE_VOICES.get(requestedVoice) || 'vi-VN-HoaiMyNeural';
  }

  return {
    provider,
    voice,
    style,
    openaiApiKey: cleanSecret(body.openaiApiKey) || OPENAI_API_KEY,
    openaiModel: cleanModel(body.openaiTtsModel, OPENAI_TTS_MODEL),
    speed: clampNumber(body.ttsSpeed, 0.7, 1.3, 0.9),
    volume: clampNumber(body.ttsVolume, 0.6, 2, 1.05),
    originalVolume: originalVolumeRaw > 1.5 ? originalVolumeRaw / 100 : originalVolumeRaw
  };
}

function parseAiOptions(body) {
  return {
    geminiApiKey: cleanSecret(body.geminiApiKey) || GEMINI_API_KEY,
    geminiModel: cleanModel(body.geminiModel, GEMINI_MODEL),
    rapidApiKey: cleanSecret(body.rapidApiKey) || RAPIDAPI_KEY
  };
}

function cleanSecret(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('your_') || text.includes('...')) return '';
  return text;
}

function cleanModel(value, fallback) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._:-]+$/.test(text) ? text : fallback;
}

async function checkGeminiApi(ai) {
  if (!ai.geminiApiKey) return { ok: false, message: 'Thiếu Gemini API key.' };
  const model = ai.geminiModel || GEMINI_MODEL;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.geminiApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with OK only.' }] }],
        generationConfig: { maxOutputTokens: 4, temperature: 0 }
      })
    });
    if (!response.ok) return { ok: false, message: `Gemini lỗi ${response.status}.` };
    return { ok: true, message: `Gemini OK (${model}).` };
  } catch (error) {
    return { ok: false, message: `Gemini lỗi kết nối: ${error.message || String(error)}` };
  }
}

async function checkOpenAiApi(tts) {
  if (tts.provider !== 'openai-tts') return { ok: true, message: 'Đang dùng Edge Neural, không cần OpenAI.' };
  if (!tts.openaiApiKey) return { ok: false, message: 'Thiếu OpenAI API key.' };
  const model = tts.openaiModel || OPENAI_TTS_MODEL;
  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${tts.openaiApiKey}` }
    });
    if (!response.ok) return { ok: false, message: `OpenAI lỗi ${response.status}.` };
    return { ok: true, message: `OpenAI OK (${model}).` };
  } catch (error) {
    return { ok: false, message: `OpenAI lỗi kết nối: ${error.message || String(error)}` };
  }
}

function checkRapidApi(ai) {
  return ai.rapidApiKey
    ? { ok: true, message: 'RapidAPI đã có key. Sẽ dùng khi cần tải Douyin/TikTok dự phòng.' }
    : { ok: true, message: 'RapidAPI chưa có key. YouTube/upload local vẫn dùng bình thường.' };
}

function parseSubtitleOptions(body) {
  return {
    font: parseSubtitleFont(body.subtitleFont),
    size: clampNumber(body.subtitleSize, 8, 24, 11),
    background: ['none', 'box'].includes(body.subtitleBackground) ? body.subtitleBackground : 'none',
    backgroundColor: normalizeHexColor(body.subtitleBgColor || '#000000'),
    backgroundOpacity: clampNumber(body.subtitleBgOpacity, 0, 100, 65),
    bottomMargin: clampNumber(body.subtitleBottomMargin, 12, 120, 34),
    maxLineLength: clampNumber(body.subtitleLineLength, 18, 42, 28)
  };
}

function parseSubtitleFont(value) {
  const fonts = new Map([
    ['segoe-ui', 'Segoe UI'],
    ['arial', 'Arial'],
    ['times-new-roman', 'Times New Roman'],
    ['tahoma', 'Tahoma'],
    ['verdana', 'Verdana'],
    ['calibri', 'Calibri'],
    ['georgia', 'Georgia']
  ]);
  return fonts.get(String(value || '').toLowerCase()) || 'Segoe UI';
}

function parseCleanupOptions(body) {
  const enabled = ['on', 'true', '1', 'yes'].includes(String(body.autoCleanup || '').toLowerCase());
  return {
    enabled,
    delayMinutes: clampNumber(body.cleanupDelayMinutes, 1, 1440, 30)
  };
}

function parseWatermarkOptions(body) {
  const enabled = ['on', 'true', '1', 'yes'].includes(String(body.watermarkEnabled || '').toLowerCase());
  const position = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'].includes(body.watermarkPosition)
    ? body.watermarkPosition
    : 'top-right';
  return {
    enabled,
    position,
    widthPercent: clampNumber(body.watermarkWidthPercent, 5, 40, 14),
    margin: clampNumber(body.watermarkMargin, 0, 120, 24),
    opacity: clampNumber(body.watermarkOpacity, 10, 100, 85)
  };
}

async function prepareWatermark(job, file, options) {
  if (!options.enabled || !file) return null;
  const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
  const target = path.join(job.dir, `watermark${ext}`);
  await fs.copyFile(file.path, target);
  log(job, `Đã nhận watermark: ${file.originalname}`);
  return target;
}

async function prepareInputs(job, payload) {
  const inputs = [];
  let index = 1;

  for (const file of payload.videos) {
    const target = path.join(job.dir, `input_${index++}.mp4`);
    await fs.copyFile(file.path, target);
    inputs.push(target);
    log(job, `Đã nhận file: ${file.originalname}`);
  }

  const links = parseLinks(payload.linksText).filter((url) => !/\.srt($|[?#])/i.test(url));
  for (const rawUrl of links) {
    const url = normalizeUrl(rawUrl);
    const inputNumber = index++;
    const target = path.join(job.dir, `input_${inputNumber}.mp4`);
    if (url.includes('douyin.com')) {
      log(job, `Đang tải Douyin qua RapidAPI: ${url}`);
      const mediaUrl = await resolveRapidApi(url, payload.ai);
      await downloadToFile(mediaUrl, target);
    } else {
      log(job, `Đang tải bằng yt-dlp: ${url}`);
      const outputTemplate = path.join(job.dir, `input_${inputNumber}.%(ext)s`);
      await run(YTDLP_BIN, [
        url,
        '--no-playlist',
        '--playlist-items', '1',
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', path.dirname(FFMPEG_BIN),
        '-o', outputTemplate
      ], job);
      await ensureYtDlpOutput(job, `input_${inputNumber}`, target);
    }
    inputs.push(target);
  }

  const srtFromText = parseLinks(payload.linksText).find((url) => /\.srt($|[?#])/i.test(url));
  if (srtFromText && !payload.srtUrl) payload.srtUrl = srtFromText;
  return inputs;
}

async function ensureYtDlpOutput(job, baseName, target) {
  if (await fileExists(target)) return;

  const entries = await fs.readdir(job.dir);
  const related = entries
    .filter((name) => name.startsWith(`${baseName}.`))
    .map((name) => path.join(job.dir, name));
  const video = related.find((file) => /\.(mp4|mov|mkv|webm)$/i.test(file));
  const audio = related.find((file) => /\.(m4a|mp3|aac|opus|webm)$/i.test(file) && file !== video);

  if (video && audio) {
    log(job, 'yt-dlp trả video/audio rời, đang ghép lại bằng ffmpeg.');
    await run(FFMPEG_BIN, ['-y', '-i', video, '-i', audio, '-c', 'copy', target], job);
    return;
  }

  if (video) {
    log(job, 'yt-dlp trả file video khác tên, đang chuẩn hóa tên file.');
    await run(FFMPEG_BIN, ['-y', '-i', video, '-c', 'copy', target], job);
    return;
  }

  throw new Error(`yt-dlp không tạo được file video đầu ra cho ${baseName}.`);
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}


async function getVideoResolution(file) {
  const result = await runCapture(FFMPEG_BIN, ['-hide_banner', '-i', file]);
  const match = result.stderr.match(/Stream\s+#\d+:\d+.*Video:.*?\s+(\d+)x(\d+)/i);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return { width: 1080, height: 1920 };
}

async function mergeVideos(job, inputs, output, aspectRatio = '9:16') {
  let targetWidth = 1080;
  let targetHeight = 1920;

  if (aspectRatio === '16:9') {
    targetWidth = 1920;
    targetHeight = 1080;
  } else if (aspectRatio === '1:1') {
    targetWidth = 1080;
    targetHeight = 1080;
  } else if (aspectRatio === 'original') {
    const res = await getVideoResolution(inputs[0]);
    targetWidth = res.width;
    targetHeight = res.height;
  }

  const firstVideoRes = await getVideoResolution(inputs[0]);
  const needNormalize = inputs.length > 1 || firstVideoRes.width !== targetWidth || firstVideoRes.height !== targetHeight;

  if (!needNormalize) {
    await fs.copyFile(inputs[0], output);
    log(job, 'Đã chuẩn bị video đầu vào.');
    return;
  }

  log(job, `Đang chuẩn hóa ${inputs.length} video trước khi ghép về kích thước ${targetWidth}x${targetHeight}.`);
  const normalized = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const target = path.join(job.dir, `concat_ready_${String(index + 1).padStart(2, '0')}.mp4`);
    await normalizeVideoForConcat(job, inputs[index], target, index + 1, targetWidth, targetHeight);
    normalized.push(target);
  }

  const list = path.join(job.dir, 'concat.txt');
  await fs.writeFile(list, normalized.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
  log(job, `Đang ghép ${inputs.length} video.`);
  await run(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', output], job);
}

async function normalizeVideoForConcat(job, input, output, index, targetWidth, targetHeight) {
  const hasAudio = await hasAudioStream(input);
  const scaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${OUTPUT_FPS},format=yuv420p`;
  const args = ['-y', '-i', input];

  if (hasAudio) {
    args.push(
      '-map', '0:v:0',
      '-map', '0:a:0',
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', OUTPUT_PRESET,
      '-crf', OUTPUT_CRF,
      '-c:a', 'aac',
      '-b:a', OUTPUT_AUDIO_BITRATE,
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      output
    );
  } else {
    args.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-vf', scaleFilter,
      '-c:v', 'libx264',
      '-preset', OUTPUT_PRESET,
      '-crf', OUTPUT_CRF,
      '-c:a', 'aac',
      '-b:a', OUTPUT_AUDIO_BITRATE,
      '-ar', '44100',
      '-ac', '2',
      '-shortest',
      '-movflags', '+faststart',
      output
    );
  }

  log(job, `Đang chuẩn hóa video ${index}.`);
  await run(FFMPEG_BIN, args, job);
}

async function createSrtWithGemini(job, video, srtPath, ai = {}) {
  const geminiApiKey = ai.geminiApiKey || GEMINI_API_KEY;
  const geminiModel = ai.geminiModel || GEMINI_MODEL;
  if (!geminiApiKey) throw new Error('Thieu GEMINI_API_KEY trong giao dien hoac file .env');
  const audio = path.join(job.dir, 'audio_for_transcription.wav');
  log(job, 'Đang trích xuất audio để tạo phụ đề.');
  await run(FFMPEG_BIN, [
    '-y',
    '-i', video,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-af', 'highpass=f=90,lowpass=f=7600,dynaudnorm=f=150:g=15,loudnorm=I=-18:TP=-2:LRA=9',
    '-c:a', 'pcm_s16le',
    audio
  ], job);
  const audioBase64 = await fs.readFile(audio, 'base64');
  log(job, 'Đang gọi Gemini để tạo SRT.');

  const systemInstruction = 'Ban la chuyen gia transcript, dich phu de va dao dien long tieng tieng Viet. Nhiem vu bat buoc: nghe audio that ky, xac dinh chinh xac loi thoai goc va timestamp, sau do moi dich sang tieng Viet tu nhien. Khong duoc doan noi dung khi khong nghe ro. Chi tra ve SRT hop le.';
  const prompt = `Tao phu de SRT tieng Viet tu audio dinh kem de dung cho long tieng.

QUY TRINH NOI BO BAT BUOC, KHONG IN RA:
1. Nghe va transcript nguyen van loi thoai goc theo tung cau/ngat hoi.
2. Kiem tra lai ten rieng, dai tu, so dem, phu dinh, cau hoi/cau cam than.
3. Chi sau khi transcript dung moi dich sang tieng Viet.
4. Neu mot doan khong nghe ro, hay viet ban dich ngan theo phan chac chan nghe duoc, khong tu them chi tiet.

YEU CAU DICH VA NGU CANH:
- Neu audio la ngon ngu khac, dich thoat y sang tieng Viet tu nhien, dung ngu canh, dung sac thai, khong dich tung chu.
- Neu audio da la tieng Viet, chep hoac luoc lai cho ro nghia va de long tieng.
- Giu dung dai tu xung ho, cam xuc, y hai huoc, muc do lich su/than mat neu co.
- Khong them noi dung khong co trong audio.
- Khong thay doi y nghia chinh, khong dao nguoc phu dinh/khang dinh, khong bo qua cau noi quan trong.
- Ten rieng nhu Ross, Rachel, Phoebe, Monica, Joey, Chandler phai giu dung neu nghe thay.
- Viet nhu loi noi hang ngay, tranh van viet, tranh cau dai hoac trang trong qua muc.
- Cho phep rut gon y neu can de nghe tu nhien hon, mien la khong sai nghia chinh.

YEU CAU NHIP LONG TIENG:
- Moi cau phai du ngan de TTS doc kip trong khoang thoi gian cua block.
- Uu tien cau Viet gon, tu nhien; bo tu dem khong can thiet.
- Moi block toi da 24 ky tu hoac 6 tu; neu cau dai hay chia nhieu block noi tiep.
- Neu block ngan hon 1.5 giay, toi da 4 tu tieng Viet va phai tom y that gon.
- Neu loi dich tieng Viet doc khong kip bang toc do noi tu nhien, bat buoc rut gon y thay vi viet day du.
- Moi block nen dai 1.0 den 3.2 giay, tranh block qua ngan duoi 0.7 giay tru khi bat buoc.
- Khong de loi thoai Viet dai hon nhip noi goc; neu can hay tom y.
- Khong chen so thu tu, timestamp hoac ky tu "-->" vao noi dung phu de.
- Timestamp phai bam sat thoi diem bat dau va ket thuc cau noi trong audio goc, khong chia deu theo video.
- Neu giua hai cau co khoang lang, giu khoang lang do; khong keo dai cau truoc de lap khoang trong.
- Neu nhieu nguoi noi gan nhau, tach block theo tung cau/ngat hoi de long tieng khong bi cham nhip.
- Uu tien nhip noi tu nhien hon viec nhoi qua nhieu chu vao mot block ngan.

DINH DANG BAT BUOC:
1
00:00:00,000 --> 00:00:02,000
Noi dung tieng Viet.

2
00:00:02,000 --> 00:00:04,000
Noi dung tiep theo.

Chi tra ve SRT thuan, khong markdown, khong code fence va khong ghi chu.`;
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.1,
        topP: 0.7,
        responseMimeType: 'text/plain'
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'audio/wav', data: audioBase64 } }
        ]
      }]
    })
  }, job, 'Gemini');
  if (!response.ok) throw new Error(`Gemini lỗi ${response.status}: ${await response.text()}`);
  const json = await response.json();
  let srt = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  srt = srt.replace(/^\s*```(?:srt)?/i, '').replace(/```\s*$/i, '').trim();
  if (!srt.includes('-->')) throw new Error('Gemini không trả về SRT hợp lệ.');
  await fs.writeFile(srtPath, srt, 'utf8');
}


async function normalizeAndParseSrt(input, output, maxLineLength = 28) {
  let srt = await fs.readFile(input, 'utf8');
  srt = srt.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const lines = srt.split('\n').map((line) => line.trim());
  const cues = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.includes('-->')) {
      index += 1;
      continue;
    }

    const [rawStart, rawEnd] = line.split('-->').map((part) => part.trim());
    const start = parseSrtTime(rawStart);
    const end = parseSrtTime(rawEnd);
    index += 1;
    if (!start || !end || end.ms <= start.ms) continue;

    const textLines = [];
    while (index < lines.length) {
      const textLine = lines[index];
      if (!textLine) {
        index += 1;
        if (textLines.length) break;
        continue;
      }
      if (textLine.includes('-->')) break;
      if (/^\d+$/.test(textLine)) {
        index += 1;
        continue;
      }
      textLines.push(textLine);
      index += 1;
    }

    const text = cleanSubtitleText(textLines.join(' '));
    if (text) cues.push({ index: cues.length + 1, start: start.ms, end: end.ms, text });
  }

  if (!cues.length) throw new Error('SRT không có dòng phụ đề hợp lệ.');
  const normalized = cues.map((cue, i) => {
    return `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${wrapSubtitleText(cue.text, maxLineLength)}\n`;
  }).join('\n');
  await fs.writeFile(output, normalized, 'utf8');
  return cues;
}

function cleanSubtitleText(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\d+\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/g, ' ')
    .replace(/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function createTtsFiles(job, cues, tts) {
  const files = [];

  for (const cue of cues) {
    const rawTarget = path.join(job.dir, `tts_raw_${String(cue.index).padStart(4, '0')}.mp3`);
    const text = cue.text.slice(0, 180);
    await synthesizeTtsText(text, rawTarget, tts, job, cue.index);
    const target = await fitTtsToCue(job, cue, rawTarget);
    files.push(target);
    if (cue.index % 5 === 0 || cue.index === cues.length) log(job, `Đã tạo TTS ${cue.index}/${cues.length}.`);
  }
  return files;
}


async function synthesizeTtsText(text, target, tts, job, cueIndex = 0) {
  try {
    if (tts.provider === 'google-translate') return await synthesizeGoogleTts(text, target);
    if (tts.provider === 'openai-tts') return await synthesizeOpenAiTts(text, target, tts);
    if (tts.provider === 'kokoro-local') return await synthesizeKokoroTts(text, target, tts);
    return await synthesizeEdgeTts(text, target, tts, job);
  } catch (error) {
    if (job) log(job, `TTS lỗi${cueIndex ? ` ở câu ${cueIndex}` : ''}, chuyển sang Edge/Google: ${error.message}`);
    try {
      await synthesizeEdgeTts(text, target, { ...tts, voice: 'vi-VN-HoaiMyNeural' }, job);
    } catch {
      await synthesizeGoogleTts(text, target);
    }
  }
}

async function synthesizeGoogleTts(text, target) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
  await downloadToFile(url, target, { 'User-Agent': 'Mozilla/5.0' });
}

async function fitTtsToCue(job, cue, rawFile) {
  const id = String(cue.index).padStart(4, '0');
  const trimmed = path.join(job.dir, `tts_trimmed_${id}.mp3`);
  const fitted = path.join(job.dir, `tts_${id}.mp3`);
  const cueDuration = Math.max(500, cue.end - cue.start);
  const targetDuration = Math.max(450, cueDuration - TTS_CUE_GUARD_MS);

  await run(FFMPEG_BIN, [
    '-y',
    '-i', rawFile,
    '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,aresample=44100',
    '-c:a', 'libmp3lame',
    '-q:a', '4',
    trimmed
  ], job);

  const duration = await getMediaDurationMs(trimmed);
  if (!duration || duration <= targetDuration) {
    await fs.copyFile(trimmed, fitted);
    return fitted;
  }

  const tempo = Math.min(MAX_TTS_TEMPO, duration / targetDuration);
  await run(FFMPEG_BIN, [
    '-y',
    '-i', trimmed,
    '-af', buildAtempoFilter(tempo),
    '-c:a', 'libmp3lame',
    '-q:a', '4',
    fitted
  ], job);

  const finalDuration = await getMediaDurationMs(fitted);
  if (finalDuration && finalDuration > cueDuration + 80) {
    log(job, `Câu ${cue.index} dài hơn nhịp gốc (${(finalDuration / 1000).toFixed(2)}s/${(cueDuration / 1000).toFixed(2)}s). Đã giữ tốc độ tự nhiên, nếu còn lệch hãy rút ngắn câu phụ đề.`);
  }
  return fitted;
}

function buildAtempoFilter(tempo) {
  const filters = [];
  let remaining = Math.max(0.5, tempo);
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  filters.push(`atempo=${remaining.toFixed(3)}`);
  return filters.join(',');
}

function generateSecMSGec() {
  const trustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const timestamp = Math.floor(Date.now() / 1000) + 11644473600;
  const roundedTimestamp = (timestamp - (timestamp % 300)) * 10000000;
  const strToHash = `${roundedTimestamp}${trustedClientToken}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function synthesizeEdgeTts(text, target, tts, job) {
  return new Promise((resolve, reject) => {
    const ratePercent = Math.round((tts.speed - 1) * 100);
    const volumePercent = Math.round((tts.volume - 1) * 100);
    const rateStr = `${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;
    const volumeStr = `${volumePercent >= 0 ? '+' : ''}${volumePercent}%`;
    const voice = EDGE_VOICES.get(tts.voice) || 'vi-VN-HoaiMyNeural';

    const CHROMIUM_FULL_VERSION = "143.0.3650.75";
    const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
    const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

    const gec = generateSecMSGec();
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase();

    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const ws = new WebSocket(url, {
      headers: {
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Cookie": `muid=${muid};`
      }
    });

    const audioChunks = [];
    const requestId = crypto.randomUUID().replace(/-/g, '');

    ws.on('open', () => {
      const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false"
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });
      ws.send(configMsg);

      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>` +
        `<voice name='${voice}'><prosody pitch='+0Hz' rate='${rateStr}' volume='${volumeStr}'>` +
        `${xmlEscape(text)}</prosody></voice></speak>`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        const audioChunk = data.subarray(2 + headerLen);
        if (audioChunk.length > 0) {
          audioChunks.push(audioChunk);
        }
      } else {
        const textMsg = data.toString();
        if (textMsg.includes('Path:turn.end')) {
          ws.close();
        }
      }
    });

    ws.on('close', async (code, reason) => {
      if (audioChunks.length === 0) {
        reject(new Error(`Edge TTS WebSocket closed without receiving any audio data. Code: ${code}, Reason: ${reason.toString()}`));
        return;
      }
      try {
        const finalBuffer = Buffer.concat(audioChunks);
        await fs.writeFile(target, finalBuffer);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    ws.on('error', (err) => {
      ws.close();
      reject(err);
    });
  });
}

async function synthesizeOpenAiTts(text, target, tts) {
  const openaiApiKey = tts.openaiApiKey || OPENAI_API_KEY;
  const openaiModel = tts.openaiModel || OPENAI_TTS_MODEL;
  if (!openaiApiKey) throw new Error('Thieu OPENAI_API_KEY trong giao dien hoac file .env');
  const response = await fetchWithRetry('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: openaiModel,
      voice: OPENAI_VOICES.has(tts.voice) ? tts.voice : 'coral',
      input: text,
      response_format: 'mp3',
      speed: tts.speed,
      instructions: buildOpenAiTtsInstructions(tts)
    })
  }, { logs: [] }, 'OpenAI TTS');
  if (!response.ok) throw new Error(`OpenAI TTS lỗi ${response.status}: ${await response.text()}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function synthesizeKokoroTts(text, target, tts) {
  const serverUrl = process.env.KOKORO_SERVER_URL || 'http://localhost:8889/tts';
  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: tts.voice || 'diem_trinh',
      speed: tts.speed || 1.0
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kokoro local server error: ${response.status} - ${errText}`);
  }
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

function buildOpenAiTtsInstructions(tts) {
  const base = TTS_STYLES.get(tts.style) || TTS_STYLES.get('natural');
  return [
    base,
    'Đọc tiếng Việt như hội thoại thật: có nhịp nghỉ nhẹ, không nuốt chữ, không đọc vội.',
    'Giữ cảm xúc đúng ngữ cảnh nhưng tiết chế, như một người bình thường đang nói trong video.',
    'Nếu câu ngắn, vẫn tạo nhịp tự nhiên thay vì đọc đều đều như máy.',
    'Không kéo giọng quá sân khấu, không nhấn quá mạnh từng chữ.',
    'Không thêm nội dung ngoài văn bản được cung cấp.'
  ].join(' ');
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function renderFinal(job, video, srt, cues, voiceFiles, output, subtitle, watermarkPath, watermark, tts) {
  log(job, 'Đang render video cuối cùng bằng ffmpeg.');
  const args = ['-y', '-i', video];
  for (const file of voiceFiles) args.push('-i', file);
  const watermarkInputIndex = watermarkPath ? voiceFiles.length + 1 : -1;
  if (watermarkPath) args.push('-i', watermarkPath);

  const escapedSrt = srt.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const hasBox = subtitle.background === 'box';
  const subtitleStyle = [
    `Fontname=${subtitle.font}`,
    `Fontsize=${subtitle.size}`,
    'Bold=0',
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H00000000',
    `BackColour=${assColor(subtitle.backgroundColor, subtitle.backgroundOpacity)}`,
    `BorderStyle=${hasBox ? 3 : 1}`,
    `Outline=${hasBox ? 0.5 : 0.9}`,
    `Shadow=${hasBox ? 0 : 0.25}`,
    'Alignment=2',
    'MarginL=44',
    'MarginR=44',
    `MarginV=${subtitle.bottomMargin}`
  ].join(',');
  const filters = [`[0:v]subtitles='${escapedSrt}':charenc=UTF-8:force_style='${subtitleStyle}'[subv]`];
  const videoLabel = addWatermarkFilter(filters, '[subv]', watermarkInputIndex, watermark);
  const audioLabels = [];
  filters.push(`[0:a]volume=${tts.originalVolume.toFixed(2)}[a0]`);
  audioLabels.push('[a0]');
  cues.forEach((cue, i) => {
    const label = `a${i + 1}`;
    const ttsMixVolume = (0.95 * tts.volume).toFixed(2);
    const delay = Math.max(0, cue.start - TTS_SYNC_OFFSET_MS);
    filters.push(`[${i + 1}:a]loudnorm=I=-16:TP=-1.5:LRA=10,volume=${ttsMixVolume},adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-15:TP=-1.0:LRA=11,alimiter=limit=0.96[aout]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', videoLabel,
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', OUTPUT_PRESET,
    '-crf', OUTPUT_CRF,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', OUTPUT_AUDIO_BITRATE,
    '-movflags', '+faststart',
    '-shortest',
    output
  );
  await run(FFMPEG_BIN, args, job);
}

async function renderWatermarkedVideo(job, video, output, watermarkPath, watermark) {
  log(job, 'Đang chèn watermark vào video.');
  const filters = [];
  const videoLabel = addWatermarkFilter(filters, '[0:v]', 1, watermark);
  await run(FFMPEG_BIN, [
    '-y',
    '-i', video,
    '-i', watermarkPath,
    '-filter_complex', filters.join(';'),
    '-map', videoLabel,
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', OUTPUT_PRESET,
    '-crf', OUTPUT_CRF,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', OUTPUT_AUDIO_BITRATE,
    '-movflags', '+faststart',
    output
  ], job);
}

function addWatermarkFilter(filters, baseVideoLabel, watermarkInputIndex, watermark) {
  if (watermarkInputIndex < 0) return baseVideoLabel;
  const sizeExpr = `main_w*${(watermark.widthPercent / 100).toFixed(4)}`;
  const margin = watermark.margin;
  const position = watermarkOverlayPosition(watermark.position, margin);
  filters.push(`[${watermarkInputIndex}:v]setsar=1,format=rgba,colorchannelmixer=aa=${(watermark.opacity / 100).toFixed(2)}[wmraw]`);
  filters.push(`${baseVideoLabel}setsar=1[basefix]`);
  filters.push(`[wmraw][basefix]scale2ref=w=${sizeExpr}:h=${sizeExpr}[wm][basewm]`);
  filters.push(`[basewm][wm]overlay=${position}[v]`);
  return '[v]';
}

function watermarkOverlayPosition(position, margin) {
  if (position === 'top-left') return `${margin}:${margin}`;
  if (position === 'bottom-left') return `${margin}:main_h-overlay_h-${margin}`;
  if (position === 'bottom-right') return `main_w-overlay_w-${margin}:main_h-overlay_h-${margin}`;
  if (position === 'center') return `(main_w-overlay_w)/2:(main_h-overlay_h)/2`;
  return `main_w-overlay_w-${margin}:${margin}`;
}

async function resolveRapidApi(url, ai = {}) {
  const rapidApiKey = ai.rapidApiKey || RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error('Thieu RAPIDAPI_KEY trong giao dien hoac file .env');
  const response = await fetch('https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'auto-download-all-in-one.p.rapidapi.com',
      'x-rapidapi-key': rapidApiKey
    },
    body: JSON.stringify({ url })
  });
  if (!response.ok) throw new Error(`RapidAPI lỗi ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const medias = json.medias || [];
  const video = medias.find((m) => String(m.type || '').toLowerCase().includes('video') && m.url) || medias.find((m) => m.url);
  if (!video?.url) throw new Error('RapidAPI không trả về URL video hợp lệ.');
  return video.url;
}

async function fetchWithRetry(url, options, job, label, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const reason = error.cause?.message || error.message || String(error);
      if (attempt < attempts) {
        log(job, `${label} lỗi kết nối lần ${attempt}/${attempts}, thử lại: ${reason}`);
        await delay(1500 * attempt);
      }
    }
  }

  const reason = lastError?.cause?.message || lastError?.message || String(lastError);
  throw new Error(`${label} không kết nối được sau ${attempts} lần: ${reason}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadToFile(url, target, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Không tải được ${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, buffer);
}

function run(command, args, job) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text && job) log(job, text.slice(-500));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} thoát mã ${code}. ${stderr.slice(-1200)}`));
    });
  });
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function getMediaDurationMs(file) {
  const result = await runCapture(FFMPEG_BIN, ['-hide_banner', '-i', file]);
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

async function hasAudioStream(file) {
  const result = await runCapture(FFMPEG_BIN, ['-hide_banner', '-i', file]);
  return /Stream\s+#\d+:\d+.*Audio:/i.test(result.stderr);
}

function parseLinks(text) {
  return (text.match(/https?:\/\/[^\s]+/g) || []).map((url) => url.replace(/[),.]+$/g, ''));
}

function normalizeUrl(url) {
  if (url.includes('douyin.com') && url.includes('modal_id=')) {
    const match = url.match(/modal_id=(\d+)/);
    if (match?.[1]) return `https://www.douyin.com/video/${match[1]}`;
  }
  return url;
}

function parseSrtTime(value) {
  if (!value) return null;
  const cleaned = value.trim().replace('.', ',');
  let match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2}),(\d{1,3})$/);
  let hours;
  let minutes;
  let seconds;
  let millis;

  if (match) {
    hours = Number(match[1]);
    minutes = Number(match[2]);
    seconds = Number(match[3]);
    millis = Number(match[4].padEnd(3, '0'));
  } else {
    match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{1,3})$/);
    if (match) {
      hours = 0;
      minutes = Number(match[1]);
      seconds = Number(match[2]);
      millis = Number(match[3].padEnd(3, '0'));
    } else {
      match = cleaned.match(/^(\d{1,2}):(\d{2}),(\d{1,3})$/);
      if (!match) return null;
      hours = 0;
      minutes = Number(match[1]);
      seconds = Number(match[2]);
      millis = Number(match[3].padEnd(3, '0'));
    }
  }

  if ([hours, minutes, seconds, millis].some((part) => Number.isNaN(part))) return null;
  const ms = hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
  return { ms, srt: formatSrtTime(ms) };
}

function formatSrtTime(ms) {
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, '0')}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function wrapSubtitleText(text, maxLineLength = 28) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxLineLength || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  if (lines.length <= 2) return lines.join('\n');

  const midpoint = Math.ceil(words.length / 2);
  return [
    words.slice(0, midpoint).join(' '),
    words.slice(midpoint).join(' ')
  ].join('\n');
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeHexColor(value) {
  const match = String(value).trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : '#000000';
}

function assColor(hex, opacityPercent) {
  const clean = normalizeHexColor(hex).slice(1);
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round(255 * (100 - opacityPercent) / 100);
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`;
}

function log(job, message) {
  job.logs.push({ time: new Date().toISOString(), message });
}

function finish(job, file, message, cleanup = { enabled: false, delayMinutes: 30 }) {
  job.status = 'done';
  job.result = {
    fileName: path.basename(file),
    url: `/results/${job.id}/${encodeURIComponent(path.basename(file))}`,
    autoCleanup: cleanup.enabled,
    cleanupDelayMinutes: cleanup.delayMinutes
  };
  log(job, message);
  if (cleanup.enabled) scheduleJobCleanup(job, cleanup.delayMinutes);
}

function scheduleJobCleanup(job, delayMinutes) {
  const delayMs = delayMinutes * 60 * 1000;
  log(job, `Tự động xoá file job này sau ${delayMinutes} phút.`);
  setTimeout(async () => {
    try {
      await fs.rm(job.dir, { recursive: true, force: true });
      jobs.delete(job.id);
    } catch (error) {
      job.error = error.message || String(error);
      log(job, `Không xoá được file job: ${job.error}`);
    }
  }, delayMs).unref?.();
}

function fail(job, error) {
  job.status = 'error';
  job.error = error.message || String(error);
  log(job, `Lỗi: ${job.error}`);
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    logs: job.logs,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt
  };
}

async function getDiskInfo() {
  try {
    const statfs = await fs.statfs(ROOT);
    const freeBytes = Number(statfs.bavail) * Number(statfs.bsize);
    const totalBytes = Number(statfs.blocks) * Number(statfs.bsize);
    const usedPercent = totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 100) : null;
    return {
      ok: true,
      path: ROOT,
      freeBytes,
      totalBytes,
      usedPercent,
      warning: freeBytes < 10 * 1024 * 1024 * 1024
    };
  } catch (error) {
    return {
      ok: false,
      path: ROOT,
      freeBytes: null,
      totalBytes: null,
      usedPercent: null,
      warning: false,
      error: error.message || String(error)
    };
  }
}

async function checkForUpdate() {
  const repo = 'khaihoansk86-debug/Vietdub-Ai';
  let localCommit = '';
  try {
    const local = await runCapture('git', ['rev-parse', 'HEAD']);
    localCommit = local.stdout.trim();
  } catch {
    localCommit = '';
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
      headers: { 'User-Agent': 'VietDub-AI' }
    });
    if (!response.ok) {
      return { ok: false, localCommit, latestCommit: '', hasUpdate: false, message: `GitHub HTTP ${response.status}` };
    }
    const data = await response.json();
    const latestCommit = String(data.sha || '');
    return {
      ok: true,
      localCommit,
      latestCommit,
      hasUpdate: Boolean(localCommit && latestCommit && localCommit !== latestCommit),
      message: latestCommit ? `Latest: ${latestCommit.slice(0, 7)}` : 'No commit found'
    };
  } catch (error) {
    return { ok: false, localCommit, latestCommit: '', hasUpdate: false, message: error.message || String(error) };
  }
}

function extractIdFromUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/');
      return parts[parts.length - 1];
    }
    const pathParts = u.pathname.split('/').filter(Boolean);
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const part = pathParts[i];
      if (/^\d+$/.test(part) || part.length > 5) {
        return part;
      }
    }
  } catch {
    // Ignore URL parse error
  }
  return '';
}

async function generateUniqueFilename(targetDir, payload, job) {
  let baseName = 'vietdub_video';

  if (payload.videos && payload.videos.length > 0) {
    const orig = payload.videos[0].originalname;
    const ext = path.extname(orig);
    baseName = path.basename(orig, ext);
  } else {
    const links = parseLinks(payload.linksText);
    if (links.length > 0) {
      const firstUrl = links[0];
      try {
        const u = new URL(firstUrl);
        const domain = u.hostname.replace('www.', '').split('.')[0];
        const id = extractIdFromUrl(firstUrl);
        if (id) {
          baseName = `${domain}_${id}`;
        } else {
          baseName = `${domain}_video`;
        }
      } catch {
        baseName = 'vietdub_link';
      }
    }
  }

  baseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

  const ext = '.mp4';
  let finalName = `${baseName}${ext}`;
  let counter = 1;

  while (true) {
    const testPath = path.join(targetDir, finalName);
    if (!(await fileExists(testPath))) {
      break;
    }
    finalName = `${baseName}_${counter++}${ext}`;
  }

  return finalName;
}

async function copyToOutputDir(job, payload, sourceFile) {
  if (!payload.outputDir) return;
  const targetDir = String(payload.outputDir).trim();
  if (!targetDir) return;

  try {
    await fs.mkdir(targetDir, { recursive: true });
    const finalName = await generateUniqueFilename(targetDir, payload, job);
    const destPath = path.join(targetDir, finalName);

    log(job, `Đang sao chép kết quả sang thư mục lưu trữ: ${destPath}`);
    await fs.copyFile(sourceFile, destPath);
    log(job, `Đã lưu video thành công vào: ${destPath}`);
    job.savedTo = destPath;
  } catch (error) {
    log(job, `Lỗi khi lưu video sang thư mục lưu trữ: ${error.message}`);
  }
}

async function startKokoroBackend() {
  const possiblePaths = [
    path.join(process.cwd(), 'kokoro-vietnamese'),
    path.join(path.dirname(process.execPath), 'kokoro-vietnamese'),
    path.join(os.homedir(), 'VietDub-AI-Kokoro')
  ];

  let kokoroDir = '';
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      kokoroDir = p;
      console.log(`Đã tìm thấy thư mục Kokoro tại: ${kokoroDir}`);
      break;
    } catch {
      // Tiếp tục tìm
    }
  }

  // Nếu không tìm thấy ở bất cứ đâu, tự động clone về thư mục Home của người dùng
  if (!kokoroDir) {
    kokoroDir = path.join(os.homedir(), 'VietDub-AI-Kokoro');
    console.log(`Không tìm thấy Kokoro. Tiến hành tải về thư mục: ${kokoroDir}`);
    kokoroStatus = 'installing';
    kokoroInstallLog = 'Không tìm thấy thư mục Kokoro. Đang tiến hành tải tự động từ GitHub...\n';
    
    // Kiểm tra xem máy có Git không
    let hasGit = false;
    try {
      await new Promise((resolve, reject) => {
        const checkGit = spawn('git', ['--version']);
        checkGit.on('close', (code) => code === 0 ? resolve() : reject());
        checkGit.on('error', reject);
      });
      hasGit = true;
    } catch {
      hasGit = false;
    }

    if (!hasGit) {
      console.error('Không tìm thấy Git trên máy tính.');
      kokoroInstallLog += '[LỖI] Không tìm thấy phần mềm Git trên máy tính của bạn.\n';
      kokoroInstallLog += 'Vui lòng:\n';
      kokoroInstallLog += '1. Cài đặt Git (https://git-scm.com) rồi khởi động lại app.\n';
      kokoroInstallLog += `2. Hoặc tải/clone thủ công repo Kokoro-Vietnamese về thư mục: ${kokoroDir}\n`;
      kokoroStatus = 'error';
      return;
    }

    try {
      await fs.mkdir(os.homedir(), { recursive: true });
      
      const cloneProcess = spawn('git', ['clone', 'https://github.com/iamdinhthuan/Kokoro-Vietnamese.git', kokoroDir], {
        stdio: 'pipe'
      });

      cloneProcess.stdout.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });
      cloneProcess.stderr.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });

      const cloneExitCode = await new Promise((resolve) => {
        cloneProcess.on('close', resolve);
      });

      if (cloneExitCode !== 0) {
        throw new Error(`Git clone thất bại với mã thoát ${cloneExitCode}`);
      }
      kokoroInstallLog += 'Đã tải xong mã nguồn Kokoro! Đang tiến hành cấu hình...\n';
    } catch (err) {
      console.error('Lỗi khi tải mã nguồn Kokoro:', err.message);
      kokoroInstallLog += `[LỖI] Không thể tải mã nguồn: ${err.message}\n`;
      kokoroStatus = 'error';
      return;
    }
  }

  const venvPython = os.platform() === 'win32'
    ? path.join(kokoroDir, 'venv', 'Scripts', 'python.exe')
    : path.join(kokoroDir, 'venv', 'bin', 'python');
  const serverScript = path.join(kokoroDir, 'server_api.py');

  // Luôn ghi đè file server_api.py để đồng bộ bản mới nhất chạy ở cổng 8889
  console.log('Đang đồng bộ file server_api.py...');
  const serverApiContent = getKokoroServerApiContent();
  await fs.writeFile(serverScript, serverApiContent, 'utf-8');

  let hasVenv = false;
  try {
    await fs.access(venvPython);
    hasVenv = true;
  } catch {
    hasVenv = false;
  }

  // Kiểm tra xem các thư viện đã được cài đặt hoàn thiện trong venv chưa
  let venvIsReady = false;
  if (hasVenv) {
    console.log('Đang kiểm tra tính toàn vẹn của thư viện Kokoro trong venv...');
    try {
      venvIsReady = await new Promise((resolve) => {
        const checkProcess = spawn(venvPython, ['-c', 'import torch, kokoro_vietnamese, fastapi, uvicorn, soundfile, onnxruntime']);
        checkProcess.on('close', (code) => {
          resolve(code === 0);
        });
        checkProcess.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      venvIsReady = false;
    }
    console.log(`Kết quả kiểm tra thư viện Kokoro: ${venvIsReady ? 'ĐẦY ĐỦ' : 'THIẾU/LỖI'}`);
  }

  if (!hasVenv || !venvIsReady) {
    console.log('Khởi tạo hoặc sửa chữa venv tại:', kokoroDir);
    kokoroStatus = 'installing';
    kokoroInstallLog += 'Môi trường ảo Python Kokoro chưa sẵn sàng hoặc thiếu thư viện. Đang tiến hành cài đặt/sửa chữa...\n';
    
    try {
      if (hasVenv && !venvIsReady) {
        kokoroInstallLog += 'Phát hiện thư viện PyTorch bị lỗi DLL. Đang tiến hành xóa môi trường ảo venv cũ để cài lại bản CPU-only sạch sẽ...\n';
        try {
          cleanupKokoro(); // Tắt tiến trình python ngầm trước khi xóa
          const venvDir = path.join(kokoroDir, 'venv');
          await fs.rm(venvDir, { recursive: true, force: true });
          kokoroInstallLog += 'Đã xóa môi trường cũ thành công!\n';
          hasVenv = false; // Đặt về false để kích hoạt khối tạo venv mới ở dưới
        } catch (rmErr) {
          console.error('Không thể xóa thư mục venv:', rmErr.message);
          kokoroInstallLog += `[LỖI] Không thể tự động dọn dẹp thư mục venv cũ: ${rmErr.message}.\n`;
          kokoroInstallLog += `Vui lòng:\n1. Tắt app VietDub AI.\n2. Xóa thủ công thư mục venv tại: ${path.join(kokoroDir, 'venv')}\n3. Mở lại app để cài bản CPU-only.\n`;
          throw rmErr;
        }
      }

      if (!hasVenv) {
        kokoroInstallLog += 'Đang tạo môi trường ảo Python (venv) mới... (Quá trình này có thể tốn vài phút)\n';
        const venvProcess = spawn('python', ['-m', 'venv', 'venv'], {
          cwd: kokoroDir,
          stdio: 'pipe'
        });

        venvProcess.stdout.on('data', (data) => {
          kokoroInstallLog += data.toString();
        });
        venvProcess.stderr.on('data', (data) => {
          kokoroInstallLog += data.toString();
        });
        
        const venvExitCode = await new Promise((resolve) => {
          venvProcess.on('close', resolve);
        });
        
        if (venvExitCode !== 0) {
          throw new Error(`Tạo venv thất bại với mã thoát ${venvExitCode}`);
        }
      }
      
      kokoroInstallLog += 'Đang nâng cấp trình quản lý gói pip...\n';
      // Chạy pip install nâng cấp pip
      const pipProcess = spawn(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
        cwd: kokoroDir,
        stdio: 'pipe'
      });
      await new Promise((resolve) => pipProcess.on('close', resolve));

      kokoroInstallLog += 'Đang cài đặt phiên bản PyTorch CPU-only (Tối ưu hóa dung lượng nhẹ và sửa lỗi DLL)... (Tải khoảng 150MB)\n';
      const installTorchCpuProcess = spawn(venvPython, ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cpu'], {
        cwd: kokoroDir,
        stdio: 'pipe'
      });
      
      installTorchCpuProcess.stdout.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });
      installTorchCpuProcess.stderr.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });

      const torchExitCode = await new Promise((resolve) => {
        installTorchCpuProcess.on('close', resolve);
      });
      if (torchExitCode !== 0) {
        throw new Error(`Cài đặt PyTorch CPU-only thất bại với mã thoát ${torchExitCode}`);
      }

      kokoroInstallLog += 'Đang tiến hành cài đặt/sửa chữa thư viện Kokoro và các dependency khác (fastapi, uvicorn, soundfile, onnxruntime)...\n';
      const installDepsProcess = spawn(venvPython, ['-m', 'pip', 'install', '-e', '.', 'fastapi', 'uvicorn', 'soundfile', 'onnxruntime'], {
        cwd: kokoroDir,
        stdio: 'pipe'
      });
      
      installDepsProcess.stdout.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });
      installDepsProcess.stderr.on('data', (data) => {
        kokoroInstallLog += data.toString();
      });
      
      const installExitCode = await new Promise((resolve) => {
        installDepsProcess.on('close', resolve);
      });
      
      if (installExitCode !== 0) {
        throw new Error(`Cài đặt thư viện thất bại với mã thoát ${installExitCode}`);
      }
      
      kokoroInstallLog += 'Cài đặt thư viện thành công! Đang khởi chạy API server...\n';
      kokoroStatus = 'starting';
      launchKokoroServer(venvPython, serverScript);
    } catch (err) {
      console.error('Lỗi thiết lập venv:', err.message);
      kokoroInstallLog += `[LỖI] Thiết lập venv thất bại: ${err.message}\n`;
      kokoroStatus = 'error';
    }
  } else {
    kokoroStatus = 'starting';
    launchKokoroServer(venvPython, serverScript);
  }
}

function launchKokoroServer(pythonBin, scriptPath) {
  const env = { ...process.env };
  delete env.PORT; // Tránh việc Python server lấy nhầm cổng 3210 của NodeJS cha
  
  kokoroProcess = spawn(pythonBin, [scriptPath], {
    cwd: path.dirname(scriptPath),
    stdio: 'pipe',
    env: env
  });

  kokoroProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    kokoroServerLog += msg;
    console.log(`[Kokoro Server] ${msg.trim()}`);
  });

  kokoroProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    kokoroServerLog += msg;
    console.error(`[Kokoro Server Error] ${msg.trim()}`);
  });

  kokoroProcess.on('close', (code) => {
    const msg = `Kokoro Server đã đóng với mã thoát ${code}\n`;
    kokoroServerLog += msg;
    console.log(msg.trim());
    kokoroStatus = 'stopped';
    kokoroProcess = null;
  });

  pollKokoroHealth();
}

async function pollKokoroHealth() {
  const url = process.env.KOKORO_SERVER_URL || 'http://localhost:8889/health';
  let attempts = 0;
  const maxAttempts = 300; 
  
  while (attempts < maxAttempts) {
    if (kokoroStatus !== 'starting') break;
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log('Kokoro Local API Server đã sẵn sàng ở cổng 8889!');
        kokoroStatus = 'ready';
        break;
      }
    } catch {
      // Bỏ qua lỗi kết nối
    }
    attempts++;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (kokoroStatus === 'starting') {
    console.error('Không kết nối được với Kokoro server.');
    kokoroStatus = 'error';
  }
}

function cleanupKokoro() {
  if (kokoroProcess) {
    console.log('Đang tắt tiến trình Kokoro server ngầm...');
    kokoroProcess.kill();
    kokoroProcess = null;
  }
}

process.on('exit', cleanupKokoro);
process.on('SIGINT', () => {
  cleanupKokoro();
  process.exit();
});
process.on('SIGTERM', () => {
  cleanupKokoro();
  process.exit();
});

function getKokoroServerApiContent() {
  return `import os
import sys
import io
import torch
import uvicorn
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

try:
    from kokoro_vietnamese import KokoroVietnamese
except ImportError:
    sys.path.append(os.path.dirname(__file__))
    from kokoro_vietnamese import KokoroVietnamese

app = FastAPI(title="Kokoro Vietnamese TTS API")

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device selected: {device}")

tts_instances = {}

def get_tts_instance(voice: str):
    if voice not in tts_instances:
        print(f"Loading Kokoro model for voice: {voice}...")
        tts_instances[voice] = KokoroVietnamese(device=device, voice=voice)
    return tts_instances[voice]

class TTSRequest(BaseModel):
    text: str
    voice: str = "diem_trinh"
    speed: float = 1.0

@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        tts = get_tts_instance(req.voice)
        audio, phonemes = tts.synthesize(req.text, speed=req.speed)
        wav_io = io.BytesIO()
        sf.write(wav_io, audio, 24000, format='WAV', subtype='PCM_16')
        wav_io.seek(0)
        return StreamingResponse(wav_io, media_type="audio/wav")
    except Exception as e:
        print(f"Error during TTS synthesis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok", "device": device}

if __name__ == "__main__":
    port = int(os.environ.get("KOKORO_PORT", 8889))
    uvicorn.run(app, host="0.0.0.0", port=port)
`;
}
