import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

export async function fullFingerprint(file) {
  const before = await fs.promises.stat(file);
  if (!before.isFile() || before.size === 0) throw new Error('Video rỗng hoặc không phải tệp.');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const after = await fs.promises.stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Video đang thay đổi. Chờ sao chép hoàn tất rồi thử lại.');
  return hash.digest('hex');
}

const completed = new Set(['success', 'cancelled']);
const uncertain = new Set(['submitting', 'submitted', 'verifying', 'needs_review', 'processing']);

// Persist before every external side effect. An ambiguous submit is never replayed.
export class PublishRuns {
  constructor({ directory, accounts, scan, preflight, metadata, upload, reconcile, history, record, validateVideo = async () => {}, delay = (ms) => new Promise(r => setTimeout(r, ms)) }) {
    Object.assign(this, { directory, accounts, scan, preflight, metadata, upload, reconcile, history, record, validateVideo, delay });
    this.busy = false;
    this.listeners = new Set();
    this.runs = [];
    const file = this.file();
    if (fs.existsSync(file)) {
      this.runs = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(this.runs)) throw new Error('Dữ liệu lượt đăng không hợp lệ. Hãy khôi phục bản sao lưu.');
      for (const run of this.externalBusy() ? [] : this.runs) {
        if (run.status === 'running' || run.status === 'preparing') run.status = 'paused';
        for (const item of run.items) {
          if (uncertain.has(item.status)) item.status = 'needs_review';
          else if (['uploading', 'preparing'].includes(item.status)) item.status = 'queued';
        }
      }
      if (!this.externalBusy()) this.persist();
    }
  }
  file() { return path.join(this.directory(), 'tiktok_publish_runs.json'); }
  lockFile() { return path.join(this.directory(), 'tiktok_publish.lock'); }
  externalBusy() {
    if (!fs.existsSync(this.lockFile())) return false;
    try {
      const { pid } = JSON.parse(fs.readFileSync(this.lockFile(), 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) return true;
      try { process.kill(pid, 0); return true; } catch (err) { return err.code !== 'ESRCH'; }
    } catch { return true; }
  }
  acquire() {
    this.assertIdle(); fs.mkdirSync(this.directory(), { recursive: true });
    if (fs.existsSync(this.lockFile())) { this.assertIdle(); fs.unlinkSync(this.lockFile()); }
    const fd = fs.openSync(this.lockFile(), 'wx');
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    this.busy = true;
    try {
      if (fs.existsSync(this.file())) {
        const raw = fs.readFileSync(this.file(), 'utf8');
        if (raw !== JSON.stringify(this.runs, null, 2)) this.runs = JSON.parse(raw);
      }
    } catch (err) { this.release(); throw err; }
  }
  release() { try { fs.unlinkSync(this.lockFile()); } finally { this.busy = false; } }
  persist() { atomicJson(this.file(), this.runs); }
  notify(run) { for (const fn of this.listeners) { try { fn(run); } catch {} } }
  event(item, message) {
    item.events ||= [];
    item.events.push({ at: new Date().toISOString(), message });
    if (item.events.length > 100) item.events.shift();
  }
  save(run) { run.updatedAt = new Date().toISOString(); this.persist(); this.notify(run); }
  list() { return this.runs.slice().reverse(); }
  get(id) { const run = this.runs.find(r => r.id === id); if (!run) throw new Error('Không tìm thấy lượt đăng.'); return run; }
  assertIdle() { if (this.busy || this.externalBusy()) throw new Error('Đang có lượt đăng hoặc kiểm tra chạy. Vui lòng chờ hoặc dừng sau kênh hiện tại.'); }
  reserved(hash) {
    return this.runs.some(r => r.items.some(i => i.sha256 === hash && !['cancelled', 'failed'].includes(i.status)));
  }
  async prepare(options) {
    this.acquire();
    try {
      const all = this.accounts();
      const ids = options.accountIds;
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Chọn ít nhất một kênh; danh sách không được trùng.');
      const accounts = ids.map(id => all.find(a => a.id === id));
      if (accounts.some(a => !a)) throw new Error('Có kênh không còn tồn tại. Làm mới danh sách kênh.');
      const scan = await this.scan(options.folderPath);
      if (!scan.ok) throw new Error(scan.message);
      const checks = (scan.errors || []).map(error => ({ status: 'warning', label: error.name, message: error.message }));
      const candidates = [...scan.freshVideos];
      for (let i = candidates.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
      const videos = [], seen = new Set();
      for (const video of candidates) {
        try {
          const sha256 = await fullFingerprint(video.path);
          if (seen.has(sha256) || this.reserved(sha256) || this.history().some(h => h.sha256 === sha256 && h.status === 'success')) continue;
          await this.validateVideo(video.path);
          seen.add(sha256); videos.push({ ...video, sha256 });
          if (videos.length === accounts.length) break;
        } catch (err) { checks.push({ status: 'warning', label: video.name, message: err.message }); }
      }
      checks.push({ status: videos.length >= accounts.length ? 'pass' : 'error', label: 'Kho video', message: `${videos.length}/${accounts.length} video riêng biệt sẵn sàng; các video đã đăng hoặc đang giữ chỗ được bỏ qua.` });
      for (const account of accounts) {
        try { await this.preflight(account); checks.push({ status: 'pass', label: account.name, message: 'Chrome và phiên TikTok Studio đã được kiểm tra trực tiếp.' }); }
        catch (err) { checks.push({ status: 'error', label: account.name, message: err.message }); }
      }
      if (checks.some(c => c.status === 'error')) return { ok: false, checks };
      const run = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'preview', channelDelaySeconds: Math.min(300, Math.max(2, Number(options.channelDelaySeconds) || 6)), checks, items: [] };
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i], video = videos[i];
        let meta;
        try { meta = options.metadata || await this.metadata(video, account, options); }
        catch (err) { return { ok: false, checks: [...checks, { status: 'error', label: 'Nội dung AI', message: err.message }] }; }
        if (typeof meta.caption !== 'string' || !meta.caption.trim() || !Array.isArray(meta.hashtags)) throw new Error('Nội dung bài đăng không hợp lệ.');
        if (meta.hashtags.some(t => typeof t !== 'string') || `${meta.caption} ${meta.hashtags.join(' ')}`.length > 2200) throw new Error('Caption và hashtag vượt 2.200 ký tự hoặc có hashtag không hợp lệ. Rút gọn prompt rồi thử lại.');
        run.items.push({ id: crypto.randomUUID(), accountId: account.id, accountName: account.name, accountUsername: account.username, videoPath: video.path, video: video.name, sha256: video.sha256, caption: meta.caption, hashtags: meta.hashtags, status: 'queued', attempts: 0 });
      }
      run.checks.push({ status: 'pass', label: 'Nội dung bài đăng', message: 'Đã tạo caption và hashtag cho từng video; xem trước bên dưới.' });
      this.runs.push(run); this.save(run);
      return { ok: true, run, checks: run.checks };
    } finally { this.release(); }
  }
  pause(id) {
    if (!this.busy) throw new Error('Lượt đăng không chạy trong cửa sổ máy chủ này.');
    const run = this.get(id);
    if (run.status !== 'running') throw new Error('Lượt đăng không chạy.');
    run.pauseRequested = true; this.save(run); return run;
  }
  cancel(id) {
    this.acquire();
    try {
      const run = this.get(id);
      for (const item of run.items) if (!uncertain.has(item.status) && item.status !== 'success') item.status = 'cancelled';
      run.status = run.items.some(i => uncertain.has(i.status)) ? 'attention' : 'cancelled';
      this.save(run); return run;
    } finally { this.release(); }
  }
  async start(id, { retry = false, reconcileOnly = false } = {}) {
    this.assertIdle();
    if (['completed', 'cancelled'].includes(this.get(id).status)) throw new Error('Lượt đăng đã kết thúc.');
    this.acquire(); const run = this.get(id);
    if (['completed', 'cancelled'].includes(run.status)) { this.release(); throw new Error('Lượt đăng đã kết thúc.'); }
    run.pauseRequested = false; run.status = 'running';
    try { this.save(run); } catch (err) { this.release(); throw err; }
    try {
      for (const item of run.items) {
        if (run.pauseRequested) break;
        if (completed.has(item.status)) continue;
        const review = uncertain.has(item.status);
        if (reconcileOnly && !review) continue;
        if (!review && ['failed', 'needs_action'].includes(item.status) && !retry) continue;
        const account = this.accounts().find(a => a.id === item.accountId);
        try {
          if (!account) throw new Error('Kênh đã bị xóa.');
          if (account.username !== item.accountUsername) throw new Error('Username của kênh đã thay đổi sau bản xem trước. Hãy kiểm tra và lập lượt mới.');
          if (review) {
            const result = await this.reconcile(account, item);
            if (result.status === 'success') this.succeed(run, item, account, result);
            else { item.status = result.status || 'needs_review'; item.error = result.message || 'Chưa đủ bằng chứng. Chỉ đối soát, không đăng lại.'; this.save(run); }
            continue;
          }
          if (await fullFingerprint(item.videoPath) !== item.sha256) throw new Error('Video đã thay đổi sau khi xem trước. Hủy lượt và lập lượt mới.');
          if (this.history().some(h => h.sha256 === item.sha256 && h.status === 'success')) throw new Error('Video đã được đăng ở lượt khác.');
          await this.preflight(account);
          item.status = 'uploading'; item.error = ''; item.attempts += 1; this.save(run);
          const result = await this.upload({ account, ...item, log: message => { item.message = message; this.event(item, message); this.save(run); }, onStage: (stage, data = {}) => {
            Object.assign(item, data, { status: stage }); this.event(item, stage); this.save(run);
          } });
          if (result.status === 'success') this.succeed(run, item, account, result);
          else { item.status = result.status || 'needs_review'; item.error = result.message; this.save(run); }
        } catch (err) {
          item.status = review || uncertain.has(item.status) ? 'needs_review' : err.code === 'NEEDS_ACTION' ? 'needs_action' : 'failed';
          item.error = err.message; this.event(item, err.message); this.save(run);
          if (item.status === 'needs_action') run.pauseRequested = true;
        }
        if (!run.pauseRequested) await this.delay(run.channelDelaySeconds * 1000);
      }
      run.status = run.items.every(i => completed.has(i.status)) ? 'completed' : run.pauseRequested ? 'paused' : 'attention';
      this.save(run); return run;
    } catch (err) {
      run.status = 'paused';
      try { this.save(run); } catch {}
      throw err;
    } finally { this.release(); }
  }
  succeed(run, item, account, result) {
    // A record failure must leave the item ambiguous, never eligible for upload.
    item.status = 'verifying'; this.save(run);
    this.record({ ...item, account, ...result, postMode: 'public', status: 'success' });
    Object.assign(item, result, { status: 'success', error: '', confirmedAt: new Date().toISOString() }); this.save(run);
  }
}
