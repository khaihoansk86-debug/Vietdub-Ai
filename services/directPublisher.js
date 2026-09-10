export class DirectPublisher {
  constructor(deps) { this.deps = deps; this.state = { busy: false, message: 'Sẵn sàng đăng video.', logs: [], results: [] }; }
  log(message) {
    this.state.message = message;
    this.state.logs.push(message);
    if (this.state.logs.length > 100) this.state.logs.shift();
  }
  start(options) {
    if (this.state.busy) throw new Error('Tool đang đăng video. Chờ hoàn tất rồi đăng tiếp.');
    const ids = options.accountIds;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Chọn ít nhất một kênh TikTok.');
    const accounts = ids.map(id => this.deps.accounts().find(a => a.id === id));
    if (accounts.some(a => !a)) throw new Error('Kênh không còn tồn tại. Làm mới danh sách.');
    this.deps.acquire();
    this.state = { busy: true, message: 'Đang chọn video…', logs: [], results: [] };
    this.task = this.execute(options, accounts).catch(error => this.log(error.message)).finally(() => {
      try { this.deps.release(); } finally { this.state.busy = false; }
    });
    return this.state;
  }
  async execute(options, accounts) {
    const scan = await this.deps.scan(options.folderPath);
    if (!scan.ok) throw new Error(scan.message);
    const candidates = [...scan.freshVideos];
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const seen = new Set();
    let index = 0;
    for (const account of accounts) {
      let video, sha256;
      while (candidates.length) {
        const candidate = candidates.shift();
        const hash = await this.deps.hash(candidate.path);
        if (seen.has(hash)) continue;
        seen.add(hash); video = candidate; sha256 = hash; break;
      }
      if (!video) { this.log(`Không còn video mới cho ${account.name}. Thêm clip vào kho để đăng tiếp.`); break; }
      try {
        this.log(`${account.name}: AI đang viết content theo prompt…`);
        const meta = await this.deps.metadata(video, account, options);
        if (!meta.caption?.trim() || !Array.isArray(meta.hashtags)) throw new Error('AI chưa tạo được nội dung hợp lệ.');
        this.log(`${account.name}: đang upload và đăng ${video.name}…`);
        const result = await this.deps.upload({ account, videoPath: video.path, ...meta, log: message => this.log(message) });
        if (result.status === 'success' || result.status === 'processing' && result.postId && result.postUrl) this.deps.record({ account, videoPath: video.path, ...meta, ...result, sha256 });
        this.state.results.push({ account: account.name, video: video.name, status: result.status, postUrl: result.postUrl });
        this.log(`${account.name}: ${result.status === 'success' ? 'Đã đăng công khai.' : result.message || 'Đã gửi, chưa xác nhận công khai. Kiểm tra TikTok Studio.'}`);
      } catch (error) { this.log(`${account.name}: ${error.message}`); this.state.results.push({ account: account.name, video: video.name, status: 'error' }); }
      if (++index < accounts.length && candidates.length) await this.deps.delay(Math.min(300, Math.max(0, Number(options.channelDelaySeconds) || 0)) * 1000);
    }
  }
}
