import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import ytdl from 'yt-dlp-exec';
import ffmpegStatic from 'ffmpeg-static';
import { PublishRuns, atomicJson, fullFingerprint } from './publishRuns.js';
import { DirectPublisher } from './directPublisher.js';
import { assertSession, loadStudioContent, selectEvidence, ensurePublic, normalizeCaption } from './tiktokVerification.js';

export async function resolveVideoContext(videoPath, originalTitle = '') {
  let detectedTitle = '';
  let detectedTranscript = '';

  const filePath = videoPath || '';
  const fileName = path.basename(filePath || originalTitle || '');

  // 1. Check companion subtitle or text file (.srt, .vtt, .txt, .json)
  if (filePath && fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    for (const ext of ['.srt', '.vtt', '.txt', '.json']) {
      const candidate = path.join(dir, base + ext);
      if (fs.existsSync(candidate)) {
        try {
          const raw = fs.readFileSync(candidate, 'utf8');
          const clean = raw
            .replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\r?\n+/g, ' ')
            .trim()
            .slice(0, 3500);
          if (clean.length > 20) {
            detectedTranscript = clean;
            break;
          }
        } catch {}
      }
    }
  }

  // 2. If filename has a YouTube ID (e.g. youtube_SYLen0gnFmc.mp4 or SYLen0gnFmc.mp4)
  const ytMatch = fileName.match(/(?:youtube[_-])?([a-zA-Z0-9_-]{11})(?:\.[a-zA-Z0-9]+)?$/i);
  if (ytMatch && ytMatch[1] && ytMatch[1].length === 11) {
    const ytId = ytMatch[1];
    try {
      const promise = ytdl(`https://www.youtube.com/watch?v=${ytId}`, {
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
      const info = await Promise.race([promise, timeoutPromise]);
      if (info && typeof info.title === 'string' && info.title.trim()) {
        detectedTitle = info.title.trim();
        if (!detectedTranscript && info.description && typeof info.description === 'string') {
          detectedTranscript = info.description.slice(0, 500).trim();
        }
      }
    } catch {}
  }

  return { detectedTitle, detectedTranscript };
}

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

const ACCOUNTS_FILE = () => path.join(getDataDir(), 'tiktok_accounts.json');

export async function detectBrowserChannel() { return 'chrome'; }

export function loadTikTokAccounts() {
  const file = ACCOUNTS_FILE();
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const accounts = JSON.parse(raw);
      if (Array.isArray(accounts) && accounts.length > 0) {
        return accounts;
      }
    } catch {}
  }

  // Initial migration: check if existing legacy tiktok_profile exists
  const legacyDir = path.join(getDataDir(), 'tiktok_profile');
  const initialAccounts = [
    {
      id: 'acc_1',
      name: 'Kênh TikTok 1',
      username: '',
      folder: fs.existsSync(legacyDir) ? 'tiktok_profile' : 'tiktok_profiles/acc_1',
      selected: true,
      createdAt: new Date().toISOString()
    }
  ];
  saveTikTokAccounts(initialAccounts);
  return initialAccounts;
}

export function saveTikTokAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE(), JSON.stringify(accounts, null, 2), 'utf8');
  } catch (err) {
    console.error('Lỗi khi lưu tiktok_accounts.json:', err);
  }
}

const PUBLISH_HISTORY_FILE = () => path.join(getDataDir(), 'tiktok_publish_history.json');

export function loadPublishHistory() {
  const file = PUBLISH_HISTORY_FILE();
  if (!fs.existsSync(file)) return [];
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(history)) throw new Error('Lịch sử đăng bài bị lỗi. Không đăng tiếp để tránh trùng.');
  return history;
}

export function savePublishHistory(history) { atomicJson(PUBLISH_HISTORY_FILE(), history); }

export function computeVideoFingerprint(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(Math.min(65536, stat.size));
    fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);

    const footerBuf = Buffer.alloc(Math.min(65536, stat.size));
    const footerPos = Math.max(0, stat.size - footerBuf.length);
    fs.readSync(fd, footerBuf, 0, footerBuf.length, footerPos);
    fs.closeSync(fd);

    return crypto.createHash('sha256')
      .update(String(stat.size))
      .update(headerBuf)
      .update(footerBuf)
      .digest('hex');
  } catch {
    return null;
  }
}

export async function isAlreadyPublished({ videoPath, accountId = null }) {
  const history = loadPublishHistory();
  if (!history || history.length === 0) return { published: false, entry: null };

  const fileName = path.basename(videoPath);
  const fingerprint = computeVideoFingerprint(videoPath);
  const sha256 = history.some(entry => entry.sha256) ? await fullFingerprint(videoPath) : null;

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!['success', 'processing'].includes(entry.status)) continue;

    // Match by fingerprint (highest confidence) or filename
    const isFileMatch = entry.sha256 ? entry.sha256 === sha256 :
      (fingerprint && entry.fileHash && fingerprint === entry.fileHash) ||
      (entry.fileName && entry.fileName.toLowerCase() === fileName.toLowerCase());

    if (isFileMatch) {
      if (!accountId || entry.accountId === accountId) {
        return { published: true, entry };
      }
    }
  }
  return { published: false, entry: null };
}

export function recordPublishedVideo({ videoPath, account, caption = '', hashtags = [], postMode = 'public', status = 'success', sha256 = '', postId = '', postUrl = '', verification = '', confirmedAt = '' }) {
  const history = loadPublishHistory();
  const existing = postId && history.find(h => h.postId === postId && h.accountId === account.id);
  if (existing) {
    if (status === 'success' && existing.status !== 'success') {
      Object.assign(existing, { status, confirmedAt, verification, postUrl });
      savePublishHistory(history);
    }
    return existing;
  }
  const fileName = path.basename(videoPath);
  const fileHash = computeVideoFingerprint(videoPath) || '';

  const entry = {
    id: `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    fileHash,
    sha256, postId, postUrl, verification, confirmedAt,
    videoPath,
    accountId: account.id,
    accountName: account.name,
    accountUsername: account.username || '@tiktok',
    caption: String(caption || '').trim(),
    hashtags: Array.isArray(hashtags) ? hashtags : [],
    postMode,
    publishedAt: new Date().toISOString(),
    status
  };

  history.push(entry);
  savePublishHistory(history);
  return entry;
}

export function getPublishHistory() {
  const history = loadPublishHistory();
  return history.slice().reverse();
}

export function clearPublishHistory() {
  getPublishRuns().assertIdle();
  savePublishHistory([]);
  return { ok: true, message: 'Đã dọn sạch toàn bộ lịch sử đăng bài TikTok.' };
}


export function getAccountProfileDir(account) {
  const folder = account.folder || `tiktok_profiles/${account.id}`;
  const targetDir = path.join(getDataDir(), folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

export function createTikTokAccount(name = '') {
  const accounts = loadTikTokAccounts();
  const id = `acc_${Date.now()}`;
  const newAccount = {
    id,
    name: name.trim() || `Kênh TikTok ${accounts.length + 1}`,
    username: '',
    folder: `tiktok_profiles/${id}`,
    selected: true,
    createdAt: new Date().toISOString()
  };
  accounts.push(newAccount);
  saveTikTokAccounts(accounts);
  return newAccount;
}

export async function deleteTikTokAccount(accountId) {
  getPublishRuns().assertIdle();
  const accounts = loadTikTokAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index === -1) return { ok: false, message: 'Tài khoản không tồn tại.' };

  const [removed] = accounts.splice(index, 1);
  saveTikTokAccounts(accounts);

  // Clean up directory
  try {
    const profileDir = getAccountProfileDir(removed);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`Không thể xóa thư mục profile của ${accountId}:`, err.message);
  }

  return { ok: true, message: `Đã xóa tài khoản "${removed.name}" thành công.` };
}

export function toggleAccountSelection(accountId, selected) {
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.selected = Boolean(selected);
    saveTikTokAccounts(accounts);
    return { ok: true, account };
  }
  return { ok: false, message: 'Tài khoản không tồn tại.' };
}

export function renameTikTokAccount(accountId, newName) {
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (account) {
    account.name = newName.trim() || account.name;
    saveTikTokAccounts(accounts);
    return { ok: true, account };
  }
  return { ok: false, message: 'Tài khoản không tồn tại.' };
}

export async function extractTikTokProfile(page) {
  if (!page || page.isClosed()) return null;
  try {
    return await page.evaluate(async () => {
      // 1. Check window.__UNIVERSAL_DATA_FOR_REHYDRATION__
      try {
        const u = window.__UNIVERSAL_DATA_FOR_REHYDRATION__?.['__DEFAULT_SCOPE__']?.['webapp.app-context']?.user;
        if (u && (u.uniqueId || u.nickname)) {
          return {
            uniqueId: u.uniqueId || '',
            nickname: u.nickname || u.uniqueId || ''
          };
        }
      } catch {}

      // 2. Fetch authenticated passport info
      try {
        const res = await fetch('/passport/web/account/info/', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data?.data?.username || data?.data?.screen_name) {
            return {
              uniqueId: data.data.username || '',
              nickname: data.data.screen_name || data.data.username || ''
            };
          }
        }
      } catch {}

      // 3. Search DOM for profile link / username
      try {
        const profileLinks = Array.from(document.querySelectorAll('a[href*="/@"]'));
        for (const a of profileLinks) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\/@([a-zA-Z0-9._]+)/);
          if (m && m[1]) {
            return {
              uniqueId: m[1],
              nickname: a.textContent?.trim() || m[1]
            };
          }
        }
      } catch {}

      return null;
    });
  } catch {
    return null;
  }
}

// Native browser processes map: accountId -> child_process
const nativeBrowsers = new Map();

export function getSystemBrowserPath() {
  const possiblePaths = [
    ...(process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')] : []),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export function extractUsernameFromProfile(profileDir) {
  const historyPath = path.join(profileDir, 'Default', 'History');
  if (!fs.existsSync(historyPath)) return null;

  try {
    const tmp = path.join(os.tmpdir(), `history_probe_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
    try {
      fs.copyFileSync(historyPath, tmp);
    } catch {}
    const target = fs.existsSync(tmp) ? tmp : historyPath;
    const buf = fs.readFileSync(target);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}

    const text = buf.toString('utf8');

    // Strategy 1: Title pattern: 'nickname (@username) | TikTok'
    const titleMatch = text.match(/\(@([a-zA-Z0-9._]+)\)\s*\|\s*TikTok/);
    if (titleMatch) {
      const u = titleMatch[1];
      const endIdx = titleMatch.index;
      const prefix = text.slice(Math.max(0, endIdx - 80), endIdx).trim();
      let nick = u;
      if (prefix.endsWith(u)) {
        nick = u;
      } else {
        const cleaned = prefix.split(/[?&=/\\<>\x00-\x1F]/).pop().trim();
        nick = cleaned || u;
      }
      return { username: `@${u}`, nickname: nick };
    }

    // Strategy 2: URL pattern tiktok.com/@username
    const urlMatches = [...text.matchAll(/tiktok\.com\/@([a-zA-Z0-9._]+)/g)];
    const ignored = new Set(['explore', 'foryou', 'live', 'tag', 'music', 'upload', 'login', 'signup', 'feedback', 'messages', 'following']);
    for (let i = urlMatches.length - 1; i >= 0; i--) {
      const u = urlMatches[i][1];
      if (!ignored.has(u.toLowerCase()) && u.length >= 2) {
        return { username: `@${u}`, nickname: u };
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc username từ History:', err.message);
  }
  return null;
}

export function checkProfileHasSession(profileDir) {
  const cookiePath = path.join(profileDir, 'Default', 'Network', 'Cookies');
  if (!fs.existsSync(cookiePath)) return false;
  try {
    const stat = fs.statSync(cookiePath);
    if (stat.size < 500) return false;
    const tmp = path.join(os.tmpdir(), `check_cookie_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
    try {
      fs.copyFileSync(cookiePath, tmp);
    } catch {
      // If locked by Chrome, size > 2KB indicates an active profile with cookies
      return stat.size > 2000;
    }
    const buf = fs.readFileSync(tmp);
    try { fs.unlinkSync(tmp); } catch {}
    // Checks for sessionid or sessionid_ss or sid_tt
    return buf.includes(Buffer.from('sessionid')) || buf.includes(Buffer.from('sid_tt')) || stat.size > 15000;
  } catch {
    return false;
  }
}

function getLoginUrlForMode(mode) {
  if (mode === 'phone-or-email' || mode === 'phone' || mode === 'email') {
    return 'https://www.tiktok.com/login/phone-or-email';
  }
  if (mode === 'qrcode' || mode === 'qr') {
    return 'https://www.tiktok.com/login/qrcode';
  }
  return 'https://www.tiktok.com/login';
}

function getModeDescription(mode) {
  if (mode === 'phone-or-email' || mode === 'phone' || mode === 'email') {
    return 'Số điện thoại / Email / Mật khẩu';
  }
  if (mode === 'google') {
    return 'Tài khoản Google / Gmail';
  }
  if (mode === 'qrcode' || mode === 'qr') {
    return 'Quét mã QR';
  }
  return 'Trang đăng nhập tổng hợp';
}

export async function openTikTokLoginWindow(accountId, mode = 'all') {
  getPublishRuns().assertIdle();
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  if (!account) return { ok: false, message: 'Không tìm thấy tài khoản TikTok.' };

  const browserPath = getSystemBrowserPath();
  if (!browserPath) {
    return { ok: false, message: 'Không tìm thấy trình duyệt Google Chrome trên máy tính của bạn.' };
  }

  const profileDir = getAccountProfileDir(account);
  const targetUrl = getLoginUrlForMode(mode);

  // If already open, close old one first to avoid duplicate window
  if (nativeBrowsers.has(account.id)) {
    const oldProc = nativeBrowsers.get(account.id);
    try {
      if (oldProc && oldProc.pid) process.kill(oldProc.pid);
    } catch {}
    nativeBrowsers.delete(account.id);
    await new Promise((r) => setTimeout(r, 600));
  }

  try {
    // Launch genuine native Google Chrome:
    // NO --remote-debugging-pipe, NO automation flags!
    // Google OAuth (accounts.google.com) will NEVER block this!
    const child = spawn(browserPath, [
      `--user-data-dir=${profileDir}`,
      '--start-maximized',
      '--no-first-run',
      '--no-default-browser-check',
      targetUrl
    ], {
      detached: true,
      stdio: 'ignore'
    });

    nativeBrowsers.set(account.id, child);

    child.on('exit', async () => {
      nativeBrowsers.delete(account.id);
      // When user finishes and closes Chrome, automatically probe and extract channel info
      setTimeout(() => {
        syncAccountProfile(account.id).catch(() => {});
      }, 1000);
    });

    child.unref();

    let message = '';
    if (mode === 'google') {
      message = `Đang mở Google Chrome cho "${account.name}".\n\n📌 Trình duyệt đang mở ở chế độ Chrome thông thường. Bạn hãy bấm "Tiếp tục với Google" và đăng nhập Gmail thoải mái (Google sẽ không chặn bảo mật nữa)!\n\nSau khi đăng nhập xong, bạn đóng cửa sổ Chrome lại để ứng dụng hoàn tất lưu tài khoản.`;
    } else if (mode === 'phone-or-email' || mode === 'phone' || mode === 'email') {
      message = `Đang mở form đăng nhập Số điện thoại & Email cho "${account.name}".\n\n📌 Nhập Số điện thoại (nhận mã OTP hoặc mật khẩu) hoặc Email và mật khẩu. Sau khi xong, hãy đóng Chrome lại để hoàn tất lưu tài khoản.`;
    } else if (mode === 'qrcode' || mode === 'qr') {
      message = `Đang mở mã QR cho "${account.name}".\n\n📌 Quét mã bằng app TikTok trên điện thoại và bấm xác nhận, sau đó đóng cửa sổ Chrome lại để lưu tài khoản.`;
    } else {
      message = `Đang mở Google Chrome đầy đủ cho "${account.name}". Bạn có thể chọn bất kỳ phương thức nào (Google, SĐT, Email, QR) để đăng nhập, sau đó đóng Chrome lại để lưu tài khoản.`;
    }

    return { ok: true, message };
  } catch (error) {
    nativeBrowsers.delete(account.id);
    return { ok: false, message: `Lỗi mở Google Chrome: ${error.message}` };
  }
}

export async function syncAccountProfile(accountId) {
  getPublishRuns().assertIdle();
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, message: 'Tài khoản không tồn tại.' };

  const profileDir = getAccountProfileDir(account);
  const hasSession = checkProfileHasSession(profileDir);
  if (!hasSession && !account.loggedIn) {
    return { ok: false, message: 'Chưa phát hiện phiên đăng nhập trong trình duyệt.' };
  }

  // 1. Direct profile history extraction (Fast, non-blocking, reliable)
  const directProfile = extractUsernameFromProfile(profileDir);
  if (directProfile && directProfile.username) {
    account.username = directProfile.username;
    if (account.name.startsWith('Kênh TikTok') || !account.name) {
      account.name = directProfile.nickname || directProfile.username;
    }
  }

  // If native Chrome is still open, close it so profile directory is not locked
  if (nativeBrowsers.has(account.id)) {
    const child = nativeBrowsers.get(account.id);
    try {
      if (child && child.pid) process.kill(child.pid);
    } catch {}
    nativeBrowsers.delete(account.id);
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 2. Playwright headless probe (only if username not found yet)
  if (!account.username || account.username === '@tiktok') {
    try {
      const channel = await detectBrowserChannel();
      const probeContext = await chromium.launchPersistentContext(profileDir, {
        channel,
        headless: true,
        ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
        args: ['--no-default-browser-check', '--no-first-run']
      });

      try {
        const page = probeContext.pages()[0] || await probeContext.newPage();
        await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
        const profile = await extractTikTokProfile(page);
        if (profile && profile.uniqueId) {
          account.username = `@${profile.uniqueId.replace(/^@/, '')}`;
          if (account.name.startsWith('Kênh TikTok') || !account.name) {
            account.name = profile.nickname || account.username;
          }
        }
      } finally {
        await probeContext.close();
      }
    } catch (err) {
      console.warn('Sync profile warning:', err.message);
    }
  }

  account.loggedIn = true;
  saveTikTokAccounts(accounts);
  return {
    ok: true,
    channelName: account.name,
    username: account.username || 'TikTok Creator',
    message: `Đã lưu thành công kênh "${account.name}" (${account.username || 'TikTok'})!`
  };
}

async function updateAccountUsernameAfterClose(account) {
  await syncAccountProfile(account.id).catch(() => {});
}

export async function checkAccountStatus(accountId) {
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { loggedIn: false, message: 'Tài khoản không tồn tại.' };

  const profileDir = getAccountProfileDir(account);
  const isBrowserRunning = nativeBrowsers.has(account.id);
  const hasSession = checkProfileHasSession(profileDir);

  // Auto-scan username from History if not set
  if (!account.username || account.username === '@tiktok' || account.name.startsWith('Kênh TikTok')) {
    const extracted = extractUsernameFromProfile(profileDir);
    if (extracted && extracted.username) {
      account.username = extracted.username;
      if (account.name.startsWith('Kênh TikTok') && extracted.nickname) {
        account.name = extracted.nickname;
      }
      saveTikTokAccounts(accounts);
    }
  }

  // SESSION STICKINESS:
  // Once marked as logged in, retain loggedIn = true unless profile directory is deleted.
  // This prevents transient Windows file lock errors or Chrome WAL flushes from flipping state to logged out.
  if (hasSession || account.loggedIn) {
    if (!account.loggedIn) {
      account.loggedIn = true;
      saveTikTokAccounts(accounts);
    }
    return {
      loggedIn: true,
      channelName: account.name,
      username: account.username || 'TikTok Creator',
      isBrowserRunning,
      message: isBrowserRunning
        ? 'Đã nhận diện phiên đăng nhập! Hãy đóng Chrome lại sau khi hoàn tất.'
        : 'Đã kết nối thành công.'
    };
  }

  return {
    loggedIn: false,
    isBrowserRunning,
    message: isBrowserRunning
      ? 'Đang mở Google Chrome... Vui lòng hoàn tất đăng nhập.'
      : 'Chưa đăng nhập tài khoản này.'
  };
}

export async function checkAllAccountsStatus() {
  const accounts = loadTikTokAccounts();
  const results = [];
  for (const account of accounts) {
    const status = await checkAccountStatus(account.id);
    results.push({
      ...account,
      loggedIn: status.loggedIn,
      statusMessage: status.message,
      username: status.username || account.username || ''
    });
  }
  return results;
}

export async function generateTikTokMetadata(cues = [], originalTitle = '', aiOptions = {}, log = console.log) {
  const geminiApiKey = String(aiOptions.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  const geminiModel = String(aiOptions.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const accountName = String(aiOptions.accountName || '').trim();
  const accountUsername = String(aiOptions.accountUsername || '').trim();

  // 1. Resolve real video context (companion subtitles or YouTube title from yt-dlp)
  const { detectedTitle, detectedTranscript } = await resolveVideoContext(aiOptions.videoPath, originalTitle);

  let videoTranscript = (cues && cues.length > 0) ? cues.map((c) => c.text).join(' ').slice(0, 3500) : '';
  if (!videoTranscript && detectedTranscript) {
    videoTranscript = detectedTranscript;
  }

  const cleanTitle = String(detectedTitle || originalTitle || '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' ').trim();
  const effectiveTitle = detectedTitle || cleanTitle || 'Video Lồng Tiếng AI';
  const userPrompt = String(aiOptions.captionPrompt || '').trim();

  // Extract mandatory hashtags
  const promptTags = Array.from(userPrompt.matchAll(/#[\p{L}\p{N}_]+/gu)).map((m) => m[0]);
  const extraTags = String(aiOptions.extraHashtags || '').split(/\s+/).filter((t) => t.startsWith('#'));
  const allMandatoryTags = Array.from(new Set([...promptTags, ...extraTags]));

  const randomSalt = Math.floor(Math.random() * 1000000);

  if (!geminiApiKey && aiOptions.requireAi) throw new Error('Chưa cấu hình Gemini API key. Điền khóa tại Cài đặt & API.');
  if (!geminiApiKey) {
    if (log) log(`⚠️ [AI Gemini] Không tìm thấy API Key (Vui lòng điền tại tab "Cài đặt & API"). Đang tạo nội dung độc bản dự phòng...`);
    const fallbackTemplates = [
      {
        hook: `🔥 Bất ngờ chưa: ${effectiveTitle.slice(0, 45)}!`,
        caption: `Khám phá ngay điều thú vị có trong video này nhé! ${effectiveTitle}\n\n${userPrompt || 'Cùng theo dõi và chia sẻ cảm nghĩ của bạn bên dưới nha!'}`
      },
      {
        hook: `👀 Không xem là tiếc: ${effectiveTitle.slice(0, 45)}!`,
        caption: `Đoạn clip khiến dân tình bàn tán xôn xao hôm nay! ${effectiveTitle}\n\n${userPrompt || 'Xem hết video để thấy điều bất ngờ nhé!'}`
      },
      {
        hook: `⚡ Xem ngay kẻo lỡ: ${effectiveTitle.slice(0, 45)}!`,
        caption: `Tiểu phẩm siêu bánh cuốn không thể bỏ qua! ${effectiveTitle}\n\n${userPrompt || 'Bạn thấy thế nào về tình huống này? Bình luận ngay nha!'}`
      }
    ];
    const picked = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
    const finalTags = allMandatoryTags.length > 0 ? allMandatoryTags : ['#xuhuong', '#fyp', '#trending'];
    return {
      title: picked.hook,
      caption: picked.caption.trim(),
      hashtags: finalTags
    };
  }

  const prompt = `BẠN LÀ MỘT CHUYÊN GIA SÁNG TẠO NỘI DUNG TIKTOK VIRAL HÀNG ĐẦU VIỆT NAM.
THÔNG TIN VIDEO CẦN ĐĂNG:
- Tiêu đề / Chủ đề thực tế của video: "${effectiveTitle}"
${videoTranscript ? `- Lời thoại / Phụ đề tiếng Việt của video:\n"""\n${videoTranscript}\n"""` : ''}
${accountName ? `- Kênh TikTok mục tiêu: "${accountName}" (${accountUsername || accountName})` : ''}

${userPrompt ? `🔴 CHỈ THỊ PROMPT MẪU TỪ NGƯỜI DÙNG (YÊU CẦU ƯU TIÊN SỐ 1, BẮT BUỘC BÁM SÁT):
"""
${userPrompt}
"""` : ''}

🎯 QUY TẮC BẮT BUỘC VỀ TÍNH ĐỘC BẢN (KHÔNG TRÙNG LẶP - RANDOM SEED #${randomSalt}):
1. ĐỘC BẢN 100%: Mỗi video và mỗi kênh BẮT BUỘC phải có tiêu đề (hook), lời dẫn (caption) và cách tiếp cận hoàn toàn riêng biệt.
2. TUYỆT ĐỐI CẤM RẬP KHUÔN: KHÔNG ĐƯỢC dùng các câu mở đầu lặp đi lặp lại giống nhau (như "Ủa alo...", "Xem quả clip mà...", "Đúng là...", "Tag ngay đứa bạn..."). Hãy sáng tạo câu hook mới mẻ, tự nhiên, kích thích sự chú ý ngay lập tức dựa đúng trên tình huống cụ thể của video này ("${effectiveTitle}")!
3. BÁM SÁT CHỦ ĐỀ VIDEO: Viết caption lôi cuốn, phản ánh đúng tình huống của video, kết hợp với phong cách trong prompt mẫu.
4. HASHTAGS: 5-8 hashtags chất lượng cao, BẮT BUỘC bao gồm: ${allMandatoryTags.join(' ')}.

Trả về DUY NHẤT định dạng JSON hợp lệ:
{
  "hook": "1 câu giật tít độc đáo, kích thích tò mò có icon phù hợp (dưới 55 ký tự)",
  "caption": "Nội dung bài đăng lôi cuốn, đúng chủ đề video, câu từ tự nhiên",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

  if (log) log(`🤖 [AI Gemini] Đang tạo nội dung độc bản cho video "${effectiveTitle.slice(0, 45)}" (Kênh: ${accountName || 'TikTok'})...`);

  // Try primary model, with fallback models if model is not available
  const modelsToTry = [geminiModel, 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'].filter((v, i, a) => a.indexOf(v) === i);

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.85,
            responseMimeType: 'application/json'
          },
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini status ${response.status}: ${errText.slice(0, 100)}`);
      }

      const data = await response.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const generatedTags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
      const combinedTags = Array.from(new Set([...allMandatoryTags, ...generatedTags]));

      const finalTitle = parsed.hook || effectiveTitle || 'Video Lồng Tiếng Đỉnh Cao';
      let finalCaption = '';
      if (parsed.caption) {
        finalCaption = parsed.hook && !parsed.caption.includes(parsed.hook)
          ? `${parsed.hook}\n\n${parsed.caption}`
          : parsed.caption;
      } else {
        finalCaption = finalTitle;
      }

      if (log) {
        log(`✨ [AI Gemini] Đã tạo thành công nội dung độc bản cho kênh "${accountName || 'TikTok'}"!`);
        log(`📌 Tiêu đề: "${finalTitle}"`);
        log(`📝 Caption: "${finalCaption.replace(/\r?\n/g, ' ')}"`);
      }

      return {
        title: finalTitle,
        caption: finalCaption.trim(),
        hashtags: combinedTags.length > 0 ? combinedTags : ['#xuhuong', '#fyp', '#vietdub']
      };
    } catch (apiErr) {
      if (log) log(`⚠️ [AI Gemini] Thử mô hình "${model}" gặp lỗi (${apiErr.message}). Đang kiểm tra mô hình thay thế...`);
    }
  }

  if (aiOptions.requireAi) throw new Error('Không tạo được nội dung Gemini. Kiểm tra API key, model, kết nối và quota rồi thử lại.');
  // Fallback if all models failed
  if (log) log(`⚠️ [AI Gemini] Không thể kết nối với Gemini. Sử dụng nội dung dựa trên Prompt Mẫu dự phòng.`);
  const fallbackTitle = effectiveTitle ? `Hot: ${effectiveTitle.slice(0, 50)}` : 'Video Lồng Tiếng Đỉnh Cao';
  const finalTags = allMandatoryTags.length > 0 ? allMandatoryTags : ['#xuhuong', '#fyp', '#vietdub', '#trending'];
  return {
    title: fallbackTitle,
    caption: `${fallbackTitle}\n\n${userPrompt || 'Video cực cuốn, xem ngay nhé mọi người!'}`,
    hashtags: finalTags
  };
}

// Helper to dismiss guide, sound recommendations, or informational popups
async function dismissTikTokStudioPopups(page, log) {
  try {
    const popupSelectors = [
      'button:has-text("Got it")',
      'button:has-text("Đã hiểu")',
      'button:has-text("Turn on")',
      'button:has-text("Bật")',
      '.common-modal-close',
      'button[aria-label="Close"]',
      'button[aria-label="Đóng"]',
      '.TUXModal .common-modal-close'
    ];
    for (const sel of popupSelectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        if (log) log(`📱 [TikTok] Đang đóng popup thông báo: "${sel}"...`);
        await loc.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
  } catch {}
}

// Chuyên xử lý bấm nút Post, vượt qua cảnh báo kiểm tra bản quyền / content check ("Post now") và chờ xác nhận xuất bản
async function handleTikTokPostSubmission(uploadTarget, page, account, log, evidence, onStage) {
  log(`📱 [TikTok - ${account.name}] Đang kiểm tra trạng thái video và chuẩn bị Đăng Công Khai (Post)...`);

  // Cuộn trang xuống đáy trước tiên để footer hiển thị đầy đủ
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(1000);

  // Tìm nút Post chính xác: PHẢI là nút Post submit ở chân trang, KHÔNG được nhầm với menu "Posts" ở thanh bên (sidebar)
  let postBtn = null;
  const postExactMatchRegex = /^(Post|Đăng)$/i;

  // 1. Tìm bằng getByRole với tên chính xác Post/Đăng
  const roleBtnUpload = uploadTarget.getByRole('button', { name: postExactMatchRegex, exact: true });
  if (await roleBtnUpload.count() > 0) {
    postBtn = roleBtnUpload.first();
  } else {
    const roleBtnPage = page.getByRole('button', { name: postExactMatchRegex, exact: true });
    if (await roleBtnPage.count() > 0) {
      postBtn = roleBtnPage.first();
    }
  }

  // 2. Fallback: tìm trong footer / form-actions, tuyệt đối loại trừ aside/nav/sidebar
  if (!postBtn) {
    const footerPost = uploadTarget.locator('div[class*="footer"] button, .btn-post button, footer button, .Button__root--type-primary').filter({ hasText: postExactMatchRegex }).first();
    if (await footerPost.isVisible().catch(() => false)) {
      postBtn = footerPost;
    }
  }

  // 3. Fallback: lặp lại nếu chưa render
  if (!postBtn) {
    for (let r = 0; r < 5; r++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1000);
      const btn = uploadTarget.getByRole('button', { name: postExactMatchRegex, exact: true });
      if (await btn.count() > 0) {
        postBtn = btn.first();
        break;
      }
    }
  }

  if (!postBtn) {
    throw new Error('Không tìm thấy nút "Post" / "Đăng" trên giao diện TikTok Studio.');
  }

  // Chờ video tải lên hoàn tất (upload 100% -> nút Post được kích hoạt sáng lên)
  log(`📱 [TikTok - ${account.name}] Đang chờ video hoàn tất tải lên (100%) để kích hoạt nút Post (Đăng)...`);
  let isEnabled = false;
  for (let w = 0; w < 90; w++) {
    isEnabled = await postBtn.isEnabled().catch(() => false);
    if (isEnabled) {
      log(`📱 [TikTok - ${account.name}] Video đã tải lên xong, nút Post (Đăng) đã sẵn sàng!`);
      break;
    }
    if (w % 10 === 0) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    }
    await page.waitForTimeout(1000);
  }

  if (!isEnabled) {
    throw new Error('Nút "Post" chưa sẵn sàng (video có thể đang tải lên dở dang hoặc bị lỗi kết nối).');
  }

  // Cuộn nút Post vào tầm nhìn để click chuẩn xác
  await postBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);

  await assertSession(page);
  await ensurePublic(uploadTarget);
  log('Đã xác nhận quyền hiển thị Everyone / Công khai.');
  await postBtn.scrollIntoViewIfNeeded();
  const submittedAt = new Date().toISOString();
  onStage('submitting', { baselineIds: evidence.baselineIds, submittedAt });
  // Never click again after an ambiguous click timeout.
  await postBtn.click({ timeout: 10000 });
  log('Đã bấm Post / Đăng.');
  onStage('submitted');
  for (let loop = 0; loop < 15; loop++) {
    await assertSession(page);
    if (page.url().includes('/content')) break;
    for (const target of [page, uploadTarget]) {
      const confirm = target.getByRole('button', { name: /^(Post now|Đăng ngay|Post anyway|Vẫn đăng)$/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click({ timeout: 5000 });
        log('Đã bấm Post now / Đăng ngay.');
        break;
      }
    }
    await page.waitForTimeout(2000);
  }
  onStage('verifying');
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await loadStudioContent(page);
    result = selectEvidence(rows, { ...evidence, submittedAt });
    if (result.status === 'success' || result.status === 'processing') break;
    await page.waitForTimeout(2500);
  }
  log(result.status === 'success' ? 'Đã xác nhận đúng bài đăng Công khai.' : result.message);
  return result;
}

export async function uploadSingleAccount({ account, videoPath, caption, hashtags, postMode = 'public', log = () => {}, onStage = () => {} }) {
  const channel = await detectBrowserChannel();
  const profileDir = getAccountProfileDir(account);

  log(`📱 [TikTok - ${account.name}] Đang khởi chạy Google Chrome...`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--no-sandbox', '--enable-automation'],
    args: [
      '--start-maximized',
      '--disable-infobars',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-backgrounding-occluded-windows'
    ]
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = {
      runtime: {},
      loadTimes: function () {},
      csi: function () {},
      app: {}
    };
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['vi-VN', 'vi', 'en-US', 'en']
    });
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  try {
    await page.bringToFront();
  } catch {}
  log(`📱 [TikTok - ${account.name}] Đã mở cửa sổ Chrome của kênh lên màn hình.`);

  try {
    const baseline = await loadStudioContent(page);
    const evidence = { baselineIds: baseline.map(r => r.id), caption, hashtags, accountUsername: account.username };
    log(`📱 [TikTok - ${account.name}] Đang mở TikTok Studio Upload...`);
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=upload', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await page.waitForTimeout(3500);
    await assertSession(page);

    log(`📱 [TikTok - ${account.name}] Đang nạp video vào khung tải lên...`);
    await dismissTikTokStudioPopups(page, log);

    let uploadTarget = page;
    const uploadFrameElement = await page.$('iframe[src*="upload"]');
    if (uploadFrameElement) {
      const frame = await uploadFrameElement.contentFrame();
      if (frame) uploadTarget = frame;
    }

    // TikTok input[type="file"] is attached with style="display: none;"
    // We MUST use attached state wait instead of visible
    const fileInput = uploadTarget.locator('input[type="file"][accept*="video"], input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 35000 });
    await fileInput.setInputFiles(videoPath);
    log(`📱 [TikTok - ${account.name}] Đã nạp file video thành công! Đang tải lên máy chủ TikTok...`);

    await page.waitForTimeout(6000);
    for (let attempt = 0; attempt < 3; attempt++) {
      await dismissTikTokStudioPopups(page, log);
      await page.waitForTimeout(400);
    }

    const tagString = (hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const fullPostText = `${caption}\n\n${tagString}`.trim();

    log(`📱 [TikTok - ${account.name}] Đang nhập Caption & Hashtags...`);
    const editorSelector = 'div.notranslate.public-DraftEditor-content, div[contenteditable="true"], .DraftEditor-root, div[role="textbox"], textarea';
    try {
      const editor = uploadTarget.locator(editorSelector).first();
      await editor.waitFor({ state: 'visible', timeout: 25000 });
      await editor.click();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(fullPostText, { delay: 20 });
      const actualCaption = await editor.evaluate(el => el.value ?? el.innerText);
      if (normalizeCaption(actualCaption) !== normalizeCaption(fullPostText)) throw new Error('Caption trong trình soạn thảo không khớp bản xem trước.');
      log(`📱 [TikTok - ${account.name}] Đã hoàn tất nhập Caption & Hashtags.`);
    } catch (editorErr) {
      throw new Error(`Không nhập được caption: ${editorErr.message}`);
    }

    // Dismiss hashtag autocomplete popup and release focus so it never blocks footer/buttons
    try {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
      });
    } catch {}

    await page.waitForTimeout(1500);
    await dismissTikTokStudioPopups(page, log);

    // BẮT BUỘC: Đăng công khai (Public Post) hoàn toàn tự động, loại bỏ hoàn toàn chế độ nháp
    const result = await handleTikTokPostSubmission(uploadTarget, page, account, log, evidence, onStage);

    await context.close();
    return { ...result, success: result.status === 'success', account: account.name };
  } catch (err) {
    try { await context.close(); } catch {}
    throw err;
  }
}

// Session-level tracker to distribute videos 1:1 evenly across selected accounts
const sessionUploadCounts = new Map();
let lastDistributionTime = Date.now();

export function resetDistributionSession() {
  sessionUploadCounts.clear();
  lastDistributionTime = Date.now();
}

export async function uploadToMultipleAccounts({ videoPath, caption, hashtags, channelDelaySeconds = 6, logCallback = () => {} }) {
  const service = getPublishRuns();
  const accounts = loadTikTokAccounts().filter(a => a.selected && a.loggedIn);
  if (!accounts.length) { logCallback('Chưa có kênh đăng nhập được chọn.'); return; }
  const min = Math.min(...accounts.map(a => sessionUploadCounts.get(a.id) || 0));
  const candidates = accounts.filter(a => (sessionUploadCounts.get(a.id) || 0) === min);
  const chosen = candidates[crypto.randomInt(candidates.length)];
  // Queue only the rendered file; never pull unrelated files from its folder.
  const originalScan = service.scan;
  service.assertIdle();
  service.scan = async () => ({ ok: true, freshVideos: (await isAlreadyPublished({ videoPath })).published ? [] : [{ name: path.basename(videoPath), path: videoPath }] });
  let prepared;
  try { prepared = await service.prepare({ folderPath: path.dirname(videoPath), accountIds: [chosen.id], channelDelaySeconds, metadata: { caption, hashtags } }); }
  finally { service.scan = originalScan; }
  if (!prepared.ok) { logCallback(prepared.checks.map(c => c.message).join(' ')); return; }
  const run = await service.start(prepared.run.id);
  if (run.items[0]?.status === 'success') sessionUploadCounts.set(chosen.id, (sessionUploadCounts.get(chosen.id) || 0) + 1);
  logCallback(`TikTok: ${run.items[0]?.status}. Xem chi tiết tại Trung tâm xuất bản.`);
  return run;
}

export async function scanWarehouseVideos(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { ok: false, message: 'Thư mục không tồn tại trên máy tính.' };
  }

  const validExts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
  const files = fs.readdirSync(folderPath);
  const videoFiles = files.filter((f) => validExts.has(path.extname(f).toLowerCase()));

  const freshVideos = [];
  const publishedVideos = [];
  const errors = [];

  for (const fileName of videoFiles) {
    const fullPath = path.join(folderPath, fileName);
    try {
      const stat = fs.statSync(fullPath);
      const { published, entry } = await isAlreadyPublished({ videoPath: fullPath });
      const item = {
        name: fileName,
        path: fullPath,
        sizeMB: (stat.size / (1024 * 1024)).toFixed(1) + ' MB',
        mtime: stat.mtime
      };
      if (published && entry) {
        publishedVideos.push({
          ...item,
          publishedTo: entry.accountName,
          publishedUsername: entry.accountUsername,
          publishedAt: entry.publishedAt
        });
      } else {
        freshVideos.push(item);
      }
    } catch (error) { errors.push({ name: fileName, message: error.message }); }
  }

  return {
    ok: true,
    folderPath,
    totalCount: videoFiles.length,
    publishedCount: publishedVideos.length,
    freshCount: freshVideos.length,
    freshVideos,
    errors,
    publishedVideos
  };
}

async function withAccountPage(account, fn) {
  if (nativeBrowsers.has(account.id)) throw Object.assign(new Error('Cửa sổ đăng nhập của kênh đang mở. Đóng Chrome rồi thử lại.'), { code: 'NEEDS_ACTION' });
  const context = await chromium.launchPersistentContext(getAccountProfileDir(account), { channel: 'chrome', headless: false, viewport: { width: 1280, height: 800 } });
  try { return await fn(context.pages()[0] || await context.newPage()); }
  finally { await context.close(); }
}

export async function preflightAccount(account) {
  if (!/^@[a-zA-Z0-9._]+$/.test(account.username || '') || account.username === '@tiktok') throw Object.assign(new Error('Chưa xác định username. Đồng bộ kênh trước khi đăng.'), { code: 'NEEDS_ACTION' });
  return withAccountPage(account, async page => {
    await loadStudioContent(page);
    await page.goto('https://www.tiktok.com/tiktokstudio/upload', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await assertSession(page);
    const frameElement = await page.$('iframe[src*="upload"]');
    const target = frameElement ? await frameElement.contentFrame() || page : page;
    await target.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 20000 });
  });
}

let runService;
export async function validateWarehouseVideo(file) {
  const binary = process.env.FFMPEG_BIN || (process.versions.electron ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : ffmpegStatic);
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['-v', 'error', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'], { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Đọc video quá thời gian. Kiểm tra video đã tải đầy đủ về máy.')); }, 20000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Không chạy được FFmpeg để kiểm tra video.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Video lỗi hoặc không có hình ảnh hợp lệ.')); });
  });
}
export function getPublishRuns() {
  if (!runService) runService = new PublishRuns({
    directory: getDataDir, accounts: loadTikTokAccounts, scan: scanWarehouseVideos,
    preflight: preflightAccount, validateVideo: validateWarehouseVideo,
    metadata: (video, account, options) => generateTikTokMetadata([], path.basename(video.name, path.extname(video.name)), { ...options, requireAi: true, videoPath: video.path, accountName: account.name, accountUsername: account.username }, () => {}),
    upload: uploadSingleAccount,
    reconcile: (account, item) => withAccountPage(account, async page => selectEvidence(await loadStudioContent(page), item)),
    history: loadPublishHistory, record: recordPublishedVideo
  });
  return runService;
}

export async function distributeWarehouseVideos(options) {
  const service = getPublishRuns();
  const prepared = await service.prepare(options);
  if (!prepared.ok) return prepared;
  return service.start(prepared.run.id);
}

let directPublisher;
export function getDirectPublisher() {
  if (!directPublisher) directPublisher = new DirectPublisher({
    accounts: loadTikTokAccounts, scan: scanWarehouseVideos, hash: fullFingerprint,
    acquire: () => getPublishRuns().acquire(), release: () => getPublishRuns().release(),
    metadata: (video, account, options) => generateTikTokMetadata([], video.name, { ...options, requireAi: true, videoPath: video.path, accountName: account.name, accountUsername: account.username }),
    upload: uploadSingleAccount, record: recordPublishedVideo,
    delay: ms => new Promise(resolve => setTimeout(resolve, ms))
  });
  return directPublisher;
}
