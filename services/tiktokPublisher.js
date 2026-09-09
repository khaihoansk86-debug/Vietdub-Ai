import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';

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

export async function detectBrowserChannel() {
  const channels = ['chrome', 'msedge'];
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      await browser.close();
      return channel;
    } catch {
      // Continue searching
    }
  }
  return 'chrome';
}

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
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    } catch {}
  }
  return [];
}

export function savePublishHistory(history) {
  try {
    fs.writeFileSync(PUBLISH_HISTORY_FILE(), JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('Lỗi khi lưu tiktok_publish_history.json:', err);
  }
}

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

export function isAlreadyPublished({ videoPath, accountId = null }) {
  const history = loadPublishHistory();
  if (!history || history.length === 0) return { published: false, entry: null };

  const fileName = path.basename(videoPath);
  const fingerprint = computeVideoFingerprint(videoPath);

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.status !== 'success') continue;

    // Match by fingerprint (highest confidence) or filename
    const isFileMatch = (fingerprint && entry.fileHash && fingerprint === entry.fileHash) ||
      (entry.fileName && entry.fileName.toLowerCase() === fileName.toLowerCase());

    if (isFileMatch) {
      if (!accountId || entry.accountId === accountId) {
        return { published: true, entry };
      }
    }
  }
  return { published: false, entry: null };
}

export function recordPublishedVideo({ videoPath, account, caption = '', hashtags = [], postMode = 'draft', status = 'success' }) {
  const history = loadPublishHistory();
  const fileName = path.basename(videoPath);
  const fileHash = computeVideoFingerprint(videoPath) || '';

  const entry = {
    id: `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    fileHash,
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

  // Try extracting transcript from cues or companion .srt file
  let videoTranscript = (cues && cues.length > 0) ? cues.map((c) => c.text).join(' ').slice(0, 3500) : '';
  if (!videoTranscript && aiOptions.videoPath && fs.existsSync(aiOptions.videoPath)) {
    try {
      const srtCandidate = path.join(
        path.dirname(aiOptions.videoPath),
        path.basename(aiOptions.videoPath, path.extname(aiOptions.videoPath)) + '.srt'
      );
      if (fs.existsSync(srtCandidate)) {
        const rawSrt = fs.readFileSync(srtCandidate, 'utf-8');
        videoTranscript = rawSrt
          .replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\r?\n+/g, ' ')
          .trim()
          .slice(0, 3500);
      }
    } catch {}
  }

  const cleanTitle = String(originalTitle || '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' ').trim();
  const fullText = videoTranscript || cleanTitle || 'Video Lồng Tiếng AI';
  const userPrompt = String(aiOptions.captionPrompt || '').trim();

  // Extract mandatory hashtags from both user prompt and extraHashtags
  const promptTags = Array.from(userPrompt.matchAll(/#[\p{L}\p{N}_]+/gu)).map((m) => m[0]);
  const extraTags = String(aiOptions.extraHashtags || '').split(/\s+/).filter((t) => t.startsWith('#'));
  const allMandatoryTags = Array.from(new Set([...promptTags, ...extraTags]));

  if (!geminiApiKey) {
    if (log) log(`⚠️ [AI Gemini] Không tìm thấy API Key (Vui lòng điền tại tab "Cài đặt & API"). Đang tổng hợp nội dung trực tiếp từ Prompt Mẫu...`);
    const fallbackTitle = cleanTitle ? `Review: ${cleanTitle.slice(0, 60)}` : 'Video Lồng Tiếng Đỉnh Cao';
    let fallbackCaption = cleanTitle;
    if (userPrompt) {
      // Clean instructions to leave narrative or use as hook
      fallbackCaption = `${fallbackTitle}\n\n${userPrompt.slice(0, 180)}`;
    } else {
      fallbackCaption = `${fallbackTitle}\n\nXem ngay video thú vị này nhé mọi người!`;
    }
    const finalTags = allMandatoryTags.length > 0 ? allMandatoryTags : ['#xuhuong', '#fyp', '#vietdub', '#trending'];
    return {
      title: fallbackTitle,
      caption: fallbackCaption.trim(),
      hashtags: finalTags
    };
  }

  const prompt = `BẠN LÀ MỘT CHUYÊN GIA SÁNG TẠO NỘI DUNG TIKTOK VIRAL HÀNG ĐẦU VIỆT NAM.
THÔNG TIN VIDEO CẦN ĐĂNG:
- Tiêu đề / Tên tệp: "${cleanTitle}"
${videoTranscript ? `- Nội dung bản ghi lời thoại tiếng Việt của video:\n"""\n${videoTranscript}\n"""` : ''}

${userPrompt ? `🔴 CHỈ THỊ PROMPT MẪU TỪ NGƯỜI DÙNG (YÊU CẦU ƯU TIÊN SỐ 1, BẮT BUỘC TUÂN THỦ CHẶT CHẼ 100%):
"""
${userPrompt}
"""` : ''}

Nhiệm vụ: Hãy đóng vai chuyên gia sáng tạo nội dung TikTok. Đọc kỹ thông tin video và BÁM SÁT CHẶT CHẼ 100% các yêu cầu về phong cách, độ dài, câu hook và lời kêu gọi trong prompt mẫu của người dùng để tạo nội dung đăng bài:
1. "hook": 1 câu giật tít mở đầu video ngắn gọn (dưới 50 ký tự), có icon phù hợp, khơi gợi tò mò cực độ.
2. "caption": Nội dung bài đăng video lôi cuốn, đúng văn phong và chỉ thị trong prompt mẫu của người dùng.
3. "hashtags": Danh sách 5-8 hashtags hot nhất (#xuhuong, #fyp...), BẮT BUỘC bao gồm đầy đủ các hashtags sau nếu có: ${allMandatoryTags.join(' ')}.

Trả về DUY NHẤT định dạng JSON hợp lệ theo cấu trúc sau (không bọc trong markdown code fence, không thêm văn bản ngoài JSON):
{
  "hook": "...",
  "caption": "...",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

  if (log) log(`🤖 [AI Gemini] Đang gửi yêu cầu tới mô hình "${geminiModel}" kèm chỉ thị Prompt Mẫu...`);

  // Try primary model, with fallback models if model is not available
  const modelsToTry = [geminiModel, 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'].filter((v, i, a) => a.indexOf(v) === i);

  for (const model of modelsToTry) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.7,
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

      const finalTitle = parsed.hook || cleanTitle || 'Video Lồng Tiếng Đỉnh Cao';
      let finalCaption = '';
      if (parsed.caption) {
        finalCaption = parsed.hook && !parsed.caption.includes(parsed.hook)
          ? `${parsed.hook}\n\n${parsed.caption}`
          : parsed.caption;
      } else {
        finalCaption = finalTitle;
      }

      if (log) {
        log(`✨ [AI Gemini] Đã tạo thành công bài đăng theo đúng Prompt Mẫu!`);
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

  // Fallback if all models failed
  if (log) log(`⚠️ [AI Gemini] Không thể kết nối với Gemini. Sử dụng nội dung dựa trên Prompt Mẫu dự phòng.`);
  const fallbackTitle = cleanTitle ? `Review: ${cleanTitle.slice(0, 60)}` : 'Video Lồng Tiếng Đỉnh Cao';
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
async function handleTikTokPostSubmission(uploadTarget, page, account, log) {
  log(`📱 [TikTok - ${account.name}] Đang kiểm tra trạng thái video và chuẩn bị Đăng Công Khai (Post)...`);

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
    const footerPost = uploadTarget.locator('div[class*="footer"] button, .btn-post button, footer button').filter({ hasText: postExactMatchRegex }).first();
    if (await footerPost.isVisible().catch(() => false)) {
      postBtn = footerPost;
    }
  }

  if (!postBtn) {
    throw new Error('Không tìm thấy nút "Post" / "Đăng" trên giao diện TikTok Studio.');
  }

  // 1. Chờ video tải lên hoàn tất và các bước kiểm tra ban đầu (upload 100% -> nút Post được kích hoạt sáng lên)
  log(`📱 [TikTok - ${account.name}] Đang chờ video hoàn tất tải lên để kích hoạt nút Post (Đăng)...`);
  let isEnabled = false;
  for (let w = 0; w < 60; w++) {
    isEnabled = await postBtn.isEnabled().catch(() => false);
    if (isEnabled) {
      log(`📱 [TikTok - ${account.name}] Video đã tải lên xong, nút Post (Đăng) đã sẵn sàng!`);
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!isEnabled) {
    throw new Error('Nút "Post" chưa sẵn sàng (video có thể đang tải lên dở dang hoặc bị lỗi kết nối).');
  }

  // Cuộn nút Post vào tầm nhìn để click chuẩn xác
  await postBtn.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1000);

  // 2. Bấm nút Post chính
  log(`📱 [TikTok - ${account.name}] Đã bấm nút "Post" (Đăng). Đang theo dõi tiến trình kiểm duyệt & xuất bản...`);
  await postBtn.click();
  await page.waitForTimeout(1500);

  // 3. Theo dõi và tự động bấm "Post now" ("Đăng ngay") nếu xuất hiện cảnh báo Copyright check / Content check
  const postNowRegex = /^(Post now|Đăng ngay)$/i;
  let postNowClicked = false;

  for (let checkLoop = 0; checkLoop < 20; checkLoop++) {
    // Ưu tiên getByRole với tên chính xác Post now / Đăng ngay
    let postNowBtn = null;
    const pRoleBtnTarget = uploadTarget.getByRole('button', { name: postNowRegex, exact: true });
    if (await pRoleBtnTarget.count() > 0 && await pRoleBtnTarget.first().isVisible().catch(() => false)) {
      postNowBtn = pRoleBtnTarget.first();
    } else {
      const pRoleBtnPage = page.getByRole('button', { name: postNowRegex, exact: true });
      if (await pRoleBtnPage.count() > 0 && await pRoleBtnPage.first().isVisible().catch(() => false)) {
        postNowBtn = pRoleBtnPage.first();
      }
    }

    // Fallback: Tìm qua các class modal của TikTok Studio (TUXButton, dialog)
    if (!postNowBtn) {
      const modalSelectors = [
        'button.TUXButton--primary:has-text("Post now")',
        'button.TUXButton--primary:has-text("Đăng ngay")',
        'div[role="dialog"] button.TUXButton--primary',
        'div[role="dialog"] button:has-text("Post now")',
        'div[role="dialog"] button:has-text("Đăng ngay")',
        '.TUXModal button:has-text("Post now")',
        '.TUXModal button:has-text("Đăng ngay")'
      ];
      for (const sel of modalSelectors) {
        const loc = uploadTarget.locator(sel).first();
        if (await loc.isVisible().catch(() => false)) {
          postNowBtn = loc;
          break;
        }
        const locPage = page.locator(sel).first();
        if (await locPage.isVisible().catch(() => false)) {
          postNowBtn = locPage;
          break;
        }
      }
    }

    if (postNowBtn) {
      log(`📱 [TikTok - ${account.name}] Phát hiện hộp thoại xác nhận ("Continue to post?"). Tự động bấm "Post now" ("Đăng ngay")...`);
      await postNowBtn.click().catch(() => {});
      postNowClicked = true;
      log(`📱 [TikTok - ${account.name}] Đã bấm "Post now" ("Đăng ngay") thành công!`);
      await page.waitForTimeout(2000);
      break;
    }

    // Kiểm tra nếu đã hoàn tất và chuyển trang mà không cần qua modal cảnh báo
    const currentUrl = page.url();
    if (currentUrl.includes('/content') || currentUrl.includes('/posts') || currentUrl.includes('/manage')) {
      log(`🎉 [TikTok - ${account.name}] Đã chuyển hướng về trang Quản Lý Nội Dung thành công!`);
      break;
    }

    const successIndicators = [
      'button:has-text("Manage your posts")',
      'button:has-text("Quản lý bài viết")',
      'button:has-text("Upload another video")',
      'button:has-text("Tải video khác")'
    ];
    let isInstantSuccess = false;
    for (const sSel of successIndicators) {
      if (await page.locator(sSel).first().isVisible().catch(() => false) ||
          await uploadTarget.locator(sSel).first().isVisible().catch(() => false)) {
        isInstantSuccess = true;
        break;
      }
    }
    if (isInstantSuccess) {
      log(`🎉 [TikTok - ${account.name}] Đã xuất bản video thành công!`);
      break;
    }

    await page.waitForTimeout(1000);
  }

  // 4. Chờ xác nhận hoàn tất xuất bản từ máy chủ TikTok
  log(`📱 [TikTok - ${account.name}] Đang chờ máy chủ TikTok xác nhận lưu trữ và xuất bản video...`);
  for (let waitSuccess = 0; waitSuccess < 25; waitSuccess++) {
    const currentUrl = page.url();
    if (currentUrl.includes('/content') || currentUrl.includes('/posts') || currentUrl.includes('/manage')) {
      log(`🎉 [TikTok - ${account.name}] Trình duyệt đã chuyển hướng về trang quản lý bài viết thành công!`);
      break;
    }

    const hasSuccessModal = await page.locator('button:has-text("Manage your posts"), button:has-text("Quản lý bài viết"), button:has-text("Upload another video"), button:has-text("Tải video khác")').first().isVisible().catch(() => false);
    if (hasSuccessModal) {
      log(`🎉 [TikTok - ${account.name}] Phát hiện thông báo: Video đã được xuất bản công khai lên kênh thành công!`);
      break;
    }

    // Nếu nút Post ban đầu đã biến mất và modal cảnh báo cũng đã xử lý xong
    const isPostBtnStillThere = await postBtn.isVisible().catch(() => false);
    if (!isPostBtnStillThere && (postNowClicked || waitSuccess > 6)) {
      log(`🎉 [TikTok - ${account.name}] Quy trình đăng video đã được TikTok tiếp nhận và xử lý thành công!`);
      break;
    }

    await page.waitForTimeout(1000);
  }

  // Chờ thêm 3.5 giây để đảm bảo mọi request và cookie lưu trữ ổn định
  await page.waitForTimeout(3500);
  log(`🎉 [TikTok - ${account.name}] Hoàn tất toàn bộ quy trình Đăng Công Khai lên kênh!`);
}

export async function uploadSingleAccount({ account, videoPath, caption, hashtags, postMode, log }) {
  const channel = await detectBrowserChannel();
  const profileDir = getAccountProfileDir(account);

  // Clean lingering SingletonLock if previous session closed unexpectedly
  const lockFile = path.join(profileDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch {}
  }

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
    log(`📱 [TikTok - ${account.name}] Đang mở TikTok Studio Upload...`);
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=upload', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await page.waitForTimeout(3500);
    if (page.url().includes('/login')) {
      throw new Error(`Tài khoản "${account.name}" chưa đăng nhập hoặc phiên đã hết hạn.`);
    }

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
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(fullPostText, { delay: 20 });
      log(`📱 [TikTok - ${account.name}] Đã hoàn tất nhập Caption & Hashtags.`);
    } catch (editorErr) {
      log(`⚠️ [TikTok - ${account.name}] Cảnh báo không thể tự động gõ caption: ${editorErr.message}`);
    }

    await page.waitForTimeout(2500);
    await dismissTikTokStudioPopups(page, log);

    if (postMode === 'public') {
      await handleTikTokPostSubmission(uploadTarget, page, account, log);
    } else {
      // Draft mode (Lưu vào bản nháp)
      log(`📱 [TikTok - ${account.name}] Đang chờ video hoàn tất tải lên (100%) để kích hoạt nút Lưu Bản Nháp...`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      // Chờ Post button sẵn sàng (dấu hiệu video đã upload xong và các nút footer đã enable)
      const postBtnForWait = uploadTarget.getByRole('button', { name: /^(Post|Đăng)$/i, exact: true });
      for (let w = 0; w < 60; w++) {
        const isEnabled = await postBtnForWait.isEnabled().catch(() => false);
        if (isEnabled) {
          log(`📱 [TikTok - ${account.name}] Video đã tải lên hoàn tất, nút Lưu Bản Nháp đã sẵn sàng!`);
          break;
        }
        await page.waitForTimeout(1000);
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);

      const draftRegex = /^(Save draft|Lưu bản nháp)$/i;
      let draftBtn = uploadTarget.getByRole('button', { name: draftRegex, exact: true });
      if (await draftBtn.count() === 0) {
        draftBtn = page.getByRole('button', { name: draftRegex, exact: true });
      }
      if (await draftBtn.count() === 0) {
        draftBtn = uploadTarget.locator('div[class*="footer"] button, .btn-post button, footer button').filter({ hasText: draftRegex });
      }

      const actualDraftBtn = draftBtn.first();
      let draftClicked = false;
      try {
        await actualDraftBtn.waitFor({ state: 'visible', timeout: 20000 });
        await actualDraftBtn.scrollIntoViewIfNeeded().catch(() => {});
        await actualDraftBtn.click();
        draftClicked = true;
        log(`📱 [TikTok - ${account.name}] Đã bấm nút "Save draft" ("Lưu bản nháp"). Đang chờ TikTok lưu trữ...`);
      } catch (clickErr) {
        log(`⚠️ [TikTok - ${account.name}] Thử bấm Save draft thông thường gặp lỗi, đang dùng DOM dispatch: ${clickErr.message}`);
        draftClicked = await uploadTarget.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const b = btns.find(el => /^(Save draft|Lưu bản nháp)$/i.test(el.innerText?.trim()));
          if (b) { b.click(); return true; }
          return false;
        }).catch(() => false);
      }

      if (draftClicked) {
        for (let waitDraft = 0; waitDraft < 15; waitDraft++) {
          await page.waitForTimeout(1000);
          if (page.url().includes('draft') || page.url().includes('/content')) {
            log(`🎉 [TikTok - ${account.name}] Đã xác nhận: Video đã được lưu thành công vào mục Bản Nháp (Drafts) của kênh!`);
            break;
          }
        }
      } else {
        log(`⚠️ [TikTok - ${account.name}] Không bấm được nút Save draft, video có thể đã được tự động lưu tạm trên TikTok Studio.`);
      }
      await page.waitForTimeout(3500);
    }

    log(`🎉 [TikTok - ${account.name}] Hoàn tất đăng tải video thành công (${postMode === 'public' ? 'Đã đăng công khai' : 'Đã lưu bản nháp'})!`);
    await context.close();
    return { success: true, account: account.name };
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

export async function uploadToMultipleAccounts({
  videoPath,
  caption,
  hashtags,
  postMode = 'draft',
  distributionStrategy = 'distinct_random',
  skipAlreadyPublished = true,
  channelDelaySeconds = 6,
  job,
  logCallback
}) {
  const log = (msg) => {
    if (logCallback) logCallback(msg);
    if (job && typeof job.log === 'function') job.log(msg);
  };

  const accounts = loadTikTokAccounts();
  const selectedAccounts = accounts.filter((a) => a.selected && a.loggedIn);

  if (selectedAccounts.length === 0) {
    log('📱 [TikTok] Không có tài khoản nào được kết nối và chọn để đăng bài.');
    return;
  }

  // Auto reset session if idle > 30 minutes
  if (Date.now() - lastDistributionTime > 30 * 60 * 1000) {
    sessionUploadCounts.clear();
  }
  lastDistributionTime = Date.now();

  const fileName = path.basename(videoPath);

  // Check anti-duplicate
  if (skipAlreadyPublished) {
    const { published, entry } = isAlreadyPublished({ videoPath });
    if (published && entry) {
      log(`⏭️ [TikTok - Chống trùng] Bỏ qua video "${fileName}" vì đã được đăng lên kênh "${entry.accountName}" (${entry.accountUsername}) vào ${new Date(entry.publishedAt).toLocaleString('vi-VN')}.`);
      return;
    }
  }

  if (distributionStrategy === 'distinct_random') {
    // 🎯 SMART 1:1 RANDOM DISTRIBUTION:
    // Pick the selected account that has received the FEWEST uploads in this session.
    // If multiple accounts are tied, pick randomly among them.
    const minCount = Math.min(...selectedAccounts.map((a) => sessionUploadCounts.get(a.id) || 0));
    const candidates = selectedAccounts.filter((a) => (sessionUploadCounts.get(a.id) || 0) === minCount);
    const chosenAccount = candidates[Math.floor(Math.random() * candidates.length)];

    log(`🎯 [TikTok - Phân bổ 1:1] Bốc kênh ngẫu nhiên: Video "${fileName}" được gán riêng biệt cho kênh "${chosenAccount.name}" (${chosenAccount.username || chosenAccount.name}). Đảm bảo không trùng lặp video và nội dung!`);

    try {
      await uploadSingleAccount({
        account: chosenAccount,
        videoPath,
        caption,
        hashtags,
        postMode,
        log
      });
      sessionUploadCounts.set(chosenAccount.id, (sessionUploadCounts.get(chosenAccount.id) || 0) + 1);
      recordPublishedVideo({
        videoPath,
        account: chosenAccount,
        caption,
        hashtags,
        postMode,
        status: 'success'
      });
      log(`✅ [TikTok] Đã hoàn tất đăng video "${fileName}" lên kênh "${chosenAccount.name}"!`);
    } catch (err) {
      log(`⚠️ [TikTok - ${chosenAccount.name}] Lỗi: ${err.message}`);
    }
    return;
  }

  // 📢 BROADCAST MODE (Post to all selected accounts):
  log(`📢 [TikTok - Đồng loạt] Đang đăng video lên ${selectedAccounts.length} kênh đã chọn...`);
  for (let i = 0; i < selectedAccounts.length; i += 1) {
    const account = selectedAccounts[i];
    if (skipAlreadyPublished) {
      const { published } = isAlreadyPublished({ videoPath, accountId: account.id });
      if (published) {
        log(`⏭️ [TikTok - ${account.name}] Bỏ qua vì video này đã từng được đăng lên kênh này trước đó.`);
        continue;
      }
    }

    try {
      await uploadSingleAccount({
        account,
        videoPath,
        caption,
        hashtags,
        postMode,
        log
      });
      recordPublishedVideo({
        videoPath,
        account,
        caption,
        hashtags,
        postMode,
        status: 'success'
      });
    } catch (err) {
      log(`⚠️ [TikTok - ${account.name}] Lỗi: ${err.message}`);
    }

    if (i < selectedAccounts.length - 1) {
      const waitSec = Math.max(2, parseInt(channelDelaySeconds || 6, 10));
      log(`⏳ [TikTok] Đang đợi ${waitSec} giây trước khi đăng sang kênh tiếp theo...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }

  log('✅ [TikTok] Hoàn thành toàn bộ quy trình đăng video lên các kênh!');
}

export function scanWarehouseVideos(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { ok: false, message: 'Thư mục không tồn tại trên máy tính.' };
  }

  const validExts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
  const files = fs.readdirSync(folderPath);
  const videoFiles = files.filter((f) => validExts.has(path.extname(f).toLowerCase()));

  const freshVideos = [];
  const publishedVideos = [];

  for (const fileName of videoFiles) {
    const fullPath = path.join(folderPath, fileName);
    try {
      const stat = fs.statSync(fullPath);
      const { published, entry } = isAlreadyPublished({ videoPath: fullPath });
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
    } catch {}
  }

  return {
    ok: true,
    folderPath,
    totalCount: videoFiles.length,
    publishedCount: publishedVideos.length,
    freshCount: freshVideos.length,
    freshVideos,
    publishedVideos
  };
}

export async function distributeWarehouseVideos({
  folderPath,
  accountIds = [],
  postMode = 'draft',
  extraHashtags = '',
  captionPrompt = '',
  distributionStrategy = 'distinct_random',
  channelDelaySeconds = 6,
  geminiApiKey = '',
  geminiModel = 'gemini-3.8-flash',
  logCallback
}) {
  const log = (msg) => {
    if (logCallback) logCallback(msg);
  };

  const scan = scanWarehouseVideos(folderPath);
  if (!scan.ok) return scan;

  if (scan.freshCount === 0) {
    return {
      ok: false,
      message: `Toàn bộ ${scan.totalCount} video trong kho đã được đăng trước đó! Không còn video mới nào để đăng. Hãy thêm video mới vào kho hoặc bấm "Xóa Toàn Bộ Lịch Sử" để đăng lại.`
    };
  }

  const allAccounts = loadTikTokAccounts();
  let selectedAccounts = [];
  if (Array.isArray(accountIds) && accountIds.length > 0) {
    selectedAccounts = allAccounts.filter((a) => accountIds.includes(a.id));
  } else {
    selectedAccounts = allAccounts.filter((a) => a.selected);
  }

  if (selectedAccounts.length === 0) {
    return { ok: false, message: 'Chưa có tài khoản TikTok nào được chọn để đăng bài. Vui lòng tích chọn ít nhất 1 kênh trong danh sách quản lý.' };
  }

  // Shuffle fresh videos randomly (Fisher-Yates)
  const shuffledVideos = [...scan.freshVideos];
  for (let i = shuffledVideos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledVideos[i], shuffledVideos[j]] = [shuffledVideos[j], shuffledVideos[i]];
  }

  log(`📦 [Kho Video] Tìm thấy ${scan.totalCount} video (${scan.publishedCount} đã đăng bỏ qua, ${scan.freshCount} video mới sẵn sàng).`);

  const results = [];
  if (distributionStrategy === 'distinct_random') {
    // 🎯 STRICT 1:1 DISTRIBUTION:
    // Each selected channel gets EXACTLY 1 unique video. Limit is strictly min(videos, accounts).
    const targetAccounts = [...selectedAccounts];
    const limit = Math.min(shuffledVideos.length, targetAccounts.length);
    log(`🎯 [Kho Video - Phân bổ 1:1] Phân phối ${limit} video cho ${limit} kênh TikTok đã chọn (mỗi kênh nhận đúng 1 video riêng biệt, tuyệt đối không trùng lặp)...`);

    for (let i = 0; i < limit; i++) {
      const video = shuffledVideos[i];
      const account = targetAccounts[i];

      log(`\n======================================================`);
      log(`[${i + 1}/${limit}] [Phân bổ 1:1] Video: "${video.name}" -> Gán độc quyền cho Kênh: "${account.name}" (${account.username || account.name})`);

      let metadata;
      try {
        metadata = await generateTikTokMetadata([], cleanTitle, {
          geminiApiKey: geminiApiKey || process.env.GEMINI_API_KEY,
          geminiModel: geminiModel || process.env.GEMINI_MODEL,
          extraHashtags,
          captionPrompt,
          videoPath: video.path
        }, log);
      } catch (metaErr) {
        log(`⚠️ Lỗi tạo metadata AI (${metaErr.message}), tự động dùng tiêu đề và prompt trực tiếp...`);
        metadata = {
          title: cleanTitle,
          caption: captionPrompt ? `${cleanTitle}\n\n${captionPrompt}` : cleanTitle,
          hashtags: extraHashtags.split(/\s+/).filter((t) => t.startsWith('#'))
        };
      }

      try {
        await uploadSingleAccount({
          account,
          videoPath: video.path,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          postMode,
          log
        });
        recordPublishedVideo({
          videoPath: video.path,
          account,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          postMode,
          status: 'success'
        });
        results.push({ video: video.name, account: account.name, status: 'success' });
        log(`🎉 Hoàn tất phân bổ video "${video.name}" lên kênh "${account.name}"!`);
      } catch (err) {
        log(`❌ Lỗi đăng video "${video.name}" lên kênh "${account.name}": ${err.message}`);
        results.push({ video: video.name, account: account.name, status: 'error', error: err.message });
      }

      if (i < limit - 1) {
        const waitSec = Math.max(2, parseInt(channelDelaySeconds || 6, 10));
        log(`⏳ Đang đợi ${waitSec} giây trước khi chuyển sang kênh tiếp theo...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
    }
  } else {
    // Round-robin or broadcast
    const limit = shuffledVideos.length;
    log(`📢 [Kho Video] Phân bổ toàn bộ ${limit} video xoay vòng cho ${selectedAccounts.length} kênh TikTok đã chọn...`);

    for (let i = 0; i < limit; i++) {
      const video = shuffledVideos[i];
      const account = selectedAccounts[i % selectedAccounts.length];

      log(`\n======================================================`);
      log(`[${i + 1}/${limit}] Video: "${video.name}" -> Kênh: "${account.name}" (${account.username || account.name})`);

      let metadata;
      try {
        metadata = await generateTikTokMetadata([], cleanTitle, {
          geminiApiKey: geminiApiKey || process.env.GEMINI_API_KEY,
          geminiModel: geminiModel || process.env.GEMINI_MODEL,
          extraHashtags,
          captionPrompt,
          videoPath: video.path
        }, log);
      } catch (metaErr) {
        log(`⚠️ Lỗi tạo metadata AI (${metaErr.message}), tự động dùng tiêu đề và prompt trực tiếp...`);
        metadata = {
          title: cleanTitle,
          caption: captionPrompt ? `${cleanTitle}\n\n${captionPrompt}` : cleanTitle,
          hashtags: extraHashtags.split(/\s+/).filter((t) => t.startsWith('#'))
        };
      }

      try {
        await uploadSingleAccount({
          account,
          videoPath: video.path,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          postMode,
          log
        });
        recordPublishedVideo({
          videoPath: video.path,
          account,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          postMode,
          status: 'success'
        });
        results.push({ video: video.name, account: account.name, status: 'success' });
        log(`🎉 Hoàn tất đăng video "${video.name}" lên kênh "${account.name}"!`);
      } catch (err) {
        log(`❌ Lỗi đăng video "${video.name}" lên kênh "${account.name}": ${err.message}`);
        results.push({ video: video.name, account: account.name, status: 'error', error: err.message });
      }

      if (i < limit - 1) {
        const waitSec = Math.max(2, parseInt(channelDelaySeconds || 6, 10));
        log(`⏳ Đang đợi ${waitSec} giây trước khi chuyển sang kênh tiếp theo...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
    }
  }

  log(`\n✅ [Kho Video] Hoàn thành phân bổ toàn bộ ${results.length} video cho các kênh!`);
  return {
    ok: true,
    totalProcessed: results.length,
    results,
    message: `Đã hoàn tất phân bổ ${results.length} video từ kho lên các kênh TikTok!`
  };
}

