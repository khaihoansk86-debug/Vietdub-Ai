import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vietdub-packaged-smoke-'));
let app;
try {
  app = await electron.launch({ executablePath: path.join(root, 'dist', 'win-unpacked', 'VietDub AI.exe'), args: [`--user-data-dir=${temp}`], env: { ...process.env, VIETDUB_SKIP_KOKORO_AUTOSTART: '1', PORT: '3298' }, timeout: 30000 });
  const info = await app.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath('userData'), packaged: app.isPackaged }));
  assert.equal(path.resolve(info.userData), path.resolve(temp), 'Smoke must use an isolated profile');
  assert.equal(info.version, '2.1.2'); assert.equal(info.packaged, true);
  const window = await app.firstWindow(); await window.waitForSelector('#pubRunState');
  await window.waitForFunction(() => document.querySelector('#pubRunState').textContent === 'Chưa có lượt đăng');
  assert.equal(await window.locator('#viewPublish').isVisible(), true);
  assert.equal(await window.locator('#pubStart').isDisabled(), true);
  await window.screenshot({ path: path.join(root, 'dist', 'qa', 'packaged-windows.png') });
  fs.writeFileSync(path.join(root, 'dist', 'qa', 'packaged-report.json'), JSON.stringify({ ok: true, ...info, date: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ok: true, ...info }));
} finally {
  if (app) await app.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
