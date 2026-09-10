import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PublishRuns, fullFingerprint } from '../services/publishRuns.js';
import { selectEvidence } from '../services/tiktokVerification.js';

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vietdub-publish-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const accounts = [{ id: 'a', name: 'Kênh A', username: '@kenha' }, { id: 'b', name: 'Kênh B', username: '@kenhb' }];
  const videos = ['one.mp4', 'two.mp4', 'three.mp4'].map((name, index) => {
    const file = path.join(directory, name); fs.writeFileSync(file, Buffer.alloc(200000, index + 1));
    return { name, path: file };
  });
  const history = [], uploaded = [];
  const deps = { directory: () => directory, accounts: () => accounts,
    scan: async () => ({ ok: true, freshVideos: videos }), preflight: async () => {},
    metadata: async () => ({ caption: 'Nội dung video Việt Nam', hashtags: ['#vietdub'] }),
    upload: async item => { uploaded.push(item.id); item.onStage('submitting', { submittedAt: new Date().toISOString(), baselineIds: [] }); return { status: 'success', postId: item.id, postUrl: 'https://www.tiktok.com/@kenha/video/123' }; },
    reconcile: async () => ({ status: 'needs_review' }), history: () => history, record: item => history.push(item), delay: async () => {}, ...overrides };
  return { service: new PublishRuns(deps), deps, accounts, videos, history, uploaded, directory, options: { folderPath: directory, accountIds: ['a', 'b'], geminiApiKey: 'test-secret-not-persisted' } };
}

test('1:1 preview hashes entire files, preserves originals, does not publish or persist secrets', async t => {
  const f = fixture(t); const before = await Promise.all(f.videos.map(v => fullFingerprint(v.path)));
  const { run, ok } = await f.service.prepare(f.options);
  assert.equal(ok, true); assert.equal(run.items.length, 2); assert.equal(new Set(run.items.map(i => i.sha256)).size, 2);
  assert.deepEqual(run.items.map(i => i.accountId), ['a', 'b']); assert.equal(f.uploaded.length, 0);
  assert.equal(fs.readFileSync(f.service.file(), 'utf8').includes('test-secret'), false);
  assert.deepEqual(await Promise.all(f.videos.map(v => fullFingerprint(v.path))), before);
});
test('duplicate renamed files cannot fill two channel slots', async t => {
  const f = fixture(t); fs.copyFileSync(f.videos[0].path, f.videos[1].path); fs.copyFileSync(f.videos[0].path, f.videos[2].path);
  const result = await f.service.prepare(f.options); assert.equal(result.ok, false); assert.equal(f.uploaded.length, 0);
});
test('full hash detects a changed middle despite identical header, footer and size', async t => {
  const f = fixture(t); const before = await fullFingerprint(f.videos[0].path);
  const fd = fs.openSync(f.videos[0].path, 'r+'); fs.writeSync(fd, Buffer.from([9]), 0, 1, 100000); fs.closeSync(fd);
  assert.notEqual(await fullFingerprint(f.videos[0].path), before);
});
test('preflight failure and metadata failure never create a runnable plan', async t => {
  const f = fixture(t, { preflight: async () => { throw new Error('Hết phiên'); } });
  assert.equal((await f.service.prepare(f.options)).ok, false); assert.equal(f.service.list().length, 0);
  f.service.preflight = async () => {}; f.service.metadata = async () => { throw new Error('Quota'); };
  assert.equal((await f.service.prepare(f.options)).ok, false); assert.equal(f.service.list().length, 0);
});
test('concurrent preparation rejected and preview reservations stop duplicate plans', async t => {
  const f = fixture(t); const first = f.service.prepare(f.options);
  await assert.rejects(f.service.prepare(f.options), /Đang có/);
  await first; assert.equal((await f.service.prepare(f.options)).ok, false);
});
test('pause finishes active channel and resume never repeats confirmed items', async t => {
  const f = fixture(t); const { run } = await f.service.prepare(f.options);
  const upload = f.service.upload;
  f.service.upload = async item => { f.service.pause(run.id); return upload(item); };
  await f.service.start(run.id); assert.equal(run.status, 'paused'); assert.equal(f.uploaded.length, 1);
  f.service.upload = upload; await f.service.start(run.id); assert.equal(f.uploaded.length, 2); assert.equal(run.status, 'completed');
  await assert.rejects(f.service.start(run.id), /kết thúc/);
});
test('submit timeout survives restart, retry reconciles without uploading', async t => {
  const f = fixture(t, { upload: async item => { item.onStage('submitting', { submittedAt: new Date().toISOString(), baselineIds: [] }); throw new Error('Mất mạng sau click'); } });
  const { run } = await f.service.prepare({ ...f.options, accountIds: ['a'] });
  await f.service.start(run.id); assert.equal(run.items[0].status, 'needs_review');
  const restored = new PublishRuns({ ...f.deps, upload: async () => { assert.fail('Must not upload an ambiguous item'); } });
  await restored.start(run.id, { retry: true }); assert.equal(restored.get(run.id).items[0].status, 'needs_review');
});
test('crash during submission restores an item for reconciliation, crash during upload remains safe to retry', async t => {
  const f = fixture(t); const { run } = await f.service.prepare(f.options);
  run.status = 'running'; run.items[0].status = 'submitting'; run.items[1].status = 'uploading'; f.service.save(run);
  const restored = new PublishRuns(f.deps); const state = restored.get(run.id);
  assert.equal(state.status, 'paused'); assert.equal(state.items[0].status, 'needs_review'); assert.equal(state.items[1].status, 'queued');
});
test('explicit retry only replays failures before submit, CAPTCHA pauses other channels', async t => {
  const f = fixture(t); const { run } = await f.service.prepare(f.options); const upload = f.service.upload;
  f.service.upload = async () => { throw Object.assign(new Error('CAPTCHA'), { code: 'NEEDS_ACTION' }); };
  await f.service.start(run.id); assert.equal(run.status, 'paused'); assert.equal(run.items[0].status, 'needs_action'); assert.equal(run.items[1].status, 'queued');
  f.service.upload = upload; await f.service.start(run.id, { retry: true }); assert.equal(run.status, 'completed'); assert.equal(f.uploaded.length, 2);
});
test('changed source is blocked before upload', async t => {
  const f = fixture(t); const { run } = await f.service.prepare({ ...f.options, accountIds: ['a'] });
  fs.appendFileSync(run.items[0].videoPath, 'changed'); await f.service.start(run.id);
  assert.equal(run.items[0].status, 'failed'); assert.equal(f.uploaded.length, 0);
});
test('history write failure keeps successful external post ambiguous', async t => {
  const f = fixture(t, { record: () => { throw new Error('Disk full'); } }); const { run } = await f.service.prepare({ ...f.options, accountIds: ['a'] });
  await f.service.start(run.id); assert.equal(run.items[0].status, 'needs_review'); assert.equal(f.uploaded.length, 1);
  await f.service.start(run.id, { retry: true }); assert.equal(f.uploaded.length, 1);
});
test('cancel releases unsent reservations but keeps ambiguous submissions reserved', async t => {
  const f = fixture(t); const { run } = await f.service.prepare(f.options);
  run.items[0].status = 'needs_review'; f.service.save(run); f.service.cancel(run.id);
  assert.equal(f.service.reserved(run.items[0].sha256), true); assert.equal(f.service.reserved(run.items[1].sha256), false);
});
test('corrupt journal fails closed', t => {
  const f = fixture(t); fs.writeFileSync(f.service.file(), '{broken'); assert.throws(() => new PublishRuns(f.deps));
});
test('a second service cannot prepare while the shared data directory is locked', async t => {
  const f = fixture(t);
  let release;
  f.service.preflight = () => new Promise(resolve => { release = resolve; });
  const pending = f.service.prepare({ ...f.options, accountIds: ['a'] });
  while (!release) await new Promise(r => setTimeout(r, 1));
  const second = new PublishRuns(f.deps);
  await assert.rejects(second.prepare(f.options), /Đang có/);
  release(); await pending;
});
test('history with full hashes does not confuse files with identical names or sampled hashes', async t => {
  const f = fixture(t);
  const previous = process.env.VIETDUB_DATA_DIR; process.env.VIETDUB_DATA_DIR = f.directory;
  try {
    const { isAlreadyPublished, computeVideoFingerprint, scanWarehouseVideos } = await import('../services/tiktokPublisher.js');
    const file = f.videos[0].path;
    const sampled = computeVideoFingerprint(file);
    fs.writeFileSync(path.join(f.directory, 'tiktok_publish_history.json'), JSON.stringify([{ fileName: path.basename(file), fileHash: sampled, sha256: await fullFingerprint(file), status: 'success' }]));
    assert.equal((await isAlreadyPublished({ videoPath: file })).published, true);
    const fd = fs.openSync(file, 'r+'); fs.writeSync(fd, Buffer.from([9]), 0, 1, 100000); fs.closeSync(fd);
    assert.equal(computeVideoFingerprint(file), sampled);
    assert.equal((await isAlreadyPublished({ videoPath: file })).published, false);
    assert.equal((await scanWarehouseVideos(f.directory)).freshCount, 3);
  } finally { if (previous === undefined) delete process.env.VIETDUB_DATA_DIR; else process.env.VIETDUB_DATA_DIR = previous; }
});

const expected = { caption: 'Nội dung video Việt Nam', hashtags: ['#vietdub'], accountUsername: '@kenha', baselineIds: ['100'], submittedAt: new Date().toISOString() };
const newId = String((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 123n);
const good = { id: newId, username: 'kenha', caption: 'Nội dung video Việt Nam #vietdub', visibility: 'public', url: `https://www.tiktok.com/@kenha/video/${newId}`, processing: false };
test('confirmation requires exact caption, account, new post ID and explicit public visibility', () => {
  assert.equal(selectEvidence([good], expected).status, 'success');
  for (const row of [{ ...good, id: '100' }, { ...good, username: 'other' }, { ...good, caption: 'old video' }, { ...good, visibility: 'private' }, { ...good, visibility: 'unknown' }]) assert.notEqual(selectEvidence([row], expected).status, 'success');
  assert.equal(selectEvidence([{ ...good, processing: true }], expected).status, 'processing');
  assert.equal(selectEvidence([good, { ...good, id: String(BigInt(newId) + 1n) }], expected).status, 'needs_review');
  assert.equal(selectEvidence([good], { ...expected, baselineIds: undefined }).status, 'needs_review');
});

test('processing history excludes clip from fresh stock and upgrades without duplication', async t => {
  const f = fixture(t);
  const previous = process.env.VIETDUB_DATA_DIR; process.env.VIETDUB_DATA_DIR = f.directory;
  try {
    const { recordPublishedVideo, loadPublishHistory, isAlreadyPublished } = await import('../services/tiktokPublisher.js');
    const item = { videoPath: f.videos[0].path, account: { id: 'a', name: 'A' }, sha256: await fullFingerprint(f.videos[0].path), postId: '123', postUrl: 'https://www.tiktok.com/@a/video/123' };
    recordPublishedVideo({ ...item, postId: '', postUrl: '', status: 'needs_review' });
    assert.equal((await isAlreadyPublished({ videoPath: item.videoPath })).published, true);
    recordPublishedVideo({ ...item, status: 'processing' });
    assert.equal(loadPublishHistory().length, 1);
    assert.equal((await isAlreadyPublished({ videoPath: item.videoPath })).published, true);
    recordPublishedVideo({ ...item, status: 'success' });
    assert.equal(loadPublishHistory().length, 1);
    assert.equal(loadPublishHistory()[0].status, 'success');
  } finally { if (previous === undefined) delete process.env.VIETDUB_DATA_DIR; else process.env.VIETDUB_DATA_DIR = previous; }
});


test('selected history deletion preserves other records and source; unlocks selected clip for rescan', async t => {
  const f = fixture(t), previous = process.env.VIETDUB_DATA_DIR;
  process.env.VIETDUB_DATA_DIR = f.directory;
  try {
    const api = await import('../services/tiktokPublisher.js');
    const hashes = await Promise.all(f.videos.map(v => fullFingerprint(v.path)));
    const entries = hashes.slice(0, 2).map((sha256, i) => ({ id: `h${i}`, sha256, fileName: f.videos[i].name, status: 'needs_review' }));
    fs.writeFileSync(path.join(f.directory, 'tiktok_publish_history.json'), JSON.stringify(entries));
    assert.equal((await api.isAlreadyPublished({ videoPath: f.videos[0].path })).published, true);
    assert.throws(() => api.deleteSelectedHistory([]));
    const lock = api.getPublishRuns(); lock.acquire();
    try { assert.throws(() => api.deleteSelectedHistory(['h0'])); } finally { lock.release(); }
    assert.equal(api.deleteSelectedHistory(['h0', 'h0']).deleted, 1);
    assert.deepEqual(api.getPublishHistory(), [entries[1]]);
    assert.equal((await api.isAlreadyPublished({ videoPath: f.videos[0].path })).published, false);
    assert.equal((await api.isAlreadyPublished({ videoPath: f.videos[1].path })).published, true);
    assert.deepEqual(await Promise.all(f.videos.map(v => fullFingerprint(v.path))), hashes);
  } finally { if (previous === undefined) delete process.env.VIETDUB_DATA_DIR; else process.env.VIETDUB_DATA_DIR = previous; }
});

test('caption uses prompt without transcript, accepts legacy context flag with valid text and reports API failures', async () => {
  const { generateTikTokMetadata } = await import('../services/tiktokPublisher.js');
  const originalFetch = globalThis.fetch;
  let calls = 0, body;
  const opts = { geminiApiKey: 'test', captionPrompt: 'Bịa công dụng chữa khỏi và thêm #fyp' };
  try {
    globalThis.fetch = async (_url, request) => { calls++; body = JSON.parse(request.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ hook: '', caption: 'Cách tưới cây trong vườn.', hashtags: ['#cay', '#cay', 'bad tag'], needsContext: false }) }] } }] }) }; };
    const result = await generateTikTokMetadata([{ text: 'Tưới cây vào buổi sáng.' }], 'Chăm sóc vườn', opts);
    assert.deepEqual(result.hashtags, ['#cay']);
    assert.match(body.contents[0].parts[0].text, /Không bịa/);
    assert.equal(body.generationConfig.temperature, 0.7);
    assert.match(body.contents[0].parts[0].text, /Không từ chối chỉ vì thiếu phụ đề/);
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"needsContext":true,"caption":"Một góc nhìn nhẹ nhàng cho hôm nay.","hashtags":[]}' }] } }] }) }; };
    calls = 0;
    const neutral = await generateTikTokMetadata([], 'clip', { ...opts, captionPrompt: 'Viết lời chia sẻ nhẹ nhàng' });
    assert.match(neutral.caption, /góc nhìn/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(generateTikTokMetadata([], 'Chăm sóc vườn', opts), /Không tạo được caption/);
  } finally { globalThis.fetch = originalFetch; }
});


test('channel identity never changes the caption request; user prompt controls topic', async () => {
  const { generateTikTokMetadata } = await import('../services/tiktokPublisher.js');
  const oldFetch = globalThis.fetch, requests = [];
  try {
    globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: 'Một ngày vui cùng thú cưng.', hashtags: [] }) }] } }] }) }; };
    for (const accountName of ['Kênh giải trí', 'Khải Hoàn Pharma']) await generateTikTokMetadata([], 'clip', { geminiApiKey: 'test', captionPrompt: 'Viết về niềm vui cùng thú cưng', accountName, accountUsername: '@pharma' }, () => {});
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(JSON.stringify(requests).includes('Pharma'), false);
    assert.equal(JSON.stringify(requests).includes('@pharma'), false);
    assert.match(requests[0].contents[0].parts[0].text, /Prompt người dùng quyết định chủ đề/);
  } finally { globalThis.fetch = oldFetch; }
});
