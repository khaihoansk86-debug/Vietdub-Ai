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
  assert.match(publisher.state.message, /Không còn video/);
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
