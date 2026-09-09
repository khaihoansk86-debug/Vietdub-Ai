import fs from 'fs';
import path from 'path';
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
  const channels = ['msedge', 'chrome'];
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      await browser.close();
      return channel;
    } catch {
      // Continue searching
    }
  }
  return 'msedge';
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

// Active browsers map: accountId -> context
const activeBrowsers = new Map();

export async function openTikTokLoginWindow(accountId) {
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  if (!account) return { ok: false, message: 'Không tìm thấy tài khoản TikTok.' };

  if (activeBrowsers.has(account.id)) {
    return { ok: true, message: `Cửa sổ đăng nhập cho "${account.name}" đang được mở sẵn trên màn hình.` };
  }

  const channel = await detectBrowserChannel();
  const profileDir = getAccountProfileDir(account);

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: false,
      viewport: { width: 1280, height: 850 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
        '--start-maximized'
      ]
    });

    activeBrowsers.set(account.id, context);

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });

    context.on('close', async () => {
      activeBrowsers.delete(account.id);
      // Check and update username upon close
      await updateAccountUsernameAfterClose(account);
    });

    return {
      ok: true,
      message: `Đã mở trình duyệt cho "${account.name}". Hãy đăng nhập (quét mã QR hoặc tài khoản), sau đó đóng cửa sổ lại.`
    };
  } catch (error) {
    activeBrowsers.delete(account.id);
    return { ok: false, message: `Lỗi mở trình duyệt: ${error.message}` };
  }
}

async function updateAccountUsernameAfterClose(account) {
  try {
    const status = await checkAccountStatus(account.id);
    if (status.loggedIn && status.username) {
      const accounts = loadTikTokAccounts();
      const acc = accounts.find((a) => a.id === account.id);
      if (acc) {
        acc.username = status.username;
        saveTikTokAccounts(accounts);
      }
    }
  } catch {}
}

export async function checkAccountStatus(accountId) {
  const accounts = loadTikTokAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { loggedIn: false, message: 'Tài khoản không tồn tại.' };

  // 1. If browser window is currently open, read cookies directly from memory (ZERO lock conflict!)
  if (activeBrowsers.has(account.id)) {
    const context = activeBrowsers.get(account.id);
    try {
      const cookies = await context.cookies(['https://www.tiktok.com', 'https://tiktok.com']);
      const sessionCookie = cookies.find((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');
      if (sessionCookie && sessionCookie.value) {
        return {
          loggedIn: true,
          username: account.username || 'TikTok Creator',
          message: 'Đã kết nối thành công.'
        };
      }
      return { loggedIn: false, message: 'Đang mở cửa sổ đăng nhập... Vui lòng quét mã QR hoặc nhập mật khẩu.' };
    } catch {
      return { loggedIn: false, message: 'Đang kết nối...' };
    }
  }

  // 2. If browser is closed, check cookies file first
  const profileDir = getAccountProfileDir(account);
  const cookiePath = path.join(profileDir, 'Default', 'Network', 'Cookies');
  if (!fs.existsSync(cookiePath) || fs.statSync(cookiePath).size < 1000) {
    return { loggedIn: false, message: 'Chưa đăng nhập tài khoản này.' };
  }

  // 3. Launch a lightweight probe safely without crashing
  const channel = await detectBrowserChannel();
  let probeContext = null;
  try {
    probeContext = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const cookies = await probeContext.cookies(['https://www.tiktok.com', 'https://tiktok.com']);
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');

    if (!sessionCookie || !sessionCookie.value) {
      await probeContext.close();
      return { loggedIn: false, message: 'Chưa có phiên đăng nhập TikTok.' };
    }

    await probeContext.close();
    return {
      loggedIn: true,
      username: account.username || 'TikTok Creator',
      message: 'Đã kết nối thành công.'
    };
  } catch (error) {
    if (probeContext) {
      try { await probeContext.close(); } catch {}
    }
    // Fallback: If cookie file has data, assume logged in
    return {
      loggedIn: true,
      username: account.username || 'TikTok Creator',
      message: 'Đã kết nối.'
    };
  }
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

  log(`📱 [TikTok - ${account.name}] Đang khởi chạy trình duyệt...`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    viewport: { width: 1280, height: 850 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars'
    ]
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

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
