import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readStudioRows, selectEvidence, ensurePublic, assertSession } from '../services/tiktokVerification.js';

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vietdub-studio-smoke-'));
const output = path.join(root, 'dist', 'qa'); fs.mkdirSync(output, { recursive: true });
const port = 3297;
const accounts = [{ id: 'qa_a', name: 'Khải Hoàn Studio', username: '@studio_demo', selected: true, loggedIn: true, folder: 'tiktok_profiles/qa_a' }];
accounts.push(...Array.from({ length: 23 }, (_, i) => ({ id: `qa_${i}`, name: `Kênh thử nghiệm ${i + 2}`, username: `@qa_${i}`, selected: false, loggedIn: false, folder: `tiktok_profiles/qa_${i}` })));
fs.writeFileSync(path.join(temp, 'tiktok_accounts.json'), JSON.stringify(accounts));
const run = { id: 'qa-run', status: 'preview', createdAt: new Date().toISOString(), checks: [{ status: 'pass', label: 'Kho video', message: 'Dữ liệu mô phỏng phục vụ kiểm thử giao diện.' }], channelDelaySeconds: 6, items: [
  { id: 'qa-item-1', accountId: 'qa_a', accountName: 'Khải Hoàn Studio', accountUsername: '@studio_demo', video: 'Chăm sóc da đúng cách — tập 01.mp4', caption: 'Một thói quen nhỏ, một thay đổi lớn. <img src=x onerror=alert(1)>', hashtags: ['#chamsocda', '#vietdub'], status: 'queued', attempts: 0 },
  { id: 'qa-item-2', accountId: 'qa_b', accountName: 'Góc sống khỏe', accountUsername: '@songkhoe_demo', video: 'Câu chuyện mỗi ngày — tập 02.mp4', caption: 'Câu chuyện mỗi ngày', hashtags: ['#songkhoe'], status: 'needs_review', attempts: 1, error: 'Mất kết nối sau khi gửi. Đối soát trước khi tiếp tục.' }
] };
fs.writeFileSync(path.join(temp, 'tiktok_publish_runs.json'), JSON.stringify([run]));
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', VIETDUB_DATA_DIR: temp, VIETDUB_SKIP_KOKORO_AUTOSTART: '1' };
const child = spawn(process.execPath, ['server.js'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; child.stdout.on('data', c => { serverLog += c; }); child.stderr.on('data', c => { serverLog += c; });
let browser;
try {
  let healthy = false;
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { healthy = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
  assert.ok(healthy, serverLog);
  const origin = `http://127.0.0.1:${port}`;
  const crossOrigin = await fetch(`${origin}/api/tiktok/runs/qa-run/start`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(crossOrigin.status, 403);
  const invalid = await fetch(`${origin}/api/tiktok/runs/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountIds: [] }) });
  assert.equal(invalid.status, 409);
  assert.equal((await (await fetch(`${origin}/api/tiktok/runs`)).json()).runs[0].status, 'preview');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', () => errors.push('Unexpected native dialog'));
  await page.goto(origin); await page.waitForSelector('#warehouseDistributeBtn');
  assert.equal(await page.title(), 'VietDub AI Studio');
  assert.equal(await page.locator('#pubRunSelect').count(), 0);
  assert.equal(await page.locator('#viewPublish').isVisible(), true);
  await page.route('**/api/tiktok/accounts/*/login', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Opening Studio' }) }));
  await page.locator('.tiktok-studio-btn').first().click();
  assert.equal(await page.locator('#tiktokAutoUpload').count(), 0);
  assert.equal(await page.locator('select[name="tiktokDistributionStrategy"]').count(), 0);
  assert.equal(await page.locator('.publish-policy').count(), 3);
  await page.locator('#selectAllAccounts').click();
  await page.waitForFunction(() => document.querySelectorAll('.tiktok-account-card.selected').length === 24);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'tiktok_accounts.json'))).filter(a => a.selected).length, 24);
  await page.locator('#deselectAllAccounts').click();
  await page.waitForFunction(() => document.querySelectorAll('.tiktok-account-card.selected').length === 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'tiktok_accounts.json'))).filter(a => a.selected).length, 0);
  let calls = 0, posting = false;
  await page.route('**/api/tiktok/warehouse/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ busy: posting, message: posting ? 'Đang đăng' : 'Sẵn sàng', logs: [], results: [{ status: 'processing' }] }) }));
  await page.route('**/api/tiktok/warehouse/distribute', async route => {
    calls++;
    assert.equal(route.request().postDataJSON().captionPrompt, 'Prompt QA content');
    posting = true;
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.locator('.tiktok-account-card').first().evaluate(el => el.classList.add('selected'));
  await page.locator('#warehouseFolderPath').fill(temp);
  await page.locator('#tiktokCaptionPrompt').fill('Prompt QA content');
  await page.locator('#warehouseDistributeBtn').evaluate(el => { el.click(); el.click(); });
  await page.waitForFunction(() => document.getElementById('directPostStatus').textContent === 'Đang đăng');
  assert.equal(calls, 1);
  assert.equal(await page.locator('#warehouseDistributeBtn').isDisabled(), true);
  for (const width of [375, 768, 1024, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    if (width >= 1440) assert.ok(await page.locator('.shell').evaluate(el => el.getBoundingClientRect().width > innerWidth - 40), 'Shell must expand with window');
    if (width >= 1200) assert.equal(await page.evaluate(() => document.querySelector('.view-tabs').getBoundingClientRect().right <= document.querySelector('.topbar').getBoundingClientRect().left), true, 'Sidebar overlap at ' + width);
    for (const view of ['publish', 'process', 'settings']) {
      await page.locator(`button[data-view="${view}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${view} overflow at ${width}`);
    }
    await page.locator('button[data-view="publish"]').click();
  }
  await page.screenshot({ path: path.join(output, 'studio-direct-1440.png'), fullPage: true });
  await page.route('**/api/tiktok/history', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, history: [{ id: 'history-qa', fileName: 'clip.mp4', accountName: 'QA', status: 'processing', postUrl: 'https://www.tiktok.com/@qa/video/123', publishedAt: new Date().toISOString() }] }) }));
  let refreshCalls = 0;
  await page.route('**/api/tiktok/history/refresh', route => { refreshCalls++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ok:true,updated:0,errors:[]}) }); });
  posting = false;
  await page.locator('#tiktokPublishCompleteModal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#tiktokCompleteModalSubtitle').innerText(), /1 TikTok đang xử lý/);
  await page.locator('#tiktokCompleteViewHistoryBtn').click();
  await page.locator('#tiktokHistoryModal').waitFor({ state: 'visible' });
  assert.match(await page.locator('#tiktokHistoryListContainer').innerText(), /TikTok đang xử lý/);
  assert.match(await page.locator('#tiktokViewHistoryBtn').innerText(), /\(1\)/);
  await page.locator('#refreshHistoryStatusBtn').click();
  await page.waitForFunction(() => document.getElementById('historyRefreshStatus').textContent.includes('Đã cập nhật'));
  assert.equal(refreshCalls, 1);
  await page.locator('.history-row-select').check();
  await page.locator('#deleteSelectedHistoryBtn').click();
  await page.locator('#selectedHistoryConfirm').waitFor({ state: 'visible' });
  await page.locator('#cancelSelectedHistoryBtn').click();
  assert.equal(await page.locator('#selectedHistoryConfirm').isVisible(), false);
  let deletedIds;
  await page.route('**/api/tiktok/history/delete-selected', route => {
    deletedIds = route.request().postDataJSON().ids;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, deleted: 1 }) });
  });
  await page.locator('#deleteSelectedHistoryBtn').click();
  await page.locator('#confirmSelectedHistoryBtn').click();
  await page.waitForFunction(() => document.getElementById('selectedHistoryCount')?.textContent === 'Đã chọn 0 bài');
  assert.deepEqual(deletedIds, ['history-qa']);
  // DOM adapter integration: no real TikTok account or publication is involved.
  const fixture = await browser.newPage();
  const videoId = String((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 123n);
  await fixture.setContent(`<table><tr><td><a href="https://www.tiktok.com/@studio_demo/video/${videoId}"><span class="caption" title="Nội dung đúng #tag">Nội dung đúng #tag</span></a></td><td>Everyone</td></tr></table><div><label>Who can watch this video</label><select><option value="private">Only me</option><option value="public">Everyone</option></select></div>`);
  await ensurePublic(fixture); assert.equal(await fixture.locator('select').inputValue(), 'public');
  const rows = await readStudioRows(fixture);
  const evidence = selectEvidence(rows, { caption: 'Nội dung đúng', hashtags: ['#tag'], accountUsername: '@studio_demo', baselineIds: [], submittedAt: new Date().toISOString() });
  assert.equal(evidence.status, 'success');
  await fixture.setContent('<div id="captcha">Verify</div>'); await assert.rejects(assertSession(fixture), /xác minh/);
  const migration = await page.evaluate(() => {
    localStorage.setItem(PROMPT_PRESETS_STORAGE_KEY, JSON.stringify({ viral_sales: LEGACY_PROMPT_PRESETS.viral_sales, custom: { id: 'custom', name: 'Mẫu riêng', prompt: 'Giọng văn của tôi' } }));
    const presets = getPromptPresets();
    return { migrated: presets.viral_sales.prompt === DEFAULT_PROMPT_PRESETS.viral_sales.prompt, custom: presets.custom.prompt };
  });
  assert.deepEqual(migration, { migrated: true, custom: 'Giọng văn của tôi' });
  await page.locator('#closeTikTokHistoryModalBtn').click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => showPublishCompleteModal({ results: [{ status: 'error', account: 'Kênh kiểm thử', video: 'video-ten-dai-de-kiem-tra-hien-thi-ro-rang.mp4', message: 'Không kết nối được Gemini. Kiểm tra kết nối hoặc API key rồi thử lại.' }] }));
    assert.equal(await page.locator('#tiktokCompleteTitle').innerText(), 'Chưa đăng được video');
    assert.match(await page.locator('#tiktokCompleteDetailsList').innerText(), /Không kết nối được Gemini/);
    const colors = await page.locator('.publish-result-heading strong').evaluate(el => ({ text: getComputedStyle(el).color, background: getComputedStyle(el.closest('article')).backgroundColor }));
    assert.notEqual(colors.text, colors.background);
    assert.equal(await page.locator('.publish-complete-card').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 28, 42)');
    await page.screenshot({ path: path.join(output, `result-error-${theme}.png`) });
    await page.setViewportSize({ width: 375, height: 800 });
    assert.equal(await page.locator('.publish-complete-card').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    await page.locator('#tiktokCompleteConfirmBtn').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => openTikTokHistoryModal(false));
    await page.locator('#selectAllHistory').check();
    await page.locator('#deleteSelectedHistoryBtn').click();
    await page.screenshot({ path: path.join(output, `history-selection-${theme}.png`) });
    await page.locator('#closeTikTokHistoryModalBtn').click();
  }
  await page.evaluate(() => showPublishCompleteModal({ results: [{ status: 'success', account: 'QA', video: 'clip.mp4' }, { status: 'processing', account: 'QA2', video: 'clip2.mp4' }] }));
  assert.equal(await page.locator('#tiktokCompleteStatChannels').innerText(), '1');
  assert.equal(await page.locator('#tiktokCompleteStatMode').innerText(), '1');
  assert.equal(await page.locator('#tiktokCompleteStatStatus').innerText(), '0');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'smoke-report.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), viewports: [375, 768, 1024, 1440, 1920, 2560], themes: ['dark', 'light'], checks: ['real API isolation', 'CSRF', 'invalid preview', 'stored recovery', 'XSS escaping', 'filters', 'processing form retained', 'all navigation tabs', 'DOM public verification', 'CAPTCHA detection'], errors }, null, 2));
  console.log(`PASS: API + UI + DOM smoke. Artifacts: ${output}`);
} finally {
  if (browser) await browser.close(); child.kill();
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  fs.rmSync(temp, { recursive: true, force: true });
}
