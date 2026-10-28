import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

function getDataDir() {
  if (process.env.VIETDUB_DATA_DIR) {
    if (!fs.existsSync(process.env.VIETDUB_DATA_DIR)) {
      fs.mkdirSync(process.env.VIETDUB_DATA_DIR, { recursive: true });
    }
    return process.env.VIETDUB_DATA_DIR;
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    const appDataPath = path.join(process.env.APPDATA, 'vietdub-ai-local', 'data');
    if (fs.existsSync(appDataPath)) {
      return appDataPath;
    }
  }
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getVoiceStudioOutputDir() {
  const preferred = 'D:\\VietDubOutputs\\VoiceStudio';
  try {
    if (fs.existsSync('D:\\') || process.platform !== 'win32') {
      if (!fs.existsSync(preferred)) {
        fs.mkdirSync(preferred, { recursive: true });
      }
      return preferred;
    }
  } catch {}

  const fallback = path.join(getDataDir(), 'VoiceStudio_Outputs');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true });
  }
  return fallback;
}

const PROFILES_FILE = () => path.join(getDataDir(), 'voice_profiles.json');
const SAMPLES_DIR = () => path.join(getDataDir(), 'voice_samples');

function ensureDirectories() {
  const samplesDir = SAMPLES_DIR();
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }
  const outDir = getVoiceStudioOutputDir();
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
}

function unpackAsarPath(filePath) {
  if (!filePath) return filePath;
  return process.versions.electron ? filePath.replace('app.asar', 'app.asar.unpacked') : filePath;
}

const FFMPEG_BIN = process.env.FFMPEG_BIN || unpackAsarPath(ffmpegStatic) || 'ffmpeg';

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-400)}`));
    });
    proc.on('error', reject);
  });
}

export function listVoiceProfiles() {
  ensureDirectories();
  const file = PROFILES_FILE();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) return data;
    } catch (err) {
      console.warn('Lỗi đọc voice_profiles.json:', err.message);
    }
  }
  return [];
}

export function saveVoiceProfiles(profiles) {
  ensureDirectories();
  fs.writeFileSync(PROFILES_FILE(), JSON.stringify(profiles, null, 2), 'utf8');
}

export function getVoiceProfile(id) {
  const profiles = listVoiceProfiles();
  return profiles.find((p) => p.id === id) || null;
}

export async function createVoiceProfile({ name, description = '', prompt = '', tags = [], sourceAudioPath, originalName = '' }) {
  ensureDirectories();
  if (!sourceAudioPath || !fs.existsSync(sourceAudioPath)) {
    throw new Error('File âm thanh mẫu không tồn tại hoặc không hợp lệ.');
  }

  const id = `vp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const targetWav = path.join(SAMPLES_DIR(), `${id}.wav`);

  // Convert source audio to clean, standardized 24kHz mono WAV
  try {
    await runFfmpeg([
      '-y',
      '-i', sourceAudioPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      targetWav
    ]);
  } catch (err) {
    // If FFmpeg fails, copy directly as fallback
    await fsp.copyFile(sourceAudioPath, targetWav);
  }

  const stat = fs.statSync(targetWav);
  // Estimate duration (24000 samples/sec * 2 bytes/sample = 48000 bytes/sec for 16-bit mono)
  const durationEstimate = Math.max(1, Math.round(stat.size / 48000));

  const parsedTags = Array.isArray(tags)
    ? tags
    : String(tags || '').split(/[,;]+/).map((t) => t.trim()).filter(Boolean);

  const newProfile = {
    id,
    name: String(name || 'Giọng AI Mới').trim(),
    description: String(description || '').trim(),
    prompt: String(prompt || '').trim(),
    tags: parsedTags.length > 0 ? parsedTags : ['Clone Voice', 'AI'],
    sampleFile: `${id}.wav`,
    samplePath: targetWav,
    size: stat.size,
    durationSec: durationEstimate,
    createdAt: new Date().toISOString()
  };

  const profiles = listVoiceProfiles();
  profiles.unshift(newProfile);
  saveVoiceProfiles(profiles);

  return newProfile;
}

export async function deleteVoiceProfile(id) {
  const profiles = listVoiceProfiles();
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    return { ok: false, message: 'Không tìm thấy hồ sơ giọng.' };
  }

  const [removed] = profiles.splice(index, 1);
  saveVoiceProfiles(profiles);

  if (removed.samplePath && fs.existsSync(removed.samplePath)) {
    try {
      await fsp.unlink(removed.samplePath);
    } catch {}
  }

  return { ok: true, message: `Đã xóa hồ sơ giọng "${removed.name}".` };
}

export async function checkVoiceStudioEngineStatus(voiceStudioUrl = 'http://127.0.0.1:8000') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${voiceStudioUrl}/docs`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok || res.status === 200 || res.status === 404) {
      return { online: true, url: voiceStudioUrl, message: 'VoiceStudio Engine đang hoạt động online.' };
    }
  } catch {}

  // Also check Kokoro local on port 8889
  const kokoroUrl = process.env.KOKORO_SERVER_URL || 'http://localhost:8889/health';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(kokoroUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return { online: true, url: kokoroUrl, engine: 'Kokoro-Vietnamese', message: 'Kokoro Vietnamese Engine sẵn sàng.' };
    }
  } catch {}

  return { online: false, url: voiceStudioUrl, message: 'VoiceStudio local API chưa bật (Đang dùng Built-in Neural Engine).' };
}

export async function synthesizeVoiceStudioAudio({
  text,
  profileId = null,
  voice = 'vi-VN-HoaiMyNeural',
  speed = 1.0,
  pitch = 0,
  volume = 1.0,
  emotionPrompt = '',
  format = 'wav',
  outputDir = null,
  savePermanent = false,
  synthesizeTtsTextFn = null,
  voiceStudioUrl = 'http://127.0.0.1:8000'
}) {
  if (!text || !text.trim()) {
    throw new Error('Vui lòng nhập nội dung kịch bản cần phát giọng nói.');
  }

  ensureDirectories();
  const cleanText = text.trim();
  const targetDir = outputDir || getVoiceStudioOutputDir();
  const tempWav = path.join(os.tmpdir(), `vs_temp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.wav`);

  let profile = null;
  if (profileId) {
    profile = getVoiceProfile(profileId);
  }

  let synthesized = false;

  // 1. Try VoiceStudio Local API if online
  if (voiceStudioUrl) {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 3000);
      const payload = {
        model: 'voicestudio-tts',
        input: cleanText,
        voice: profile?.sampleFile || voice,
        speed: Number(speed) || 1.0,
        response_format: 'wav'
      };

      const res = await fetch(`${voiceStudioUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fsp.writeFile(tempWav, buf);
        synthesized = true;
      }
    } catch {}
    finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // 2. Built-in High Quality Fallback (Kokoro-VN or Edge-TTS or synthesizeTtsTextFn)
  if (!synthesized) {
    const rawTemp = path.join(os.tmpdir(), `vs_raw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.mp3`);
    try {
      if (typeof synthesizeTtsTextFn === 'function') {
        const ttsOptions = {
          provider: voice.startsWith('vi-VN-') ? 'edge-neural' : 'kokoro-local',
          voice: profile ? (profile.tags.includes('Nam') ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural') : voice,
          speed: Math.max(0.7, Math.min(1.5, Number(speed) || 1.0)),
          volume: Math.max(0.5, Math.min(1.5, Number(volume) || 1.0)),
          style: 'natural'
        };
        await synthesizeTtsTextFn(cleanText, rawTemp, ttsOptions, null);
      } else {
        // Direct edge-tts fallback command if available
        const voiceChoice = profile ? (profile.tags.includes('Nam') ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural') : voice;
        await new Promise((resolve, reject) => {
          const edgeProcess = spawn('edge-tts', [
            '--voice', voiceChoice,
            '--text', cleanText,
            '--write-media', rawTemp
          ]);
          edgeProcess.on('close', (code) => {
            if (code === 0 && fs.existsSync(rawTemp)) resolve();
            else reject(new Error(`edge-tts failed with code ${code}`));
          });
          edgeProcess.on('error', reject);
        });
      }

      // Convert raw audio to clean WAV and apply pitch/tone morphing if cloned profile has styling
      const audioFilters = [];
      const numPitch = Number(pitch) || 0;
      if (numPitch !== 0) {
        // Pitch scale in semitones or rubberband
        const pitchFactor = Math.pow(2, numPitch / 12);
        audioFilters.push(`asetrate=24000*${pitchFactor.toFixed(3)},aresample=24000`);
      }
      if (emotionPrompt && emotionPrompt.toLowerCase().includes('trầm')) {
        audioFilters.push('equalizer=f=120:width_type=o:width=2:g=3');
      } else if (emotionPrompt && emotionPrompt.toLowerCase().includes('trong')) {
        audioFilters.push('equalizer=f=3000:width_type=o:width=1.5:g=2.5');
      }

      const ffmpegArgs = ['-y', '-i', rawTemp];
      if (audioFilters.length > 0) {
        ffmpegArgs.push('-af', audioFilters.join(','));
      }
      ffmpegArgs.push('-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', tempWav);

      await runFfmpeg(ffmpegArgs);
      try { await fsp.unlink(rawTemp); } catch {}
      synthesized = true;
    } catch (fallbackErr) {
      throw new Error(`Tổng hợp giọng nói thất bại: ${fallbackErr.message}`);
    }
  }

  // 3. Export to final format (WAV or MP3)
  const ext = format === 'mp3' ? 'mp3' : 'wav';
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeProfileName = (profile?.name || voice || 'Audio').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_');
  const filename = `VoiceStudio_${safeProfileName}_${timestamp}.${ext}`;
  const finalPath = path.join(targetDir, filename);

  const exportArgs = ['-y', '-i', tempWav];
  if (ext === 'mp3') {
    exportArgs.push('-codec:a', 'libmp3lame', '-qscale:a', '2', finalPath);
  } else {
    exportArgs.push('-acodec', 'pcm_s16le', '-ar', '24000', finalPath);
  }
  await runFfmpeg(exportArgs);

  if (!savePermanent) {
    // If not permanent export, keep temp file and return path
  }

  const stat = fs.statSync(finalPath);
  return {
    ok: true,
    filename,
    filePath: finalPath,
    audioPath: finalPath,
    format: ext,
    sizeBytes: stat.size,
    sizeMB: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
    profileName: profile?.name || voice,
    message: `Đã xuất file âm thanh thành công vào: ${finalPath}`
  };
}

export async function exportVoiceStudioAudio(options = {}) {
  return synthesizeVoiceStudioAudio({ ...options, savePermanent: true });
}

export function openFileInExplorer(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    throw new Error('Đường dẫn file không tồn tại.');
  }

  if (process.platform === 'win32') {
    spawn('explorer.exe', ['/select,', path.resolve(targetPath)], { detached: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawn('open', ['-R', path.resolve(targetPath)], { detached: true, stdio: 'ignore' });
  } else {
    spawn('xdg-open', [path.dirname(targetPath)], { detached: true, stdio: 'ignore' });
  }
  return { ok: true, message: 'Đã mở thư mục chứa file trong hệ thống.' };
}
