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
      const row = link.closest('tr, [role="row"], [data-tt="components_RowLayout_FlexRow"], [data-e2e="content-post-item"], [class*="PostCard"], [class*="post-card"], [class*="video-card"], [class*="content-item"]');
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
  // TikTok may render the empty title and description in one text node.
  // Match rendered lines rather than requiring one exact text element.
  await page.waitForFunction(() => {
    if (document.querySelector('a[href*="/video/"], [data-e2e="content-post-item"]')) return true;
    const lines = document.body.innerText.split('\n').map(t => t.trim());
    return lines.some(t => /^(No (posts|videos|content)( yet)?|You haven.t posted any videos yet\.?|Chưa có (bài đăng|video|nội dung)|Không có (bài đăng|video|nội dung))$/i.test(t));
  }, null, { timeout: 20000 }).catch(async () => {
    await assertSession(page);
    throw new Error('Không đọc được danh sách bài TikTok Studio. Thử đối soát lại sau khi trang tải xong.');
  });
  return readStudioRows(page);
}

export async function ensurePublic(target) {
  const publicName = /^(Everyone|Public|Mọi người|Công khai)$/i;
  let container = target.locator('[data-e2e="video_visibility_container"]').first();
  if (!await container.isVisible().catch(() => false)) {
    const labels = target.getByText(/^(Who can (watch|view|see) this (video|post)|Ai có thể (xem|xem video này|xem bài (đăng|viết) này))\??$/i);
    let found = false;
    for (let i = 0; i < await labels.count() && !found; i++) {
      if (!await labels.nth(i).isVisible()) continue;
      let parent = labels.nth(i);
      for (let depth = 0; depth < 4; depth++) {
        parent = parent.locator('..');
        if (await parent.locator('select, [role="combobox"]').count() === 1) { container = parent; found = true; break; }
      }
    }
    if (!found) throw new Error('Không xác định được trường quyền hiển thị. Dừng trước khi Đăng.');
  }
  await container.scrollIntoViewIfNeeded();
  const select = container.locator('select');
  if (await select.count()) {
    const option = select.locator('option').filter({ hasText: publicName }).first();
    const value = await option.getAttribute('value');
    if (value === null) throw new Error('Không tìm thấy lựa chọn Công khai.');
    await select.selectOption(value);
    return;
  }
  const trigger = container.getByRole('combobox').first();
  if (publicName.test((await trigger.innerText()).trim())) return;
  await trigger.click({ timeout: 5000 });
  const options = target.getByText(publicName);
  let clicked = false;
  for (let i = 0; i < await options.count(); i++) {
    if (await options.nth(i).isVisible()) { await options.nth(i).click({ timeout: 5000 }); clicked = true; break; }
  }
  if (!clicked) throw new Error('Không tìm thấy lựa chọn Công khai trong menu quyền hiển thị.');
  await trigger.filter({ hasText: publicName }).waitFor({ state: 'visible', timeout: 5000 });
}
