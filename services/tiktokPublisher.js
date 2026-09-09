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
    caption: caption.slice(0, 300),
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

export async function generateTikTokMetadata(cues = [], originalTitle = '', aiOptions = {}) {
  const geminiApiKey = aiOptions.geminiApiKey || process.env.GEMINI_API_KEY;
  const geminiModel = aiOptions.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const cuesText = (cues && cues.length > 0) ? cues.map((c) => c.text).join(' ').slice(0, 3000) : '';
  const fullText = cuesText || String(originalTitle || '').trim();
  const userHashtags = String(aiOptions.extraHashtags || '').trim();
  const userPrompt = String(aiOptions.captionPrompt || '').trim();

  if (!geminiApiKey || !fullText) {
    const defaultTitle = originalTitle ? `Review: ${originalTitle.slice(0, 60)}` : 'Video Lồng Tiếng Hay Nhất';
    return {
      title: defaultTitle,
      caption: `${defaultTitle}\n\nXem ngay video thú vị này nhé mọi người!`,
      hashtags: ['#xuhuong', '#fyp', '#vietdub', '#review', '#trending'].concat(
        userHashtags ? userHashtags.split(/\s+/).filter((t) => t.startsWith('#')) : []
      )
    };
  }

  const prompt = `Dua tren noi dung video long tieng tieng Viet sau day:
"""
${fullText}
"""
${userPrompt ? `\nYEU CAU PHONG CACH & PROMPT MAU TU NGUOI DUNG (BAT BUOC TUAN THU):\n"${userPrompt}"\n` : ''}
Nhiem vu: Hay viet tieu de va noi dung dang bai TikTok (social media post) cuc ky hap dan, giat tit tuc thi, chuan xu huong TikTok Viet Nam theo dung phong cach nguoi dung yeu cau:
1. "hook": 1 cau giat tit gay to mo, ngan gon duoi 50 ky tu (co icon phu hop).
2. "caption": 1-2 cau tom tat kich tinh hoac loi keu goi xem video (duoi 150 ky tu).
3. "hashtags": Danh sach 5-7 hashtags hot nhat (#xuhuong, #fyp va cac hashtag sat voi noi dung). ${userHashtags ? `Gom ca cac hashtag bat buoc: ${userHashtags}` : ''}

Tra ve DUY NHAT dinh dang JSON hop le theo mau sau, khong markdown fence, khong chu thich:
{
  "hook": "...",
  "caption": "...",
  "hashtags": ["#xuhuong", "#fyp", "..."]
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
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

    if (!response.ok) throw new Error(`Gemini status ${response.status}`);
    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawJson);

    return {
      title: parsed.hook || 'Video Lồng Tiếng Đỉnh Cao',
      caption: `${parsed.hook || ''}\n${parsed.caption || ''}`.trim(),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#xuhuong', '#fyp', '#vietdub']
    };
  } catch {
    return {
      title: originalTitle || 'Video Lồng Tiếng Đỉnh Cao',
      caption: 'Video cực cuốn, xem ngay nhé mọi người!',
      hashtags: ['#xuhuong', '#fyp', '#vietdub', '#trending']
    };
  }
}

// Helper to dismiss guide, sound recommendations, or copyright check popups
async function dismissTikTokStudioPopups(page, log) {
  try {
    const popupSelectors = [
      'button:has-text("Got it")',
      'button:has-text("Đã hiểu")',
      'button:has-text("Turn on")',
      'button:has-text("Bật")',
      'button:has-text("Cancel")',
      'button:has-text("Hủy")',
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
      log(`📱 [TikTok - ${account.name}] Đang thực hiện Đăng Công Khai (Post)...`);
      const postBtn = uploadTarget.locator('button.Button__root--type-primary:has-text("Post"), button:has-text("Đăng")').first();
      await postBtn.waitFor({ state: 'visible', timeout: 20000 });

      // Wait until upload finishes and button is enabled
      for (let w = 0; w < 30; w++) {
        if (await postBtn.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(1000);
      }

      await postBtn.click();
      log(`📱 [TikTok - ${account.name}] Đã bấm nút "Đăng video". Đang hoàn tất...`);
      await page.waitForTimeout(6000);
    } else {
      // Draft mode
      log(`📱 [TikTok - ${account.name}] Đang lưu vào mục Bản Nháp (Draft)...`);
      const draftBtn = uploadTarget.locator('button:has-text("Draft"), button:has-text("Nháp"), button:has-text("Save draft"), button:has-text("Lưu bản nháp")').first();
      if (await draftBtn.isVisible().catch(() => false)) {
        await draftBtn.click().catch(() => {});
        log(`📱 [TikTok - ${account.name}] Đã bấm nút "Lưu bản nháp".`);
      } else {
        log(`📱 [TikTok - ${account.name}] Video đã được nạp thành công và lưu tự động vào mục Bản Nháp của TikTok Studio.`);
      }
      await page.waitForTimeout(4000);
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
      log('⏳ [TikTok] Đang đợi 6 giây trước khi đăng sang kênh tiếp theo...');
      await new Promise((r) => setTimeout(r, 6000));
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

      const cleanTitle = path.basename(video.name, path.extname(video.name)).replace(/[-_]/g, ' ');
      log(`🤖 [AI Gemini] Đang tạo tiêu đề & caption theo prompt mẫu...`);
      const metadata = await generateTikTokMetadata([], cleanTitle, {
        geminiApiKey: geminiApiKey || process.env.GEMINI_API_KEY,
        geminiModel: geminiModel || process.env.GEMINI_MODEL,
        extraHashtags,
        captionPrompt
      });
      log(`✨ [AI Gemini] Tiêu đề: "${metadata.title}"`);

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
        log('⏳ Đang đợi 6 giây trước khi chuyển sang kênh tiếp theo...');
        await new Promise((r) => setTimeout(r, 6000));
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

      const cleanTitle = path.basename(video.name, path.extname(video.name)).replace(/[-_]/g, ' ');
      log(`🤖 [AI Gemini] Đang tạo tiêu đề & caption theo prompt mẫu...`);
      const metadata = await generateTikTokMetadata([], cleanTitle, {
        geminiApiKey: geminiApiKey || process.env.GEMINI_API_KEY,
        geminiModel: geminiModel || process.env.GEMINI_MODEL,
        extraHashtags,
        captionPrompt
      });
      log(`✨ [AI Gemini] Tiêu đề: "${metadata.title}"`);

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
        log('⏳ Đang đợi 6 giây trước khi chuyển sang kênh tiếp theo...');
        await new Promise((r) => setTimeout(r, 6000));
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

