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
  if (process.env.VOICESTUDIO_URL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${voiceStudioUrl}/docs`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status === 200 || res.status === 404) {
        return { online: true, ok: true, success: true, hasVoiceStudio: true, url: voiceStudioUrl, message: 'VoiceStudio Engine đang hoạt động online.' };
      }
    } catch {}
  }

  // Check Kokoro local on port 8889
  const kokoroUrl = process.env.KOKORO_SERVER_URL || 'http://localhost:8889/health';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(kokoroUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return { online: true, ok: true, success: true, hasVoiceStudio: false, url: kokoroUrl, engine: 'Kokoro-Vietnamese', message: 'Kokoro Vietnamese Engine sẵn sàng (Offline).' };
    }
  } catch {}

  return { online: false, ok: true, success: true, hasVoiceStudio: false, url: voiceStudioUrl, message: 'Built-in Neural Engine sẵn sàng.' };
}

export function resolveEmotionAcoustics(emotionPrompt = '', userSpeed = 1.0, userPitch = 0, userVolume = 100) {
  const p = (emotionPrompt || '').toLowerCase();
  let speedMultiplier = 1.0;
  let promptPitchSemitones = 0;
  const audioFilters = [];

  // 1. TRỤC TỐC ĐỘ (TEMPO / PACING)
  const isFast = /nhanh|gấp|dồn dập|sôi nổi|hào hứng|khẩn cấp|vội|hối hả|hoảng loạn|thể thao|livestream/.test(p);
  const isSlow = /chậm|từ tốn|thong thả|tâm sự|sâu lắng|mệt mỏi|uể oải|buồn|thì thầm|triết lý|trầm ngâm|thư giãn/.test(p);
  if (isFast && !isSlow) speedMultiplier *= 1.12;
  else if (isSlow && !isFast) speedMultiplier *= 0.88;

  // 2. TRỤC CAO ĐỘ (PITCH / TONALITY)
  const isHigh = /cao|véo von|trẻ|vui|sáng|hài hước|dí dỏm|phấn khích|hốt hoảng|ngọt ngào/.test(p);
  const isDeep = /trầm|sâu|thấp|nghiêm|gằn|nam|uy lực|đe dọa|lạnh lùng|quyền lực|tối|nguy hiểm/.test(p);
  if (isHigh && !isDeep) promptPitchSemitones += 1.8;
  else if (isDeep && !isHigh) promptPitchSemitones -= 1.6;

  // 3. TRỤC NĂNG LƯỢNG & ĐỘ NÉN ĐIỆN ẢNH (CINEMATIC COMPRESSION)
  if (/kịch tính|hành động|gay cấn|hồi hộp|quảng cáo|trailer|mạnh|dứt khoát|bán hàng|phim|chiến đấu/.test(p)) {
    audioFilters.push(
      'compand=attacks=0.02:decays=0.15:points=-75/-75|-42/-22|-18/-8|0/-1.5:gain=3.5',
      'equalizer=f=95:width_type=q:w=1.2:g=4.5',
      'equalizer=f=480:width_type=q:w=1.5:g=-3.0',
      'equalizer=f=3300:width_type=q:w=1.2:g=4.2'
    );
  }

  // 4. TRỤC ẤM ÁP & TRẦM ĐẶC (WARMTH & CHEST RESONANCE)
  if (/ấm|trầm|dày|ngực|mộc|tâm sự|kể chuyện|truyền cảm|sâu sắc/.test(p)) {
    audioFilters.push(
      'equalizer=f=135:width_type=q:w=1.4:g=5.0',
      'equalizer=f=6000:width_type=q:w=1.0:g=-2.5'
    );
  }

  // 5. TRỤC TƯƠI SÁNG & NĂNG LƯỢNG (EXCITER & PRESENCE)
  if (/sáng|trong|năng lượng|tươi|bén|rõ|hào hứng|nhiệt huyết/.test(p)) {
    audioFilters.push(
      'equalizer=f=2600:width_type=q:w=1.4:g=3.8',
      'equalizer=f=7500:width_type=q:w=1.2:g=3.0'
    );
  }

  // 6. TRỤC KHÔNG GIAN PHÒNG THU HOẶC MA MỊ (REVERB / AMBIENCE)
  if (/ma mị|bí ẩn|kinh dị|lạnh lẽo|hư ảo|vũ trụ|xa xăm|vang|rùng rợn/.test(p)) {
    audioFilters.push('aecho=0.8:0.88:60|120:0.35|0.22');
  } else if (/tâm sự|kể chuyện|nhẹ nhàng|suy ngẫm/.test(p)) {
    audioFilters.push('aecho=0.8:0.85:28:0.15');
  }

  // 7. TRỤC TRANG TRỌNG / PHÁT THANH / BÌNH LUẬN (BROADCAST)
  if (/trang trọng|tin tức|thời sự|chuyên nghiệp|phát thanh|mc|bình luận viên/.test(p)) {
    audioFilters.push(
      'highpass=f=85',
      'equalizer=f=220:width_type=q:w=1.5:g=2.5',
      'equalizer=f=3200:width_type=q:w=1.2:g=3.0'
    );
  }

  // 8. TRỤC LOA PHÁT THANH / ĐIỆN THOẠI (TELEPHONE / MEGAPHONE)
  if (/điện thoại|loa phát thanh|radio cổ|cổ điển|bộ đàm/.test(p)) {
    audioFilters.push('highpass=f=350,lowpass=f=3200,volume=1.2');
  }

  const effectiveSpeed = Math.max(0.5, Math.min(2.0, (Number(userSpeed) || 1.0) * speedMultiplier));
  const totalPitchSemitones = (Number(userPitch) || 0) / 10 + promptPitchSemitones;

  if (Math.abs(totalPitchSemitones) > 0.05) {
    const pitchScale = Math.pow(2, totalPitchSemitones / 12);
    audioFilters.unshift('rubberband=pitch=' + pitchScale.toFixed(4));
  }

  // Volume Normalizer: handles 100 (percentage) or 1.0 (multiplier) cleanly
  let volMultiplier = 1.0;
  const numVol = Number(userVolume);
  if (!isNaN(numVol) && numVol > 0) {
    volMultiplier = numVol > 2.5 ? (numVol / 100.0) : numVol;
  }

  return {
    effectiveSpeed,
    volMultiplier,
    audioFilters
  };
}

export function normalizeVietnameseScript(text) {
  if (!text) return '';
  let s = String(text);
  
  // Percent
  s = s.replace(/(\d+)\s*%/g, '$1 phần trăm');
  // Currency / Units
  s = s.replace(/(\d+)\s*k\b/gi, '$1 nghìn');
  s = s.replace(/(\d+)\s*tr\b/gi, '$1 triệu');
  s = s.replace(/(\d+)\s*đ\b/gi, '$1 đồng');
  s = s.replace(/(\d+)\s*vnd\b/gi, '$1 đồng');
  s = s.replace(/\$\s*(\d+)/g, '$1 đô la');
  s = s.replace(/(\d+)\s*\$/g, '$1 đô la');
  
  // Common abbreviations
  s = s.replace(/\bOK\b/gi, 'ô kê');
  s = s.replace(/\bTP\.?\s*HCM\b/gi, 'thành phố Hồ Chí Minh');
  s = s.replace(/\bTP\.?\s*HN\b/gi, 'thành phố Hà Nội');
  s = s.replace(/\bTP\./gi, 'thành phố ');
  s = s.replace(/\bĐ\/c\b/gi, 'địa chỉ');
  s = s.replace(/\bĐT\b/gi, 'điện thoại');
  s = s.replace(/\bBS\./gi, 'bác sĩ ');
  s = s.replace(/\bTS\./gi, 'tiến sĩ ');
  s = s.replace(/\bĐH\b/gi, 'đại học');
  s = s.replace(/\bTHCS\b/gi, 'trung học cơ sở');
  s = s.replace(/\bTHPT\b/gi, 'trung học phổ thông');

  return s;
}

export async function synthesizeVoiceStudioAudio({
  text,
  profileId = null,
  voice = 'diem_trinh',
  speed = 1.0,
  pitch = 0,
  volume = 100,
  emotionPrompt = '',
  format = 'wav',
  outputDir = null,
  savePermanent = false,
  synthesizeTtsTextFn = null,
  voiceStudioUrl = null
}) {
  if (!text || !text.trim()) {
    throw new Error('Vui lòng nhập nội dung kịch bản cần phát giọng nói.');
  }

  ensureDirectories();
  const cleanText = normalizeVietnameseScript(text.trim());
  const targetDir = outputDir || getVoiceStudioOutputDir();

  let profile = null;
  if (profileId) {
    profile = getVoiceProfile(profileId);
  }

  // 1. Calculate acoustic transformation from emotion prompt, speed, pitch, volume
  const { effectiveSpeed, volMultiplier, audioFilters } = resolveEmotionAcoustics(emotionPrompt, speed, pitch, volume);

  // If cloned profile has custom timbre, apply custom tone
  if (profile) {
    if (profile.tags && (profile.tags.includes('Nam') || profile.tags.some(t => /nam/i.test(t)))) {
      audioFilters.push('equalizer=f=140:width_type=q:w=1.5:g=3.0');
    } else if (profile.tags && (profile.tags.includes('Nữ') || profile.tags.some(t => /nữ|nu/i.test(t)))) {
      audioFilters.push('equalizer=f=2800:width_type=q:w=1.5:g=2.5');
    }
  }

  const rawTemp = path.join(os.tmpdir(), `vs_raw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.wav`);
  let synthesized = false;

  // 2. Try external VoiceStudio Local API ONLY if explicitly configured
  if (voiceStudioUrl && voiceStudioUrl !== 'http://127.0.0.1:8000' && process.env.VOICESTUDIO_URL) {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 2000);
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
        await fsp.writeFile(rawTemp, buf);
        synthesized = true;
      }
    } catch {}
    finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // 3. Primary Built-in Local Engine (Kokoro-VN) or Fallback (Edge-TTS / Chunked Google)
  if (!synthesized) {
    try {
      const kokoroVoiceMap = {
        'vi-VN-HoaiMyNeural': 'diem_trinh',
        'vi-VN-NamMinhNeural': 'manh_dung'
      };
      let selectedVoice = kokoroVoiceMap[voice] || voice;
      if (profile) {
        const isMale = profile.tags && (profile.tags.includes('Nam') || profile.tags.some(t => /nam/i.test(t)));
        selectedVoice = isMale ? 'manh_dung' : 'diem_trinh';
      }

      // Try local Kokoro on port 8889
      try {
        const kRes = await fetch('http://localhost:8889/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanText,
            voice: selectedVoice,
            speed: Math.max(0.5, Math.min(2.0, effectiveSpeed))
          })
        });
        if (kRes.ok) {
          const buf = Buffer.from(await kRes.arrayBuffer());
          await fsp.writeFile(rawTemp, buf);
          synthesized = true;
        }
      } catch (_) {}

      // Fallback via synthesizeTtsTextFn if Kokoro fails
      if (!synthesized) {
        if (typeof synthesizeTtsTextFn === 'function') {
          const ttsOptions = {
            provider: voice.startsWith('vi-VN-') ? 'edge-neural' : 'kokoro-local',
            voice: selectedVoice,
            speed: Math.max(0.5, Math.min(2.0, effectiveSpeed)),
            volume: volMultiplier,
            style: 'natural'
          };
          await synthesizeTtsTextFn(cleanText, rawTemp, ttsOptions, null);
          synthesized = true;
        }
      }

      if (!synthesized) {
        throw new Error('Không thể kết nối đến máy chủ phát giọng nói (Kokoro hoặc Fallback TTS).');
      }
    } catch (fallbackErr) {
      throw new Error(`Tổng hợp giọng nói thất bại: ${fallbackErr.message}`);
    }
  }

  // 4. Single-pass Master Export: High-Quality Studio Audio (48kHz WAV / 320kbps MP3) + Loudness Normalization
  const ext = format === 'mp3' ? 'mp3' : 'wav';
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeProfileName = (profile?.name || voice || 'Audio').replace(/[^a-zA-Z0-9_À-ɏẠ-ỹ]/g, '_');
  const filename = `VoiceStudio_${safeProfileName}_${timestamp}.${ext}`;
  const finalPath = path.join(targetDir, filename);

  const ffmpegArgs = ['-y', '-i', rawTemp];
  
  // Combine emotion audio filters + dynamic loudness normalizer + volume multiplier + brickwall limiter
  const finalFilters = [...audioFilters];
  finalFilters.push('dynaudnorm=p=0.95:m=10:s=12');
  finalFilters.push(`volume=${(volMultiplier * 1.35).toFixed(2)}`);
  finalFilters.push('alimiter=limit=0.96');

  ffmpegArgs.push('-af', finalFilters.join(','));

  if (ext === 'mp3') {
    // 320 kbps CBR High-Bitrate Master
    ffmpegArgs.push('-codec:a', 'libmp3lame', '-b:a', '320k', '-ar', '48000', finalPath);
  } else {
    // 48kHz 16-bit PCM Uncompressed Studio Master
    ffmpegArgs.push('-acodec', 'pcm_s16le', '-ar', '48000', finalPath);
  }

  await runFfmpeg(ffmpegArgs);
  try { await fsp.unlink(rawTemp); } catch {}

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
