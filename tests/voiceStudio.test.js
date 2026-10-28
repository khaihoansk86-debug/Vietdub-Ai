import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  listVoiceProfiles,
  saveVoiceProfiles,
  getVoiceProfile,
  createVoiceProfile,
  deleteVoiceProfile,
  checkVoiceStudioEngineStatus,
  getVoiceStudioOutputDir,
  synthesizeVoiceStudioAudio,
  exportVoiceStudioAudio
} from '../services/voiceStudioService.js';

test('Voice Studio - profile management CRUD', async (t) => {
  const initialProfiles = listVoiceProfiles();
  assert.ok(Array.isArray(initialProfiles));

  // Test creating a dummy sample audio file
  const tempAudio = path.join(os.tmpdir(), `test_sample_${Date.now()}.wav`);
  // Minimal valid 44-byte WAV header
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // mono
  wavHeader.writeUInt32LE(24000, 24); // sample rate
  wavHeader.writeUInt32LE(48000, 28); // byte rate
  wavHeader.writeUInt16LE(2, 32); // block align
  wavHeader.writeUInt16LE(16, 34); // bits per sample
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(0, 40);
  fs.writeFileSync(tempAudio, wavHeader);

  try {
    const created = await createVoiceProfile({
      name: 'Giọng Test Unit',
      description: 'Giọng mô phỏng kiểm thử',
      prompt: 'Trầm ấm, nói nhanh',
      tags: ['Test', 'Review'],
      sourceAudioPath: tempAudio
    });

    assert.ok(created.id.startsWith('vp_'));
    assert.equal(created.name, 'Giọng Test Unit');
    assert.ok(created.tags.includes('Test'));

    const fetched = getVoiceProfile(created.id);
    assert.ok(fetched);
    assert.equal(fetched.id, created.id);

    // Test delete
    const delRes = await deleteVoiceProfile(created.id);
    assert.ok(delRes.ok);

    const afterDel = getVoiceProfile(created.id);
    assert.equal(afterDel, null);
  } finally {
    try { fs.unlinkSync(tempAudio); } catch {}
  }
});

test('Voice Studio - engine status check returns status object', async () => {
  const res = await checkVoiceStudioEngineStatus('http://127.0.0.1:9999');
  assert.ok(typeof res.online === 'boolean');
  assert.ok(res.message);
});

test('Voice Studio - output directory resolution', () => {
  const outDir = getVoiceStudioOutputDir();
  assert.ok(outDir);
  assert.ok(fs.existsSync(outDir));
});

test('Voice Studio - synthesis with mock engine & studio export', async () => {
  // Mock synthesis function creating a silent wav
  const mockSynth = async (text, outPath, opts) => {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20); // PCM
    wavHeader.writeUInt16LE(1, 22); // mono
    wavHeader.writeUInt32LE(24000, 24); // 24kHz
    wavHeader.writeUInt32LE(48000, 28);
    wavHeader.writeUInt16LE(2, 32);
    wavHeader.writeUInt16LE(16, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(0, 40);
    await fs.promises.writeFile(outPath, wavHeader);
  };

  const synthRes = await synthesizeVoiceStudioAudio({
    text: 'Chào mừng các bạn đến với Voice Studio.',
    voice: 'diem_trinh',
    prompt: 'Hào hứng, sôi nổi',
    speed: 1.1,
    synthesizeTtsTextFn: mockSynth
  });

  assert.ok(synthRes.audioPath);
  assert.ok(fs.existsSync(synthRes.audioPath));
  assert.equal(synthRes.format, 'wav');

  // Test Studio Export
  const exportRes = await exportVoiceStudioAudio({
    text: 'Kịch bản thu âm phòng thu chất lượng cao',
    voice: 'diem_trinh',
    prompt: 'Trầm ấm',
    format: 'wav',
    synthesizeTtsTextFn: mockSynth
  });

  assert.ok(exportRes.filePath);
  assert.ok(fs.existsSync(exportRes.filePath));
  assert.ok(exportRes.filename.startsWith('VoiceStudio_'));
  assert.ok(exportRes.filename.endsWith('.wav'));

  // Clean up
  try { await fs.promises.unlink(synthRes.audioPath); } catch {}
  try { await fs.promises.unlink(exportRes.filePath); } catch {}
});
