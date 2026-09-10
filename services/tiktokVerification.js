export function normalizeCaption(text) { return String(text || '').normalize('NFC').replace(/\s+/g, ' ').trim(); }

function postCreatedAt(id) {
  // TikTok video IDs encode creation seconds in their upper 32 bits.
  try { return Number(BigInt(id) >> 32n) * 1000; } catch { return 0; }
}

export function selectEvidence(rows, item) {
  const expected = normalizeCaption([item.caption, ...(item.hashtags || []).map(t => t.startsWith('#') ? t : `#${t}`)].join(' '));
  const username = String(item.accountUsername || '').replace(/^@/, '').toLowerCase();
  if (!username || expected.length < 12 || !Array.isArray(item.baselineIds) || !item.submittedAt) return { status: 'needs_review', message: 'Thiếu dữ liệu đối chiếu bài đăng. Không tự đăng lại.' };
  const submittedAt = Date.parse(item.submittedAt);
  const matches = rows.filter(row => row.id && !item.baselineIds.includes(row.id) && postCreatedAt(row.id) >= submittedAt - 120000 && postCreatedAt(row.id) <= Date.now() + 300000 && row.username?.toLowerCase() === username && normalizeCaption(row.caption) === expected);
  if (matches.length !== 1) return { status: 'needs_review', message: matches.length ? 'Nhiều bài cùng nội dung; cần kiểm tra thủ công.' : 'Chưa tìm thấy đúng bài vừa gửi. Có thể TikTok chưa cập nhật danh sách.' };
  const row = matches[0];
  if (row.processing) return { status: 'processing', postId: row.id, postUrl: row.url, message: 'Đúng bài đang được TikTok xử lý/kiểm duyệt; chưa xác nhận công khai.' };
  if (row.visibility !== 'public') return { status: 'needs_review', postId: row.id, postUrl: row.url, message: 'Đã tìm thấy bài nhưng chưa xác nhận quyền Công khai.' };
  return { status: 'success', postId: row.id, postUrl: row.url, visibility: 'public', verification: 'studio-row-caption-account-new-id', confirmedAt: new Date().toISOString() };
}

export async function assertSession(page) {
  if (/\/login(?:[/?]|$)/.test(page.url())) throw Object.assign(new Error('Phiên đăng nhập hết hạn. Mở đăng nhập kênh rồi thử lại.'), { code: 'NEEDS_ACTION' });
  const challenge = page.locator('iframe[src*="captcha"], [id*="captcha"], [class*="captcha-verify"], [data-e2e="captcha"]');
  for (let i = 0; i < await challenge.count(); i++) {
    if (await challenge.nth(i).isVisible()) throw Object.assign(new Error('TikTok yêu cầu xác minh. Mở đăng nhập kênh để xử lý CAPTCHA, sau đó đóng Chrome và tiếp tục.'), { code: 'NEEDS_ACTION' });
  }
}

export async function readStudioRows(page) {
  await assertSession(page);
  return page.evaluate(() => {
    const rows = new Map();
    for (const link of document.querySelectorAll('a[href*="/video/"]')) {
      const match = link.href.match(/^https:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/video\/(\d+)/);
      if (!match) continue;
      const row = link.closest('tr, [role="row"], [data-e2e="content-post-item"], [class*="PostCard"], [class*="post-card"], [class*="video-card"], [class*="content-item"]');
      if (!row) continue;
      const text = row.innerText;
      const captionEl = row.querySelector('[data-e2e="video-desc"], [data-e2e="content-post-caption"], [class*="caption"], [class*="video-title"], [class*="post-title"]') || link;
      const caption = captionEl.getAttribute('title') || captionEl.getAttribute('aria-label') || captionEl.innerText;
      const labels = text.split(/[\n\t]/).map(t => t.trim());
      const isPrivate = labels.some(t => /^(Only me|Chỉ mình tôi|Friends|Bạn bè|Private|Riêng tư)$/i.test(t));
      const isPublic = labels.some(t => /^(Everyone|Public|Công khai|Mọi người)$/i.test(t));
      rows.set(match[2], { id: match[2], username: decodeURIComponent(match[1]), url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}`, caption, visibility: isPrivate ? 'private' : isPublic ? 'public' : 'unknown', processing: /under review|processing|đang (xử lý|xem xét|kiểm duyệt)/i.test(text) });
    }
    return [...rows.values()];
  });
}

export async function loadStudioContent(page) {
  await page.goto('https://www.tiktok.com/tiktokstudio/content?tab=post', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);
  await assertSession(page);
  // Require a recognizable loaded list, including the explicit empty state.
  await page.locator('a[href*="/video/"], [data-e2e="content-post-item"]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(async () => {
    const empty = page.getByText(/^(No (posts|videos|content)( yet)?|You haven.t posted any videos yet\.?|Chưa có (bài đăng|video|nội dung)|Không có (bài đăng|video|nội dung))$/i).first();
    if (!await empty.isVisible().catch(() => false)) {
      await assertSession(page);
      throw new Error('Không đọc được danh sách bài TikTok Studio. Đóng các cửa sổ Chrome của kênh và thử lại.');
    }
  });
  return readStudioRows(page);
}

export async function ensurePublic(target) {
  const label = target.getByText(/^(Who can (watch|view) this video|Ai có thể (xem|xem video này))\??$/i).first();
  const container = label.locator('..');
  const select = container.locator('select');
  if (await select.count()) {
    const option = select.locator('option').filter({ hasText: /^(Everyone|Public|Mọi người|Công khai)$/i }).first();
    const value = await option.getAttribute('value');
    if (value === null) throw new Error('Không tìm thấy lựa chọn Công khai.');
    await select.selectOption(value);
    return;
  }
  if (!await label.isVisible().catch(() => false)) throw new Error('Không xác định được trường quyền hiển thị. Dừng trước khi Đăng.');
  const publicText = container.getByText(/^(Everyone|Public|Mọi người|Công khai)$/i).first();
  if (await publicText.isVisible().catch(() => false)) return;
  await container.locator('[role="combobox"], button, [class*="select"]').first().click({ timeout: 5000 });
  await target.getByText(/^(Everyone|Public|Mọi người|Công khai)$/i).last().click({ timeout: 5000 });
  if (!await publicText.isVisible().catch(() => false)) throw new Error('TikTok chưa xác nhận quyền Công khai.');
}
