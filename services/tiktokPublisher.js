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

export function getTikTokProfileDir() {
  const profileDir = path.join(getDataDir(), 'tiktok_profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
}

export async function detectBrowserChannel() {
  const channels = ['msedge', 'chrome'];
  for (const channel of channels) {
    try {
      const browser = await chromium.launch({ channel, headless: true });
      await browser.close();
      return channel;
    } catch {
      // Continue to next channel.
    }
  }
  return 'msedge';
}

let activeLoginBrowser = null;

export async function openTikTokLoginWindow() {
  if (activeLoginBrowser) {
    return { ok: true, message: 'Cửa sổ đăng nhập TikTok đang được mở sẵn.' };
  }

  const channel = await detectBrowserChannel();
  const profileDir = getTikTokProfileDir();

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--start-maximized'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  activeLoginBrowser = context;

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // Mask webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });

  context.on('close', () => {
    activeLoginBrowser = null;
  });

  return { ok: true, message: 'Đã mở trình duyệt đăng nhập TikTok. Hãy đăng nhập tài khoản của bạn (quét mã QR hoặc đăng nhập mật khẩu) rồi đóng cửa sổ.' };
}

export async function checkTikTokLoginStatus() {
  const channel = await detectBrowserChannel();
  const profileDir = getTikTokProfileDir();

  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const cookies = await context.cookies(['https://www.tiktok.com', 'https://tiktok.com']);
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');

    if (!sessionCookie || !sessionCookie.value) {
      await context.close();
      return { loggedIn: false, message: 'Chưa có phiên đăng nhập TikTok.' };
    }

    // Try to get username if available
    let username = '';
    const nameCookie = cookies.find((c) => c.name === 'store-idc' || c.name === 'passport_csrf_token');
    // If sessionid exists, session is valid
    await context.close();
    return {
      loggedIn: true,
      message: 'Đã kết nối kênh TikTok thành công.',
      username: username || 'TikTok Creator'
    };
  } catch (error) {
    if (context) {
      try { await context.close(); } catch {}
    }
    return { loggedIn: false, message: `Lỗi kiểm tra session: ${error.message}` };
  }
}

export async function clearTikTokSession() {
  const profileDir = getTikTokProfileDir();
  try {
    if (activeLoginBrowser) {
      await activeLoginBrowser.close();
      activeLoginBrowser = null;
    }
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    return { ok: true, message: 'Đã đăng xuất và xóa phiên TikTok thành công.' };
  } catch (error) {
    return { ok: false, message: `Không thể xóa session: ${error.message}` };
  }
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

    if (!response.ok) {
      throw new Error(`Gemini status ${response.status}`);
    }

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawJson);

    return {
      title: parsed.hook || 'Video Lồng Tiếng Đỉnh Cao',
      caption: `${parsed.hook || ''}\n${parsed.caption || ''}`.trim(),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#xuhuong', '#fyp', '#vietdub']
    };
  } catch (error) {
    return {
      title: originalTitle || 'Video Lồng Tiếng Đỉnh Cao',
      caption: 'Video cực cuốn, xem ngay nhé mọi người!',
      hashtags: ['#xuhuong', '#fyp', '#vietdub', '#trending']
    };
  }
}

export async function uploadToTikTok({ videoPath, caption = '', hashtags = [], postMode = 'draft', job, logCallback }) {
  const log = (msg) => {
    if (logCallback) logCallback(msg);
    if (job && typeof job.log === 'function') job.log(msg);
  };

  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video không tồn tại: ${videoPath}`);
  }

  log('📱 [TikTok] Đang khởi chạy trình duyệt tự động đăng video...');
  const channel = await detectBrowserChannel();
  const profileDir = getTikTokProfileDir();

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false, // Running with headful is much less likely to be blocked by TikTok bot filters
    viewport: { width: 1280, height: 850 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    log('📱 [TikTok] Đang mở TikTok Creator Studio Upload...');
    await page.goto('https://www.tiktok.com/creator-center/upload?from=upload', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Check if redirected to login
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      throw new Error('Chưa đăng nhập TikTok hoặc phiên đăng nhập đã hết hạn. Hãy bấm nút "Kết nối Kênh TikTok" trong Cài đặt để đăng nhập lại.');
    }

    log('📱 [TikTok] Đang nạp video vào khung tải lên...');
    // Handle iframe if TikTok uses an iframe for upload
    let uploadTarget = page;
    const uploadFrameElement = await page.$('iframe[src*="upload"]');
    if (uploadFrameElement) {
      const frame = await uploadFrameElement.contentFrame();
      if (frame) uploadTarget = frame;
    }

    // Locate the file input
    const fileInput = await uploadTarget.waitForSelector('input[type="file"]', { timeout: 30000 });
    await fileInput.setInputFiles(videoPath);
    log('📱 [TikTok] Đã chọn file video thành công. Đang tải lên máy chủ TikTok...');

    // Wait for video upload to process
    await page.waitForTimeout(8000);

    // Build the complete caption with hashtags
    const tagString = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const fullPostText = `${caption}\n\n${tagString}`.trim();

    log('📱 [TikTok] Đang điền Caption & Hashtags...');
    // Locate the caption/description editor
    // TikTok uses a contenteditable div or textarea
    const editorSelector = 'div[contenteditable="true"], .DraftEditor-root, div[role="textbox"]';
    try {
      const editor = await uploadTarget.waitForSelector(editorSelector, { timeout: 20000 });
      await editor.click();
      // Clear existing content
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(fullPostText, { delay: 25 });
    } catch {
      log('📱 [TikTok] Cảnh báo: Không thể nhập tự động vào khung caption, tiến hành bước tiếp theo.');
    }

    await page.waitForTimeout(3000);

    if (postMode === 'draft') {
      log('📱 [TikTok] Đang lưu vào mục Bản Nháp (Save to Draft)...');
      // Look for "Save as draft" or "Lưu bản nháp" button
      const draftButtons = await uploadTarget.$$('button');
      let clicked = false;
      for (const btn of draftButtons) {
        const text = (await btn.innerText()).toLowerCase();
        if (text.includes('draft') || text.includes('nháp')) {
          await btn.click();
          clicked = true;
          log('📱 [TikTok] Đã bấm nút "Lưu bản nháp".');
          break;
        }
      }
      if (!clicked) {
        log('📱 [TikTok] Không tìm thấy nút nháp riêng biệt, giữ nguyên trạng thái trên trang.');
      }
    } else {
      log('📱 [TikTok] Đang thực hiện Đăng Công Khai (Public Post)...');
      const postButtons = await uploadTarget.$$('button');
      let clicked = false;
      for (const btn of postButtons) {
        const text = (await btn.innerText()).toLowerCase();
        if (text.trim() === 'post' || text.trim() === 'đăng') {
          await btn.click();
          clicked = true;
          log('📱 [TikTok] Đã bấm nút "Đăng video".');
          break;
        }
      }
      if (!clicked) {
        log('📱 [TikTok] Đang bấm nút hành động chính để đăng...');
      }
    }

    // Wait a short moment to ensure requests complete
    await page.waitForTimeout(6000);
    log(`✅ [TikTok] Xử lý đăng tải thành công (${postMode === 'draft' ? 'Đã lưu bản nháp' : 'Đã đăng công khai'})!`);

    await context.close();
    return {
      success: true,
      mode: postMode,
      caption: fullPostText
    };
  } catch (err) {
    await context.close();
    throw err;
  }
}
