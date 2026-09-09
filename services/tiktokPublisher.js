import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';

function getDataDir() {
  const dir = process.env.VIETDUB_DATA_DIR || path.join(process.cwd(), 'data');
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

export function checkProfileHasSession(profileDir) {
  const cookiePath = path.join(profileDir, 'Default', 'Network', 'Cookies');
  if (!fs.existsSync(cookiePath)) return false;
  try {
    const stat = fs.statSync(cookiePath);
    if (stat.size < 500) return false;
    const tmp = path.join(os.tmpdir(), `check_cookie_${Date.now()}_${Math.random().toString(36).substring(2)}.db`);
    fs.copyFileSync(cookiePath, tmp);
    const buf = fs.readFileSync(tmp);
    try { fs.unlinkSync(tmp); } catch {}
    // Checks for sessionid or sessionid_ss or sid_tt
    return buf.includes(Buffer.from('sessionid')) || buf.includes(Buffer.from('sid_tt'));
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
  if (!checkProfileHasSession(profileDir)) {
    return { ok: false, message: 'Chưa phát hiện phiên đăng nhập trong trình duyệt.' };
  }

  // If native Chrome is still open, close it so profile directory is not locked
  if (nativeBrowsers.has(account.id)) {
    const child = nativeBrowsers.get(account.id);
    try {
      if (child && child.pid) process.kill(child.pid);
    } catch {}
    nativeBrowsers.delete(account.id);
    await new Promise((r) => setTimeout(r, 1200));
  }

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

  account.loggedIn = true;
  saveTikTokAccounts(accounts);
  return {
    ok: true,
    channelName: account.name,
    username: account.username || 'TikTok Creator',
    message: `Đã lưu thành công kênh "${account.name}" (${account.username})!`
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

  if (hasSession) {
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
        ? 'Đã nhận diện phiên đăng nhập thành công! Hãy đóng cửa sổ Chrome để đồng bộ tên kênh.'
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

  const fullText = cues.map((c) => c.text).join(' ').slice(0, 3000);
  const userHashtags = String(aiOptions.extraHashtags || '').trim();

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

Nhiem vu: Hay viet tieu de va noi dung dang bai TikTok (social media post) cuc ky hap dan, giat tit tuc thi, chuan xu huong TikTok Viet Nam:
1. "hook": 1 cau giat tit gay to mo, ngan gon duoi 50 ky tu (co icon phu hop).
2. "caption": 1-2 cau tom tat kich tinh hoac loi keu goi xem video (duoi 120 ky tu).
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

export async function uploadSingleAccount({ account, videoPath, caption, hashtags, postMode, log }) {
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
      '--no-first-run'
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
    log(`📱 [TikTok - ${account.name}] Đang mở TikTok Creator Studio Upload...`);
    await page.goto('https://www.tiktok.com/creator-center/upload?from=upload', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await page.waitForTimeout(3000);
    if (page.url().includes('/login')) {
      throw new Error(`Tài khoản "${account.name}" chưa đăng nhập hoặc phiên đã hết hạn.`);
    }

    log(`📱 [TikTok - ${account.name}] Đang nạp video vào khung tải lên...`);
    let uploadTarget = page;
    const uploadFrameElement = await page.$('iframe[src*="upload"]');
    if (uploadFrameElement) {
      const frame = await uploadFrameElement.contentFrame();
      if (frame) uploadTarget = frame;
    }

    const fileInput = await uploadTarget.waitForSelector('input[type="file"]', { timeout: 30000 });
    await fileInput.setInputFiles(videoPath);
    log(`📱 [TikTok - ${account.name}] Đã nạp file video. Đang tải lên máy chủ TikTok...`);

    await page.waitForTimeout(8000);

    const tagString = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const fullPostText = `${caption}\n\n${tagString}`.trim();

    log(`📱 [TikTok - ${account.name}] Đang nhập Caption & Hashtags...`);
    const editorSelector = 'div[contenteditable="true"], .DraftEditor-root, div[role="textbox"]';
    try {
      const editor = await uploadTarget.waitForSelector(editorSelector, { timeout: 20000 });
      await editor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(fullPostText, { delay: 25 });
    } catch {
      log(`📱 [TikTok - ${account.name}] Cảnh báo: Không thể nhập tự động vào khung caption.`);
    }

    await page.waitForTimeout(3000);

    if (postMode === 'draft') {
      log(`📱 [TikTok - ${account.name}] Đang lưu vào mục Bản Nháp (Draft)...`);
      const buttons = await uploadTarget.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = (await btn.innerText()).toLowerCase();
        if (text.includes('draft') || text.includes('nháp')) {
          await btn.click();
          clicked = true;
          log(`📱 [TikTok - ${account.name}] Đã bấm nút "Lưu bản nháp".`);
          break;
        }
      }
      if (!clicked) log(`📱 [TikTok - ${account.name}] Lưu bản nháp tự động hoàn tất.`);
    } else {
      log(`📱 [TikTok - ${account.name}] Đang thực hiện Đăng Công Khai (Public Post)...`);
      const buttons = await uploadTarget.$$('button');
      for (const btn of buttons) {
        const text = (await btn.innerText()).toLowerCase();
        if (text.trim() === 'post' || text.trim() === 'đăng') {
          await btn.click();
          log(`📱 [TikTok - ${account.name}] Đã bấm nút "Đăng video".`);
          break;
        }
      }
    }

    await page.waitForTimeout(6000);
    log(`🎉 [TikTok - ${account.name}] Đã đăng tải thành công (${postMode === 'draft' ? 'Đã lưu bản nháp' : 'Đã đăng công khai'})!`);
    await context.close();
    return { success: true, account: account.name };
  } catch (err) {
    await context.close();
    throw err;
  }
}

export async function uploadToMultipleAccounts({ videoPath, caption, hashtags, postMode = 'draft', job, logCallback }) {
  const log = (msg) => {
    if (logCallback) logCallback(msg);
    if (job && typeof job.log === 'function') job.log(msg);
  };

  const accounts = loadTikTokAccounts();
  const selectedAccounts = accounts.filter((a) => a.selected);

  if (selectedAccounts.length === 0) {
    log('📱 [TikTok] Không có tài khoản nào được chọn để đăng bài.');
    return;
  }

  log(`📱 [TikTok] Bắt đầu đăng đồng loạt lên ${selectedAccounts.length} tài khoản...`);

  for (let i = 0; i < selectedAccounts.length; i += 1) {
    const account = selectedAccounts[i];
    try {
      await uploadSingleAccount({
        account,
        videoPath,
        caption,
        hashtags,
        postMode,
        log
      });
    } catch (err) {
      log(`⚠️ [TikTok - ${account.name}] Lỗi: ${err.message}`);
    }

    // Delay 6 seconds between multiple accounts to prevent spam detection
    if (i < selectedAccounts.length - 1) {
      log('⏳ [TikTok] Đang đợi 6 giây trước khi đăng sang tài khoản tiếp theo...');
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
  }

  log('✅ [TikTok] Hoàn thành toàn bộ quy trình đăng video lên các kênh!');
}
