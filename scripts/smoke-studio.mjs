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
  await page.goto(origin); await page.waitForSelector('#pubRows .run-badge');
  assert.equal(await page.locator('#pubTotal').textContent(), '2');
  assert.equal(await page.locator('#pubAttention').textContent(), '1');
  assert.equal(await page.locator('#viewPublish').isVisible(), true);
  await page.locator('#pubRows details').first().locator('summary').click();
  assert.equal(await page.locator('#pubRows img').count(), 0);
  assert.ok((await page.locator('#pubRows .caption-copy').first().textContent()).includes('<img'));
  await page.locator('#pubFilter').selectOption('attention'); assert.equal(await page.locator('#pubRows tr').count(), 1);
  await page.locator('#pubFilter').selectOption('all');
  const beforeForm = await page.evaluate(() => [...new FormData(document.getElementById('jobForm')).keys()]);
  assert.ok(beforeForm.includes('ttsProvider'));
  assert.equal(await page.locator('#tiktokAutoUpload').evaluate(el => el.form.id), 'jobForm');
  await page.locator('button[data-view="process"]').click(); assert.equal(await page.locator('#viewProcess').isVisible(), true);
  await page.locator('button[data-view="settings"]').click(); assert.equal(await page.locator('#geminiApiKey').isVisible(), true);
  await page.locator('button[data-view="publish"]').click();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await page.screenshot({ path: path.join(output, `studio-${theme}-1440.png`), fullPage: true });
  }
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.run-table-wrap'); }).slice(0, 20).map(el => ({ tag: el.tagName, id: el.id, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right }))));
    assert.equal(overflow, false, `Page overflow at ${width}`);
    for (const view of ['publish', 'process', 'settings']) {
      await page.locator(`button[data-view="${view}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${view} overflow at ${width}`);
    }
    await page.locator('button[data-view="publish"]').click();
    if (width === 375) await page.screenshot({ path: path.join(output, 'studio-mobile-375.png'), fullPage: true });
  }
  // DOM adapter integration: no real TikTok account or publication is involved.
  const fixture = await browser.newPage();
  const videoId = String((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 123n);
  await fixture.setContent(`<table><tr><td><a href="https://www.tiktok.com/@studio_demo/video/${videoId}"><span class="caption" title="Nội dung đúng #tag">Nội dung đúng #tag</span></a></td><td>Everyone</td></tr></table><div><label>Who can watch this video</label><select><option value="private">Only me</option><option value="public">Everyone</option></select></div>`);
  await ensurePublic(fixture); assert.equal(await fixture.locator('select').inputValue(), 'public');
  const rows = await readStudioRows(fixture);
  const evidence = selectEvidence(rows, { caption: 'Nội dung đúng', hashtags: ['#tag'], accountUsername: '@studio_demo', baselineIds: [], submittedAt: new Date().toISOString() });
  assert.equal(evidence.status, 'success');
  await fixture.setContent('<div id="captcha">Verify</div>'); await assert.rejects(assertSession(fixture), /xác minh/);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'smoke-report.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), viewports: [375, 768, 1024, 1440], themes: ['dark', 'light'], checks: ['real API isolation', 'CSRF', 'invalid preview', 'stored recovery', 'XSS escaping', 'filters', 'processing form retained', 'all navigation tabs', 'DOM public verification', 'CAPTCHA detection'], errors }, null, 2));
  console.log(`PASS: API + UI + DOM smoke. Artifacts: ${output}`);
} finally {
  if (browser) await browser.close(); child.kill();
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  fs.rmSync(temp, { recursive: true, force: true });
}
