import { findSimilarCaption } from '../services/captionDiversity.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectPublisher } from '../services/directPublisher.js';

function setup(videos = [{ name: 'clip.mp4', path: '/clip' }]) {
  const calls = [];
  const publisher = new DirectPublisher({
    accounts: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    acquire: () => calls.push('lock'), release: () => calls.push('unlock'),
    scan: async () => ({ ok: true, freshVideos: videos }), hash: async v => v,
    metadata: async (v, a, opts) => { calls.push(opts.captionPrompt); return { caption: 'AI content', hashtags: ['#test'] }; },
    upload: async options => { calls.push(options.caption); return { status: 'success' }; },
    record: () => calls.push('history'), delay: async () => {}
  });
  return { publisher, calls };
}
test('direct publish runs AI/upload/history without preview or reservations; partial stock still posts', async () => {
  const { publisher, calls } = setup();
  publisher.start({ accountIds: ['a', 'b'], captionPrompt: 'User prompt' });
  assert.throws(() => publisher.start({ accountIds: ['a'] }), /đang đăng/);
  await publisher.task;
  assert.deepEqual(calls, ['lock', 'User prompt', 'AI content', 'history', 'unlock']);
  assert.equal(publisher.state.busy, false);
  assert.match(publisher.state.message, /1 kênh chưa có clip/);
});
test('empty stock releases lock without uploading', async () => {
  const { publisher, calls } = setup([]);
  publisher.start({ accountIds: ['a'] }); await publisher.task;
  assert.deepEqual(calls, ['lock', 'unlock']);
});
test('ambiguous submission is not marked successful or retried within a click', async () => {
  const { publisher, calls } = setup();
  publisher.deps.upload = async () => ({ status: 'needs_review' });
  publisher.start({ accountIds: ['a'], captionPrompt: 'prompt' }); await publisher.task;
  assert.equal(calls.includes('history'), false);
  assert.equal(publisher.state.results[0].status, 'needs_review');
});
test('a matched post awaiting TikTok processing is saved to history immediately', async () => {
  const { publisher, calls } = setup();
  publisher.deps.upload = async () => ({ status: 'processing', postId: '123', postUrl: 'https://www.tiktok.com/@a/video/123' });
  publisher.start({ accountIds: ['a'], captionPrompt: 'prompt' }); await publisher.task;
  assert.equal(calls.includes('history'), true);
  assert.equal(publisher.state.results[0].status, 'processing');
});
test('network failure retries only before Post; after Post it stays in history without retry', async () => {
  for (const afterPost of [false, true]) {
    const { publisher, calls } = setup(); let attempts = 0;
    publisher.deps.upload = async options => {
      attempts++;
      if (afterPost) options.onStage('submitting');
      if (attempts === 1) throw new Error('network timeout');
      return { status: 'success' };
    };
    publisher.start({ accountIds: ['a'], captionPrompt: 'prompt' }); await publisher.task;
    assert.equal(attempts, afterPost ? 1 : 2);
    assert.equal(calls.includes('history'), true);
  }
});
test('processing post is upgraded after checking its ID, without uploading twice', async () => {
  const { publisher } = setup(); let uploads = 0, finalStatus;
  publisher.deps.upload = async () => { uploads++; return { status: 'processing', postId: '123', postUrl: 'https://www.tiktok.com/@a/video/123' }; };
  publisher.deps.reconcile = async (account, result) => ({ ...result, status: 'success' });
  publisher.deps.record = item => { finalStatus = item.status; };
  publisher.start({ accountIds: ['a'], captionPrompt: 'prompt' }); await publisher.task;
  assert.equal(uploads, 1); assert.equal(finalStatus, 'success');
});
test('24 channels each receive one unique clip', async () => {
  const { publisher } = setup(Array.from({ length: 24 }, (_, i) => ({ name: `${i}.mp4`, path: `/${i}` })));
  publisher.deps.accounts = () => Array.from({ length: 24 }, (_, i) => ({ id: `${i}`, name: `Kênh ${i}` }));
  publisher.deps.metadata = async (_video, account) => ({ caption: `Nội dung ${account.id}`, hashtags: [] });
  publisher.start({ accountIds: publisher.deps.accounts().map(a => a.id), captionPrompt: 'prompt' }); await publisher.task;
  assert.equal(publisher.state.results.length, 24);
  assert.ok(publisher.state.results.every(r => r.status === 'success'));
  assert.equal(new Set(publisher.state.results.map(r => r.video)).size, 24);
});
test('upload result account display name cannot overwrite the account identity in history', async () => {
  const { publisher } = setup(); let saved;
  publisher.deps.upload = async () => ({ status: 'success', account: 'Display name' });
  publisher.deps.record = entry => { saved = entry; };
  publisher.start({ accountIds: ['a'] }); await publisher.task;
  assert.equal(saved.account.id, 'a');
});


test('caption API failure stays unsent and includes the actionable error in popup results', async () => {
  const { publisher, calls } = setup();
  publisher.deps.metadata = async () => { throw new Error('Gemini hết quota. Kiểm tra API key.'); };
  publisher.start({ accountIds: ['a'] });
  await publisher.task;
  assert.equal(publisher.state.results[0].status, 'error');
  assert.match(publisher.state.results[0].message, /Gemini hết quota/);
  assert.equal(calls.includes('history'), false);
});


test('near-duplicate captions ignore punctuation and tags, catch reused openings, allow different expressions', () => {
  const original = 'Góc chia sẻ nội dung hôm nay. Cảm ơn bạn đã dành thời gian theo dõi.';
  assert.ok(findSimilarCaption('GÓC CHIA SẺ NỘI DUNG HÔM NAY! Cảm ơn bạn đã dành thời gian theo dõi #moi', [original]));
  assert.ok(findSimilarCaption('Góc chia sẻ nội dung hôm nay. Hy vọng mang đến giây phút vui vẻ.', [original]));
  assert.equal(findSimilarCaption('Đôi khi một khoảng nghỉ ngắn giúp ta tìm lại sự tập trung.', [original]), null);
});

test('duplicate across history and channels is rewritten before upload with prompt unchanged', async () => {
  const { publisher } = setup([{ name: 'a.mp4', path: '/a' }, { name: 'b.mp4', path: '/b' }]);
  const old = 'Góc chia sẻ nội dung hôm nay. Cảm ơn bạn đã dành thời gian theo dõi.';
  const unique = ['Một khoảng nghỉ yên tĩnh giúp ngày dài dễ chịu hơn.', 'Hãy dành chút thời gian cho điều nhỏ bé khiến bạn vui.'];
  publisher.deps.history = () => [{ caption: old }];
  let attempt = 0;
  const uploads = [], requests = [];
  publisher.deps.metadata = async (_v, _a, options) => { requests.push(options); return { caption: attempt++ < 1 ? old : unique.shift(), hashtags: [] }; };
  publisher.deps.upload = async options => { uploads.push(options.caption); return { status: 'success' }; };
  publisher.start({ accountIds: ['a', 'b'], captionPrompt: 'Chia sẻ nhẹ nhàng' });
  await publisher.task;
  assert.equal(uploads.length, 2);
  assert.equal(new Set(uploads).size, 2);
  assert.ok(!uploads.includes(old));
  assert.ok(requests.every(r => r.captionPrompt === 'Chia sẻ nhẹ nhàng'));
  assert.ok(requests[2].avoidCaptions.includes(uploads[0]));
});

test('persistent duplicate never uploads or records a new post', async () => {
  const { publisher, calls } = setup(); let attempts = 0;
  publisher.deps.history = () => [{ caption: 'AI content' }];
  publisher.deps.metadata = async () => { attempts++; return { caption: 'AI content!', hashtags: [] }; };
  publisher.start({ accountIds: ['a'] }); await publisher.task;
  assert.equal(attempts, 4);
  assert.equal(publisher.state.results[0].status, 'error');
  assert.match(publisher.state.results[0].message, /gần trùng/);
  assert.equal(calls.includes('history'), false);
});
