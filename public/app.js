const form = document.querySelector('#jobForm');
const logs = document.querySelector('#logs');
const state = document.querySelector('#state');
const result = document.querySelector('#result');
const cleanupBtn = document.querySelector('#cleanupBtn');
const submitBtn = form.querySelector('button[type="submit"]');

bindRangeValue('subtitleSize', 'subtitleSizeValue');
bindRangeValue('subtitleBottomMargin', 'subtitleBottomValue');
bindRangeValue('subtitleBgOpacity', 'subtitleBgOpacityValue');
bindRangeValue('subtitleLineLength', 'subtitleLineLengthValue');
bindRangeValue('watermarkWidthPercent', 'watermarkWidthValue');
bindRangeValue('watermarkOpacity', 'watermarkOpacityValue');
bindRangeValue('ttsVolume', 'ttsVolumeValue');
bindRangeValue('ttsSpeed', 'ttsSpeedValue');

const previewVoiceBtn = document.querySelector('#previewVoiceBtn');
const ttsPreviewAudio = document.querySelector('#ttsPreviewAudio');
const ttsProvider = document.querySelector('#ttsProvider');
const voiceSelect = document.querySelector('#voice');
const ttsVolumeInput = document.querySelector('#ttsVolume');
const ttsSpeedInput = document.querySelector('#ttsSpeed');

const voiceCatalog = {
  'edge-neural': [
    ['vi-VN-HoaiMyNeural', 'Hoài My - Nữ Việt tự nhiên'],
    ['vi-VN-NamMinhNeural', 'Nam Minh - Nam Việt rõ chữ']
  ],
  'openai-tts': [
    ['nova', 'Nova - Nữ trẻ'],
    ['coral', 'Coral - Tự nhiên, sáng'],
    ['alloy', 'Alloy - Trung tính'],
    ['ash', 'Ash - Nam nhẹ'],
    ['ballad', 'Ballad - Kể chuyện'],
    ['echo', 'Echo - Nam rõ'],
    ['fable', 'Fable - Cảm xúc'],
    ['onyx', 'Onyx - Nam trầm'],
    ['sage', 'Sage - Bình tĩnh'],
    ['shimmer', 'Shimmer - Nữ mềm'],
    ['verse', 'Verse - Năng lượng'],
    ['marin', 'Marin - Tự nhiên'],
    ['cedar', 'Cedar - Ấm']
  ]
};

function refreshVoices() {
  if (!ttsProvider || !voiceSelect) return;
  const current = voiceSelect.value;
  const voices = voiceCatalog[ttsProvider.value] || voiceCatalog['edge-neural'];
  document.querySelector('#ttsStyleField')?.classList.toggle('hidden', ttsProvider.value !== 'openai-tts');
  voiceSelect.innerHTML = '';
  for (const [value, label] of voices) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    voiceSelect.appendChild(option);
  }
  voiceSelect.value = voices.some(([value]) => value === current) ? current : voices[0][0];
}

ttsProvider?.addEventListener('change', refreshVoices);
refreshVoices();

function syncPreviewPlayback() {
  if (!ttsPreviewAudio) return;
  ttsPreviewAudio.volume = Math.min(1, Math.max(0, Number(ttsVolumeInput?.value || 1) / 2));
  ttsPreviewAudio.playbackRate = Math.min(1.3, Math.max(0.7, Number(ttsSpeedInput?.value || 1)));
}

ttsVolumeInput?.addEventListener('input', syncPreviewPlayback);
ttsSpeedInput?.addEventListener('input', syncPreviewPlayback);
syncPreviewPlayback();

previewVoiceBtn?.addEventListener('click', async () => {
  previewVoiceBtn.disabled = true;
  previewVoiceBtn.textContent = 'Đang tạo giọng...';
  try {
    const body = new URLSearchParams();
    body.set('ttsProvider', document.querySelector('#ttsProvider')?.value || 'edge-neural');
    body.set('voice', document.querySelector('#voice')?.value || 'vi-VN-HoaiMyNeural');
    body.set('ttsStyle', document.querySelector('#ttsStyle')?.value || 'natural');
    body.set('ttsVolume', document.querySelector('#ttsVolume')?.value || '1.05');
    body.set('ttsSpeed', document.querySelector('#ttsSpeed')?.value || '0.9');
    body.set('previewText', document.querySelector('#previewText')?.value || 'Xin chào, đây là giọng đọc thử của VietDub AI.');

    const response = await fetch('/api/tts-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Không tạo được giọng đọc thử');
    }
    const blob = await response.blob();
    if (ttsPreviewAudio.src) URL.revokeObjectURL(ttsPreviewAudio.src);
    ttsPreviewAudio.src = URL.createObjectURL(blob);
    ttsPreviewAudio.hidden = false;
    syncPreviewPlayback();
    await ttsPreviewAudio.play();
  } catch (error) {
    appendLog(error.message, true);
  } finally {
    previewVoiceBtn.disabled = false;
    previewVoiceBtn.textContent = 'Phát giọng nói';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  logs.innerHTML = '';
  result.classList.add('hidden');
  result.innerHTML = '';
  state.textContent = 'Đang gửi';
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      body: new FormData(form)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không tạo được job');
    watchJob(data.id);
  } catch (error) {
    state.textContent = 'Lỗi';
    appendLog(error.message, true);
    submitBtn.disabled = false;
  }
});

cleanupBtn.addEventListener('click', async () => {
  const ok = window.confirm('Xoá tất cả file job cũ trong data/jobs? Các link tải cũ sẽ không dùng được nữa.');
  if (!ok) return;
  await fetch('/api/cleanup', { method: 'POST' });
  logs.innerHTML = '';
  result.classList.add('hidden');
  state.textContent = 'Đã dọn dữ liệu tạm';
});

function watchJob(id) {
  const events = new EventSource(`/api/jobs/${id}/events`);
  events.onmessage = (event) => {
    const job = JSON.parse(event.data);
    state.textContent = label(job.status);
    for (const item of job.logs || []) appendLog(item.message);

    if (job.status === 'done') {
      const cleanupNote = job.result.autoCleanup
        ? `<br><small>File sẽ tự xoá sau ${job.result.cleanupDelayMinutes} phút.</small>`
        : '';
      result.innerHTML = `<strong>Hoàn tất.</strong><br><a href="${job.result.url}" download="${job.result.fileName}">Tải ${job.result.fileName}</a>${cleanupNote}`;
      result.classList.remove('hidden');
      submitBtn.disabled = false;
      events.close();
    }

    if (job.status === 'error') {
      appendLog(job.error, true);
      submitBtn.disabled = false;
      events.close();
    }
  };
  events.onerror = () => {
    appendLog('Mất kết nối log tiến trình.', true);
    submitBtn.disabled = false;
    events.close();
  };
}

function appendLog(message, error = false) {
  if (!message) return;
  const li = document.createElement('li');
  li.textContent = message;
  if (error) li.className = 'error';
  logs.appendChild(li);
  logs.scrollTop = logs.scrollHeight;
}

function label(status) {
  if (status === 'queued') return 'Đang chờ';
  if (status === 'running') return 'Đang xử lý';
  if (status === 'done') return 'Hoàn tất';
  if (status === 'error') return 'Lỗi';
  return 'Sẵn sàng';
}

function bindRangeValue(inputId, outputId) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  if (!input || !output) return;
  const sync = () => {
    output.value = input.value;
  };
  input.addEventListener('input', sync);
  sync();
}
