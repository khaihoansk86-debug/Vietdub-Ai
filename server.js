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

const app = express();
const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve('.');
const DATA_DIR = path.join(ROOT, 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const PUBLIC_DIR = path.join(ROOT, 'public');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const FFMPEG_BIN = process.env.FFMPEG_BIN || ffmpegStatic || 'ffmpeg';
const YTDLP_BIN = process.env.YTDLP_BIN || path.join(ROOT, 'node_modules', 'yt-dlp-exec', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

await fs.mkdir(JOBS_DIR, { recursive: true });
await fs.mkdir(PUBLIC_DIR, { recursive: true });

const upload = multer({ dest: path.join(os.tmpdir(), 'vietdub_uploads') });
const jobs = new Map();

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
    tts: parseTtsOptions(req.body),
    subtitle: parseSubtitleOptions(req.body),
    cleanup: parseCleanupOptions(req.body),
    watermark: parseWatermarkOptions(req.body),
    videos: req.files?.videos || [],
    srtFile: req.files?.srtFile?.[0] || null,
    watermarkFile: req.files?.watermarkFile?.[0] || null
  };

  res.json({ id });
  processJob(job, payload).catch((error) => fail(job, error));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(publicJob(job));
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

app.post('/api/cleanup', async (_req, res) => {
  await fs.rm(JOBS_DIR, { recursive: true, force: true });
  await fs.mkdir(JOBS_DIR, { recursive: true });
  jobs.clear();
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, HOST, () => {
  console.log(`VietDub AI is running at http://${HOST}:${PORT}`);
});

async function processJob(job, payload) {
  job.status = 'running';
  log(job, 'Đã tiếp nhận yêu cầu.');

  const videoInputs = await prepareInputs(job, payload);
  if (!videoInputs.length) throw new Error('Chưa có video hoặc link video.');

  const merged = path.join(job.dir, 'merged_input.mp4');
  await mergeVideos(job, videoInputs, merged);
  const watermarkPath = await prepareWatermark(job, payload.watermarkFile, payload.watermark);

  if (payload.mode === 'download' || payload.mode === 'raw') {
    const out = path.join(job.dir, 'Raw_Video.mp4');
    if (watermarkPath) {
      await renderWatermarkedVideo(job, merged, out, watermarkPath, payload.watermark);
    } else {
      await fs.copyFile(merged, out);
    }
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
    await createSrtWithGemini(job, merged, srt);
  }

  const normalizedSrt = path.join(job.dir, 'subtitle_normalized.srt');
  const cues = await normalizeAndParseSrt(srt, normalizedSrt, payload.subtitle.maxLineLength);
  log(job, `Đã chuẩn hóa ${cues.length} dòng phụ đề.`);

  const voiceFiles = await createTtsFiles(job, cues, payload.tts);
  const finalVideo = path.join(job.dir, 'VietDub_Final.mp4');
  await renderFinal(job, merged, normalizedSrt, cues, voiceFiles, finalVideo, payload.subtitle, watermarkPath, payload.watermark, payload.tts);
  finish(job, finalVideo, 'Hoàn tất tạo phụ đề và lồng tiếng.', payload.cleanup);
}

function parseTtsOptions(body) {
  const provider = ['edge-neural', 'google-translate'].includes(body.ttsProvider) ? body.ttsProvider : 'edge-neural';
  const voices = new Map([
    ['vi-VN-HoaiMyNeural', 'vi-VN-HoaiMyNeural'],
    ['vi-VN-NamMinhNeural', 'vi-VN-NamMinhNeural']
  ]);
  return {
    provider,
    voice: voices.get(String(body.voice || '')) || 'vi-VN-HoaiMyNeural',
    speed: clampNumber(body.ttsSpeed, 0.75, 1.25, 0.92),
    volume: clampNumber(body.ttsVolume, 0.6, 1.8, 1.15)
  };
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
      const mediaUrl = await resolveRapidApi(url);
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

async function mergeVideos(job, inputs, output) {
  if (inputs.length === 1) {
    await fs.copyFile(inputs[0], output);
    log(job, 'Đã chuẩn bị video đầu vào.');
    return;
  }

  const list = path.join(job.dir, 'concat.txt');
  await fs.writeFile(list, inputs.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
  log(job, `Đang ghép ${inputs.length} video.`);
  try {
    await run(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', output], job);
  } catch {
    log(job, 'Ghép copy không thành công, chuyển sang encode lại.');
    await run(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=1080:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', output], job);
  }
}

async function createSrtWithGemini(job, video, srtPath) {
  if (!GEMINI_API_KEY) throw new Error('Thiếu GEMINI_API_KEY trong file .env');
  const audio = path.join(job.dir, 'audio.mp3');
  log(job, 'Đang trích xuất audio để tạo phụ đề.');
  await run(FFMPEG_BIN, ['-y', '-i', video, '-q:a', '0', '-map', 'a', audio], job);
  const audioBase64 = await fs.readFile(audio, 'base64');
  log(job, 'Đang gọi Gemini để tạo SRT.');

  const systemInstruction = 'Ban la bien dich vien phu de va dao dien long tieng tieng Viet. Nhiem vu: nghe audio, hieu dung ngu canh video, dich hoac viet lai bang tieng Viet tu nhien, ngan gon, de doc thanh tieng. Chi tra ve SRT hop le, tuyet doi khong giai thich.';
  const prompt = `Tao phu de SRT tieng Viet tu audio dinh kem de dung cho long tieng.

YEU CAU DICH VA NGU CANH:
- Neu audio la ngon ngu khac, dich thoat y sang tieng Viet tu nhien, dung ngu canh, dung sac thai, khong dich tung chu.
- Neu audio da la tieng Viet, chep hoac luoc lai cho ro nghia va de long tieng.
- Giu dung dai tu xung ho, cam xuc, y hai huoc, muc do lich su/than mat neu co.
- Khong them noi dung khong co trong audio.

YEU CAU NHIP LONG TIENG:
- Moi cau phai du ngan de TTS doc kip trong khoang thoi gian cua block.
- Uu tien cau Viet gon, tu nhien; bo tu dem khong can thiet.
- Moi block toi da 42 ky tu hoac 10 tu; neu cau dai hay chia nhieu block noi tiep.
- Moi block nen dai 1.0 den 3.2 giay, tranh block qua ngan duoi 0.7 giay tru khi bat buoc.
- Khong de loi thoai Viet dai hon nhip noi goc; neu can hay tom y.

DINH DANG BAT BUOC:
1
00:00:00,000 --> 00:00:02,000
Noi dung tieng Viet.

2
00:00:02,000 --> 00:00:04,000
Noi dung tiep theo.

Chi tra ve SRT thuan, khong markdown, khong code fence va khong ghi chu.`;
  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } }
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
  const blocks = srt.split(/\n{2,}/);
  const cues = [];
  let normalized = '';
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex < 0) continue;
    const [rawStart, rawEnd] = lines[timeIndex].split('-->').map((part) => part.trim());
    const start = parseSrtTime(rawStart);
    const end = parseSrtTime(rawEnd);
    if (!start || !end || end.ms <= start.ms) continue;
    const text = lines.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    cues.push({ index: cues.length + 1, start: start.ms, end: end.ms, text });
    normalized += `${cues.length}\n${start.srt} --> ${end.srt}\n${wrapSubtitleText(text, maxLineLength)}\n\n`;
  }
  if (!cues.length) throw new Error('SRT không có dòng phụ đề hợp lệ.');
  await fs.writeFile(output, normalized, 'utf8');
  return cues;
}

async function createTtsFiles(job, cues, tts) {
  const files = [];

  for (const cue of cues) {
    const target = path.join(job.dir, `tts_${String(cue.index).padStart(4, '0')}.mp3`);
    const text = cue.text.slice(0, 180);
    await synthesizeTtsText(text, target, tts, job, cue.index);
    files.push(target);
    if (cue.index % 5 === 0 || cue.index === cues.length) log(job, `Đã tạo TTS ${cue.index}/${cues.length}.`);
  }
  return files;
}

async function synthesizeTtsText(text, target, tts, job, cueIndex = 0) {
  if (tts.provider === 'google-translate') {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
    await downloadToFile(url, target, { 'User-Agent': 'Mozilla/5.0' });
    return;
  }

  const ratePercent = Math.round((tts.speed - 1) * 100);
  const volumePercent = Math.round((tts.volume - 1) * 100);
  const rateArg = `--rate=${ratePercent >= 0 ? '+' : ''}${ratePercent}%`;
  const volumeArg = `--volume=${volumePercent >= 0 ? '+' : ''}${volumePercent}%`;

  try {
    await run('python', [
      '-m', 'edge_tts',
      '--voice', tts.voice,
      rateArg,
      volumeArg,
      '--text', text,
      '--write-media', target
    ], job);
  } catch (error) {
    if (job) log(job, `Edge TTS lỗi${cueIndex ? ` ở câu ${cueIndex}` : ''}, chuyển sang Google TTS: ${error.message}`);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;
    await downloadToFile(url, target, { 'User-Agent': 'Mozilla/5.0' });
  }
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
  filters.push('[0:a]volume=0.38[a0]');
  audioLabels.push('[a0]');
  cues.forEach((cue, i) => {
    const label = `a${i + 1}`;
    const ttsMixVolume = (1.1 * tts.volume).toFixed(2);
    filters.push(`[${i + 1}:a]loudnorm=I=-15:TP=-1.2:LRA=9,volume=${ttsMixVolume},adelay=${cue.start}|${cue.start}[${label}]`);
    audioLabels.push(`[${label}]`);
  });
  filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=10,alimiter=limit=0.96[aout]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', videoLabel,
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '192k',
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
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'copy',
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

async function resolveRapidApi(url) {
  if (!RAPIDAPI_KEY) throw new Error('Thiếu RAPIDAPI_KEY trong file .env');
  const response = await fetch('https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'auto-download-all-in-one.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY
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
