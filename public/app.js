const form = document.querySelector('#jobForm');
const logs = document.querySelector('#logs');
const state = document.querySelector('#state');
const result = document.querySelector('#result');
const cleanupBtn = document.querySelector('#cleanupBtn');
const themeToggle = document.querySelector('#themeToggle');
const languageSelect = document.querySelector('#languageSelect');
const submitBtn = form.querySelector('button[type="submit"]');
const rangeLabelState = {};

bindRangeValue('subtitleSize', 'subtitleSizeValue');
bindRangeValue('subtitleBottomMargin', 'subtitleBottomValue');
bindRangeValue('subtitleBgOpacity', 'subtitleBgOpacityValue');
bindRangeValue('subtitleLineLength', 'subtitleLineLengthValue');
bindRangeValue('watermarkWidthPercent', 'watermarkWidthValue');
bindRangeValue('watermarkOpacity', 'watermarkOpacityValue');
bindRangeValue('ttsVolume', 'ttsVolumeValue');
bindRangeValue('ttsSpeed', 'ttsSpeedValue');
bindRangeValue('originalVolume', 'originalVolumeValue');

const previewVoiceBtn = document.querySelector('#previewVoiceBtn');
const ttsPreviewAudio = document.querySelector('#ttsPreviewAudio');
const ttsProvider = document.querySelector('#ttsProvider');
const voiceSelect = document.querySelector('#voice');
const ttsVolumeInput = document.querySelector('#ttsVolume');
const ttsSpeedInput = document.querySelector('#ttsSpeed');
const apiCheckBtn = document.querySelector('#apiCheckBtn');
const apiCheckResult = document.querySelector('#apiCheckResult');
const diskNotice = document.querySelector('#diskNotice');
const refreshHistoryBtn = document.querySelector('#refreshHistoryBtn');
const jobHistory = document.querySelector('#jobHistory');
const viewTabs = document.querySelectorAll('.tab-btn');
const presetButtons = document.querySelectorAll('.preset-btn');
const mixPreviewBtn = document.querySelector('#mixPreviewBtn');
const mixPreviewAudio = document.querySelector('#mixPreviewAudio');
const mixPreviewResult = document.querySelector('#mixPreviewResult');
const customPresetName = document.querySelector('#customPresetName');
const customPresetSelect = document.querySelector('#customPresetSelect');
const savePresetBtn = document.querySelector('#savePresetBtn');
const loadPresetBtn = document.querySelector('#loadPresetBtn');
const deletePresetBtn = document.querySelector('#deletePresetBtn');
const jobQueue = document.querySelector('#jobQueue');
const queueState = document.querySelector('#queueState');
const updateCheckBtn = document.querySelector('#updateCheckBtn');
const updateStatus = document.querySelector('#updateStatus');
const presetStatus = document.querySelector('#presetStatus');
const apiFields = ['geminiApiKey', 'geminiModel', 'openaiApiKey', 'openaiTtsModel', 'rapidApiKey'];
const rememberApiKeys = document.querySelector('#rememberApiKeys');
let queuedJobs = [];
let queueRunning = false;

const savedTheme = localStorage.getItem('vietdub-theme');
setTheme(savedTheme || 'dark');
restoreAiSettings();
let currentLang = localStorage.getItem('vietdub-lang') || 'vi';

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
});

function setTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem('vietdub-theme', normalized);
  if (themeToggle) themeToggle.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
}

function restoreAiSettings() {
  if (!rememberApiKeys) return;
  const saved = JSON.parse(localStorage.getItem('vietdub-ai-settings') || '{}');
  rememberApiKeys.checked = saved.remember === true;
  if (!rememberApiKeys.checked) return;
  for (const id of apiFields) {
    const input = document.querySelector(`#${id}`);
    if (input && saved[id]) input.value = saved[id];
  }
}

function saveAiSettings() {
  if (!rememberApiKeys) return;
  if (!rememberApiKeys.checked) {
    localStorage.removeItem('vietdub-ai-settings');
    return;
  }
  const saved = { remember: true };
  for (const id of apiFields) {
    const input = document.querySelector(`#${id}`);
    if (input) saved[id] = input.value;
  }
  localStorage.setItem('vietdub-ai-settings', JSON.stringify(saved));
}

rememberApiKeys?.addEventListener('change', saveAiSettings);
for (const id of apiFields) document.querySelector(`#${id}`)?.addEventListener('input', saveAiSettings);

languageSelect?.addEventListener('change', () => setLanguage(languageSelect.value));

const i18n = {
  vi: {
    brandSubtitle: 'Tải video, ghép clip, tạo phụ đề và lồng tiếng AI.',
    cleanup: 'Dọn file cũ',
    sourceTitle: 'Nguồn đầu vào',
    sourceDesc: 'Nhập link hoặc tải file video/SRT trực tiếp từ máy.',
    linksLabel: 'Link video hoặc link SRT',
    linksPlaceholder: 'Dán một hoặc nhiều link video. Có thể dán kèm URL .srt',
    videoFile: 'File video',
    srtFile: 'File SRT có sẵn',
    srtUrl: 'URL SRT riêng',
    setupTitle: 'Thiết lập xử lý',
    setupDesc: 'Chọn cách xuất video và giọng lồng tiếng.',
    modeLegend: 'Chế độ xử lý',
    modeDub: 'Tạo phụ đề + lồng tiếng',
    modeDownload: 'Chỉ tải/gộp video',
    apiSummary: 'API & mô hình AI',
    geminiKey: 'Gemini API key tạo phụ đề',
    envPlaceholder: 'Dùng .env nếu để trống',
    geminiModel: 'Mô hình Gemini',
    openaiKey: 'OpenAI API key lồng tiếng',
    openaiModel: 'Mô hình OpenAI TTS',
    rapidKey: 'RapidAPI key tải Douyin/TikTok dự phòng',
    rememberApi: 'Lưu API và model trên trình duyệt này',
    ttsLegend: 'Máy chủ TTS & giọng đọc',
    statusTitle: 'Tiến trình',
    statusDesc: 'Theo dõi log xử lý theo thời gian thực.',
    ready: 'Sẵn sàng',
    queued: 'Đang chờ',
    running: 'Đang xử lý',
    done: 'Hoàn tất',
    error: 'Lỗi',
    creatingVoice: 'Đang tạo giọng...',
    previewVoiceError: 'Không tạo được giọng đọc thử',
    createJobError: 'Không tạo được job',
    cleanupConfirm: 'Xoá tất cả file job cũ trong data/jobs? Các link tải cũ sẽ không dùng được nữa.',
    resultDone: 'Hoàn tất.',
    resultDownload: 'Tải',
    cleanupNote: 'File sẽ tự xoá sau {minutes} phút.',
    chooseFile: 'Chọn tệp',
    noFileSelected: 'Không có tệp nào được chọn',
    filesSelected: 'Đã chọn {count} tệp',
    apiCheckButton: 'Kiểm tra API',
    apiChecking: 'Đang kiểm tra API...',
    apiCheckOk: 'API sẵn sàng.',
    apiCheckFail: 'Có API cần kiểm tra lại.',
    diskOk: 'Dung lượng trống: {free}.',
    diskWarning: 'Ổ đĩa còn {free}. Nên dọn thêm dung lượng trước khi render video dài.',
    diskUnknown: 'Không đọc được dung lượng ổ đĩa.',
    diskConfirm: 'Ổ đĩa còn ít dung lượng. Bạn vẫn muốn bắt đầu xử lý?',
    historyTitle: 'Job gần nhất',
    historyRefresh: 'Làm mới',
    historyEmpty: 'Chưa có job nào.',
    historyDownload: 'Tải kết quả',
    historyNoResult: 'Chưa có file kết quả',
    queueTitle: 'Hàng đợi',
    queueCount: '{count} job',
    updateTitle: 'Cập nhật GitHub',
    updateCheck: 'Kiểm tra',
    updateIdle: 'Chưa kiểm tra.',
    updateChecking: 'Đang kiểm tra...',
    updateLatest: 'Đang là bản mới nhất.',
    updateAvailable: 'Có bản mới trên GitHub.',
    updateFailed: 'Không kiểm tra được cập nhật.',
    mixPreviewButton: 'Nghe thử mix âm thanh',
    mixPreviewing: 'Đang tạo bản nghe thử...',
    mixPreviewReady: 'Đã tạo bản nghe thử.',
    savePreset: 'Lưu preset',
    loadPreset: 'Áp dụng',
    deletePreset: 'Xoá',
    processTab: 'Xử lý',
    settingsTab: 'Cài đặt',
    quickPresetTitle: 'Preset nhanh',
    quickPresetDesc: 'Chọn nhanh cấu hình phù hợp trước khi render.',
    presetNone: 'Không',
    presetShorts: 'TikTok/Reels',
    presetClearVoice: 'Lồng tiếng rõ giọng',
    presetKeepMusic: 'Giữ nhạc nền',
    presetSubtitleFocus: 'Phụ đề nổi bật',
    customPresetLegend: 'Preset cá nhân',
    customPresetName: 'Tên preset',
    customPresetNamePlaceholder: 'Ví dụ: Khải Hoàn Shorts',
    customPresetSaved: 'Preset đã lưu',
    presetApplied: 'Đã áp dụng preset: {name}'
  },
  en: {
    brandSubtitle: 'Download, merge, subtitle, and AI dub videos.',
    cleanup: 'Clean old files',
    sourceTitle: 'Input source',
    sourceDesc: 'Paste links or upload video/SRT files from this computer.',
    linksLabel: 'Video link or SRT link',
    linksPlaceholder: 'Paste one or more video links. You can include a .srt URL',
    videoFile: 'Video file',
    srtFile: 'Existing SRT file',
    srtUrl: 'Separate SRT URL',
    setupTitle: 'Processing setup',
    setupDesc: 'Choose output mode and dubbing voice.',
    modeLegend: 'Processing mode',
    modeDub: 'Subtitle + AI dubbing',
    modeDownload: 'Download/merge only',
    apiSummary: 'AI APIs & models',
    geminiKey: 'Gemini API key for subtitles',
    envPlaceholder: 'Use .env when empty',
    geminiModel: 'Gemini model',
    openaiKey: 'OpenAI API key for dubbing',
    openaiModel: 'OpenAI TTS model',
    rapidKey: 'RapidAPI key for Douyin/TikTok fallback',
    rememberApi: 'Save APIs and models in this browser',
    ttsLegend: 'TTS server & voice',
    statusTitle: 'Progress',
    statusDesc: 'Watch processing logs in real time.',
    ready: 'Ready',
    queued: 'Queued',
    running: 'Running',
    done: 'Done',
    error: 'Error',
    creatingVoice: 'Creating voice...',
    previewVoiceError: 'Could not create voice preview',
    createJobError: 'Could not create job',
    cleanupConfirm: 'Delete all old job files in data/jobs? Old download links will stop working.',
    resultDone: 'Done.',
    resultDownload: 'Download',
    cleanupNote: 'File will be deleted automatically after {minutes} minutes.',
    chooseFile: 'Choose file',
    noFileSelected: 'No file selected',
    filesSelected: '{count} files selected',
    apiCheckButton: 'Check APIs',
    apiChecking: 'Checking APIs...',
    apiCheckOk: 'APIs are ready.',
    apiCheckFail: 'Some APIs need attention.',
    diskOk: 'Free disk space: {free}.',
    diskWarning: 'Free disk space is {free}. Consider cleaning disk space before rendering long videos.',
    diskUnknown: 'Could not read disk space.',
    diskConfirm: 'Disk space is low. Do you still want to start processing?',
    historyTitle: 'Recent jobs',
    historyRefresh: 'Refresh',
    historyEmpty: 'No jobs yet.',
    historyDownload: 'Download result',
    historyNoResult: 'No result file yet',
    queueTitle: 'Queue',
    queueCount: '{count} jobs',
    updateTitle: 'GitHub updates',
    updateCheck: 'Check',
    updateIdle: 'Not checked yet.',
    updateChecking: 'Checking...',
    updateLatest: 'You are on the latest version.',
    updateAvailable: 'A new version is available on GitHub.',
    updateFailed: 'Could not check for updates.',
    mixPreviewButton: 'Preview audio mix',
    mixPreviewing: 'Creating audio preview...',
    mixPreviewReady: 'Audio preview is ready.',
    savePreset: 'Save preset',
    loadPreset: 'Apply',
    deletePreset: 'Delete',
    processTab: 'Process',
    settingsTab: 'Settings',
    quickPresetTitle: 'Quick presets',
    quickPresetDesc: 'Apply a render-ready configuration quickly.',
    presetNone: 'None',
    presetShorts: 'TikTok/Reels',
    presetClearVoice: 'Clear dubbing voice',
    presetKeepMusic: 'Keep background music',
    presetSubtitleFocus: 'Subtitle focus',
    customPresetLegend: 'Personal presets',
    customPresetName: 'Preset name',
    customPresetNamePlaceholder: 'Example: Khai Hoan Shorts',
    customPresetSaved: 'Saved presets',
    presetApplied: 'Applied preset: {name}'
  }
};

const extraI18n = {
  vi: {
    apiSummary: 'API & mô hình AI',
    ttsProvider: 'Máy chủ TTS',
    voice: 'Giọng đọc văn bản',
    style: 'Tone giọng',
    previewText: 'Câu phát thử',
    previewButton: 'Phát giọng nói',
    voiceVolume: 'Âm lượng giọng đọc',
    originalVolume: 'Âm lượng video gốc',
    voiceSpeed: 'Tốc độ đọc',
    displayTitle: 'Hiển thị',
    displayDesc: 'Tinh chỉnh phụ đề và watermark khi render video.',
    subtitleLegend: 'Tùy chỉnh phụ đề',
    subtitleFont: 'Font chữ phụ đề',
    subtitleSize: 'Kích thước sub',
    subtitleBottom: 'Khoảng cách đáy',
    subtitleBg: 'Nền phụ đề',
    subtitleColor: 'Màu nền',
    subtitleOpacity: 'Độ đậm nền',
    subtitleLine: 'Độ dài mỗi dòng',
    watermarkLegend: 'Chèn hình ảnh watermark',
    watermarkEnabled: 'Bật watermark',
    watermarkFile: 'Chọn ảnh watermark',
    watermarkPosition: 'Vị trí hiển thị',
    watermarkSize: 'Kích thước watermark',
    watermarkOpacity: 'Độ rõ watermark',
    fileTitle: 'Quản lý file',
    fileDesc: 'Tự dọn dữ liệu tạm để không làm nặng máy.',
    cleanupLegend: 'Dọn file sau khi xử lý',
    autoCleanup: 'Tự xoá thư mục job sau khi hoàn tất',
    cleanupDelay: 'Giữ file để tải trong',
    startButton: '⚡ Bắt đầu xử lý',
    aspectLegend: 'Tỷ lệ khung hình',
    aspectVertical: 'Dọc (9:16)',
    aspectHorizontal: 'Ngang (16:9)',
    aspectSquare: 'Vuông (1:1)',
    aspectOriginal: 'Giữ nguyên'
  },
  en: {
    ttsProvider: 'TTS server',
    voice: 'Text voice',
    style: 'Voice tone',
    previewText: 'Preview sentence',
    previewButton: 'Play voice',
    voiceVolume: 'Voice volume',
    originalVolume: 'Original video volume',
    voiceSpeed: 'Reading speed',
    displayTitle: 'Display',
    displayDesc: 'Adjust subtitles and watermark when rendering.',
    subtitleLegend: 'Subtitle settings',
    subtitleFont: 'Subtitle font',
    subtitleSize: 'Subtitle size',
    subtitleBottom: 'Bottom margin',
    subtitleBg: 'Subtitle background',
    subtitleColor: 'Background color',
    subtitleOpacity: 'Background opacity',
    subtitleLine: 'Line length',
    watermarkLegend: 'Image watermark',
    watermarkEnabled: 'Enable watermark',
    watermarkFile: 'Watermark image',
    watermarkPosition: 'Position',
    watermarkSize: 'Watermark size',
    watermarkOpacity: 'Watermark opacity',
    fileTitle: 'File management',
    fileDesc: 'Automatically clean temporary data to save disk space.',
    cleanupLegend: 'Clean files after processing',
    autoCleanup: 'Delete job folder automatically after completion',
    cleanupDelay: 'Keep download file for',
    startButton: '⚡ Start processing',
    aspectLegend: 'Aspect ratio',
    aspectVertical: 'Vertical (9:16)',
    aspectHorizontal: 'Horizontal (16:9)',
    aspectSquare: 'Square (1:1)',
    aspectOriginal: 'Keep original'
  }
};

function setLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'vi';
  localStorage.setItem('vietdub-lang', currentLang);
  if (languageSelect) languageSelect.value = currentLang;
  const t = { ...i18n[currentLang], ...extraI18n[currentLang] };
  setText('.brand p', t.brandSubtitle);
  setText('#cleanupBtn', t.cleanup);
  setText('.source-section h2', t.sourceTitle);
  setText('.source-section .section-head p', t.sourceDesc);
  setText('textarea[name="links"]', t.linksPlaceholder, 'placeholder');
  setText('label.field:nth-of-type(1) > span', t.linksLabel);
  setText('input[name="videos"]', t.videoFile, 'previous');
  setText('input[name="srtFile"]', t.srtFile, 'previous');
  setText('input[name="srtUrl"]', t.srtUrl, 'previous');
  setText('.setup-section h2', t.setupTitle);
  setText('.setup-section .section-head p', t.setupDesc);
  setText('.segmented legend', t.modeLegend);
  setText('.segmented label:nth-of-type(1) span', t.modeDub);
  setText('.segmented label:nth-of-type(2) span', t.modeDownload);
  setText('.aspect-ratio-segmented legend', t.aspectLegend);
  setText('.aspect-ratio-segmented label:nth-of-type(1) span', t.aspectVertical);
  setText('.aspect-ratio-segmented label:nth-of-type(2) span', t.aspectHorizontal);
  setText('.aspect-ratio-segmented label:nth-of-type(3) span', t.aspectSquare);
  setText('.aspect-ratio-segmented label:nth-of-type(4) span', t.aspectOriginal);
  setText('#apiSettings summary', t.apiSummary);
  setText('#geminiApiKey', t.geminiKey, 'previous');
  setText('#geminiApiKey', t.envPlaceholder, 'placeholder');
  setText('#geminiModel', t.geminiModel, 'previous');
  setText('#openaiApiKey', t.openaiKey, 'previous');
  setText('#openaiApiKey', t.envPlaceholder, 'placeholder');
  setText('#openaiTtsModel', t.openaiModel, 'previous');
  setText('#rapidApiKey', t.rapidKey, 'previous');
  setText('#rapidApiKey', t.envPlaceholder, 'placeholder');
  setText('#rememberApiKeys + span', t.rememberApi);
  setText('.tts-settings legend', t.ttsLegend);
  setText('.display-section fieldset:nth-of-type(1) legend', t.subtitleLegend);
  setText('.display-section fieldset:nth-of-type(2) legend', t.watermarkLegend);
  setText('.file-section fieldset legend', t.cleanupLegend);
  setText('#ttsProvider', t.ttsProvider, 'previous');
  setText('#voice', t.voice, 'previous');
  setText('#ttsStyle', t.style, 'previous');
  setText('#previewText', t.previewText, 'previous');
  setText('#previewVoiceBtn', t.previewButton);
  setText('#mixPreviewBtn', t.mixPreviewButton);
  setRangeLabel('ttsVolume', t.voiceVolume, 'x');
  setRangeLabel('originalVolume', t.originalVolume, '%');
  setRangeLabel('ttsSpeed', t.voiceSpeed, 'x');
  setText('.display-section h2', t.displayTitle);
  setText('.display-section .section-head p', t.displayDesc);
  setText('select[name="subtitleFont"]', t.subtitleFont, 'previous');
  setRangeLabel('subtitleSize', t.subtitleSize, '');
  setRangeLabel('subtitleBottomMargin', t.subtitleBottom, '');
  setText('#subtitleBackground', t.subtitleBg, 'previous');
  setText('input[name="subtitleBgColor"]', t.subtitleColor, 'previous');
  setRangeLabel('subtitleBgOpacity', t.subtitleOpacity, '%');
  setRangeLabel('subtitleLineLength', t.subtitleLine, '');
  setText('input[name="watermarkEnabled"] + span', t.watermarkEnabled);
  setText('input[name="watermarkFile"]', t.watermarkFile, 'previous');
  setText('select[name="watermarkPosition"]', t.watermarkPosition, 'previous');
  setRangeLabel('watermarkWidthPercent', t.watermarkSize, '%');
  setRangeLabel('watermarkOpacity', t.watermarkOpacity, '%');
  setText('.file-section h2', t.fileTitle);
  setText('.file-section .section-head p', t.fileDesc);
  setText('input[name="autoCleanup"] + span', t.autoCleanup);
  setText('select[name="cleanupDelayMinutes"]', t.cleanupDelay, 'previous');
  setText('.primary', t.startButton);
  setText('.status-head h2', t.statusTitle);
  setText('.status-head p', t.statusDesc);
  setText('#apiCheckBtn', t.apiCheckButton);
  setText('.recent-box h3', t.historyTitle);
  setText('#refreshHistoryBtn', t.historyRefresh);
  setText('.queue h3', t.queueTitle);
  setText('#updateCheckBtn', t.updateCheck);
  setText('#savePresetBtn', t.savePreset);
  setText('#loadPresetBtn', t.loadPreset);
  setText('#deletePresetBtn', t.deletePreset);
  setText('.tab-btn[data-view="process"]', t.processTab);
  setText('.tab-btn[data-view="settings"]', t.settingsTab);
  setText('.quick-presets h2', t.quickPresetTitle);
  setText('.quick-presets .section-head p', t.quickPresetDesc);
  setText('.preset-btn[data-preset="none"]', t.presetNone);
  setText('.preset-btn[data-preset="shorts"]', t.presetShorts);
  setText('.preset-btn[data-preset="clearVoice"]', t.presetClearVoice);
  setText('.preset-btn[data-preset="keepMusic"]', t.presetKeepMusic);
  setText('.preset-btn[data-preset="subtitleFocus"]', t.presetSubtitleFocus);
  if (presetStatus?.dataset.presetName) {
    presetStatus.textContent = t.presetApplied.replace('{name}', presetStatus.dataset.presetName);
  }
  setText('.custom-preset-box legend', t.customPresetLegend);
  setText('#customPresetName', t.customPresetName, 'previous');
  setText('#customPresetName', t.customPresetNamePlaceholder, 'placeholder');
  setText('#customPresetSelect', t.customPresetSaved, 'previous');
  setText('.update-box h3', t.updateTitle);
  if (updateStatus && !updateStatus.dataset.checked) updateStatus.textContent = t.updateIdle;
  document.documentElement.lang = currentLang;
  translateOptions(t);
  updateFilePickers();
  renderQueue();
  renderDiskNotice(window.latestDiskInfo);
  loadHistory();
  if (typeof refreshVoices === 'function') refreshVoices();
  if (!state.dataset.status || state.dataset.status === 'ready') state.textContent = t.ready;
}

function setText(selector, value, mode = 'text') {
  const el = document.querySelector(selector);
  if (!el) return;
  if (mode === 'placeholder') el.placeholder = value;
  else if (mode === 'previous') el.closest('label')?.querySelector('span') && (el.closest('label').querySelector('span').textContent = value);
  else el.textContent = value;
}

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

const voiceLabels = {
  vi: {
    'vi-VN-HoaiMyNeural': 'Hoài My - Nữ Việt tự nhiên',
    'vi-VN-NamMinhNeural': 'Nam Minh - Nam Việt rõ chữ',
    nova: 'Nova - Nữ trẻ',
    coral: 'Coral - Tự nhiên, sáng',
    alloy: 'Alloy - Trung tính',
    ash: 'Ash - Nam nhẹ',
    ballad: 'Ballad - Kể chuyện',
    echo: 'Echo - Nam rõ',
    fable: 'Fable - Cảm xúc',
    onyx: 'Onyx - Nam trầm',
    sage: 'Sage - Bình tĩnh',
    shimmer: 'Shimmer - Nữ mềm',
    verse: 'Verse - Năng lượng',
    marin: 'Marin - Tự nhiên',
    cedar: 'Cedar - Ấm'
  },
  en: {
    'vi-VN-HoaiMyNeural': 'Hoai My - Vietnamese female',
    'vi-VN-NamMinhNeural': 'Nam Minh - Vietnamese male',
    nova: 'Nova - young female',
    coral: 'Coral - bright natural',
    alloy: 'Alloy - neutral',
    ash: 'Ash - soft male',
    ballad: 'Ballad - storytelling',
    echo: 'Echo - clear male',
    fable: 'Fable - expressive',
    onyx: 'Onyx - deep male',
    sage: 'Sage - calm',
    shimmer: 'Shimmer - soft female',
    verse: 'Verse - energetic',
    marin: 'Marin - natural',
    cedar: 'Cedar - warm'
  }
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
    option.textContent = voiceLabels[currentLang]?.[value] || label;
    voiceSelect.appendChild(option);
  }
  voiceSelect.value = voices.some(([value]) => value === current) ? current : voices[0][0];
}

ttsProvider?.addEventListener('change', refreshVoices);
refreshVoices();
setLanguage(currentLang);
initFilePickers();
initViews();
initPresetStore();
setActivePreset('none');
loadDiskInfo();
loadHistory();

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
  previewVoiceBtn.textContent = i18n[currentLang].creatingVoice;
  try {
    const body = new URLSearchParams();
    body.set('ttsProvider', document.querySelector('#ttsProvider')?.value || 'edge-neural');
    body.set('voice', document.querySelector('#voice')?.value || 'vi-VN-HoaiMyNeural');
    body.set('ttsStyle', document.querySelector('#ttsStyle')?.value || 'natural');
    body.set('ttsVolume', document.querySelector('#ttsVolume')?.value || '1.05');
    body.set('ttsSpeed', document.querySelector('#ttsSpeed')?.value || '0.9');
    body.set('originalVolume', String(Number(document.querySelector('#originalVolume')?.value || 52) / 100));
    body.set('openaiApiKey', document.querySelector('#openaiApiKey')?.value || '');
    body.set('openaiTtsModel', document.querySelector('#openaiTtsModel')?.value || 'gpt-4o-mini-tts');
    body.set('previewText', document.querySelector('#previewText')?.value || 'Xin chào, đây là giọng đọc thử của VietDub AI.');

    const response = await fetch('/api/tts-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || i18n[currentLang].previewVoiceError);
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
    previewVoiceBtn.textContent = extraI18n[currentLang].previewButton;
  }
});

apiCheckBtn?.addEventListener('click', async () => {
  saveAiSettings();
  apiCheckBtn.disabled = true;
  if (apiCheckResult) apiCheckResult.textContent = i18n[currentLang].apiChecking;
  try {
    const response = await fetch('/api/api-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API check failed');
    const items = [data.gemini, data.openai, data.rapidapi].filter(Boolean);
    const ok = items.every((item) => item.ok);
    const text = items.map((item) => item.message).join(' ');
    if (apiCheckResult) apiCheckResult.textContent = `${ok ? i18n[currentLang].apiCheckOk : i18n[currentLang].apiCheckFail} ${text}`;
    appendLog(text, !ok);
  } catch (error) {
    if (apiCheckResult) apiCheckResult.textContent = error.message;
    appendLog(error.message, true);
  } finally {
    apiCheckBtn.disabled = false;
  }
});

refreshHistoryBtn?.addEventListener('click', loadHistory);
updateCheckBtn?.addEventListener('click', checkUpdates);
presetButtons.forEach((button) => button.addEventListener('click', () => applyQuickPreset(button.dataset.preset)));
savePresetBtn?.addEventListener('click', saveCustomPreset);
loadPresetBtn?.addEventListener('click', loadSelectedPreset);
deletePresetBtn?.addEventListener('click', deleteSelectedPreset);
mixPreviewBtn?.addEventListener('click', previewAudioMix);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveAiSettings();
  const diskInfo = await loadDiskInfo();
  if (diskInfo?.warning && !window.confirm(i18n[currentLang].diskConfirm)) return;
  logs.innerHTML = '';
  result.classList.add('hidden');
  result.innerHTML = '';
  state.dataset.status = 'running';
  state.textContent = i18n[currentLang].running;
  submitBtn.disabled = true;

  try {
    const queueItems = buildQueueItems();
    if (queueItems.length > 1) {
      queuedJobs = queueItems.map((item, index) => ({ ...item, status: 'queued', index: index + 1 }));
      renderQueue();
      await runQueue();
    } else {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        body: new FormData(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || i18n[currentLang].createJobError);
      await watchJob(data.id);
    }
  } catch (error) {
    state.dataset.status = 'error';
    state.textContent = i18n[currentLang].error;
    appendLog(error.message, true);
    submitBtn.disabled = false;
  }
});

cleanupBtn.addEventListener('click', async () => {
  const ok = window.confirm(i18n[currentLang].cleanupConfirm);
  if (!ok) return;
  await fetch('/api/cleanup', { method: 'POST' });
  logs.innerHTML = '';
  result.classList.add('hidden');
  state.dataset.status = 'ready';
  state.textContent = i18n[currentLang].ready;
  loadHistory();
  loadDiskInfo();
});

function watchJob(id) {
  return new Promise((resolve, reject) => {
  const events = new EventSource(`/api/jobs/${id}/events`);
  events.onmessage = (event) => {
    const job = JSON.parse(event.data);
    state.dataset.status = job.status;
    state.textContent = label(job.status);
    for (const item of job.logs || []) appendLog(item.message);

    if (job.status === 'done') {
      const cleanupNote = job.result.autoCleanup
        ? `<br><small>${i18n[currentLang].cleanupNote.replace('{minutes}', job.result.cleanupDelayMinutes)}</small>`
        : '';
      result.innerHTML = `<strong>${i18n[currentLang].resultDone}</strong><br><a href="${job.result.url}" download="${job.result.fileName}">${i18n[currentLang].resultDownload} ${job.result.fileName}</a>${cleanupNote}`;
      result.classList.remove('hidden');
      if (!queueRunning) submitBtn.disabled = false;
      events.close();
      loadHistory();
      loadDiskInfo();
      resolve(job);
    }

    if (job.status === 'error') {
      appendLog(job.error, true);
      if (!queueRunning) submitBtn.disabled = false;
      events.close();
      loadHistory();
      reject(new Error(job.error || i18n[currentLang].error));
    }
  };
  events.onerror = () => {
    appendLog('Mất kết nối log tiến trình.', true);
    if (!queueRunning) submitBtn.disabled = false;
    events.close();
    reject(new Error('Mất kết nối log tiến trình.'));
  };
  });
}

function buildQueueItems() {
  const linksInput = form.querySelector('textarea[name="links"]');
  const videoInput = form.querySelector('input[name="videos"]');
  const links = (linksInput?.value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (links.length <= 1 || (videoInput?.files?.length || 0) > 0) return [];
  return links.map((link) => ({ link }));
}

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    for (const item of queuedJobs) {
      item.status = 'running';
      renderQueue();
      appendLog(`=========================================`);
      appendLog(`[${item.index}/${queuedJobs.length}] Bắt đầu xử lý: ${item.link}`);

      const body = new FormData(form);
      body.set('links', item.link);
      try {
        const response = await fetch('/api/jobs', { method: 'POST', body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || i18n[currentLang].createJobError);
        item.jobId = data.id;
        await watchJob(data.id);
        item.status = 'done';
        renderQueue();
      } catch (error) {
        item.status = 'error';
        renderQueue();
        appendLog(`❌ Lỗi xử lý [${item.link}]: ${error.message || error}`, true);
      }
    }
  } finally {
    queueRunning = false;
    submitBtn.disabled = false;
    renderQueue();
  }
}

function renderQueue() {
  if (!jobQueue || !queueState) return;
  queueState.textContent = i18n[currentLang].queueCount.replace('{count}', queuedJobs.length);
  jobQueue.innerHTML = '';
  for (const item of queuedJobs) {
    const li = document.createElement('li');
    li.textContent = `${item.index}. ${label(item.status)} - ${item.link}`;
    jobQueue.appendChild(li);
  }
}

function initViews() {
  viewTabs.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view || 'process')));
  setView(localStorage.getItem('vietdub-view') || 'process');
}

function setView(view) {
  const normalized = view === 'settings' ? 'settings' : 'process';
  localStorage.setItem('vietdub-view', normalized);
  viewTabs.forEach((button) => button.classList.toggle('active', button.dataset.view === normalized));
  const processBlocks = ['.quick-presets', '.source-section', '.setup-section .section-head', '.segmented'];
  const settingsBlocks = ['#apiSettings', '.tts-settings', '.display-section', '.file-section'];
  processBlocks.forEach((selector) => document.querySelector(selector)?.classList.toggle('hidden', normalized !== 'process'));
  settingsBlocks.forEach((selector) => document.querySelector(selector)?.classList.toggle('hidden', normalized !== 'settings'));
}

function applyQuickPreset(name) {
  if (name === 'none') {
    setActivePreset('none');
    if (presetStatus) {
      presetStatus.dataset.presetName = '';
      presetStatus.textContent = '';
    }
    localStorage.removeItem('vietdub-active-preset');
    return;
  }
  const labels = {
    shorts: 'TikTok/Reels',
    clearVoice: i18n[currentLang].presetClearVoice,
    keepMusic: i18n[currentLang].presetKeepMusic,
    subtitleFocus: i18n[currentLang].presetSubtitleFocus
  };
  const presets = {
    shorts: { subtitleSize: 12, subtitleBottomMargin: 34, subtitleBackground: 'none', ttsVolume: 1.15, originalVolume: 35, watermarkWidthPercent: 12 },
    clearVoice: { subtitleSize: 12, subtitleBottomMargin: 36, ttsVolume: 1.25, originalVolume: 25, ttsSpeed: 0.92 },
    keepMusic: { subtitleSize: 11, subtitleBottomMargin: 34, ttsVolume: 1.05, originalVolume: 75, ttsSpeed: 0.95 },
    subtitleFocus: { subtitleSize: 14, subtitleBottomMargin: 42, subtitleBackground: 'box', subtitleBgOpacity: 70, originalVolume: 45 }
  };
  applyConfig(presets[name] || {});
  setActivePreset(name);
  if (presetStatus) {
    const labelText = labels[name] || name;
    presetStatus.dataset.presetName = labelText;
    presetStatus.textContent = i18n[currentLang].presetApplied.replace('{name}', labelText);
  }
  localStorage.setItem('vietdub-active-preset', name || '');
}

function setActivePreset(name) {
  presetButtons.forEach((button) => button.classList.toggle('active', button.dataset.preset === name));
}

function readConfig() {
  const names = ['subtitleSize', 'subtitleBottomMargin', 'subtitleBackground', 'subtitleBgOpacity', 'subtitleLineLength', 'subtitleFont', 'watermarkPosition', 'watermarkWidthPercent', 'watermarkOpacity', 'ttsProvider', 'voice', 'ttsStyle', 'ttsVolume', 'ttsSpeed', 'originalVolume', 'cleanupDelayMinutes', 'aspectRatio', 'mode'];
  const config = {};
  for (const name of names) {
    const el = form.elements[name];
    if (el) config[name] = el.value;
  }
  return config;
}

function applyConfig(config) {
  for (const [name, value] of Object.entries(config)) {
    const el = form.elements[name];
    if (!el) continue;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  refreshVoices();
}

function getStoredPresets() {
  return JSON.parse(localStorage.getItem('vietdub-custom-presets') || '{}');
}

function setStoredPresets(presets) {
  localStorage.setItem('vietdub-custom-presets', JSON.stringify(presets));
}

function initPresetStore() {
  renderCustomPresetSelect();
}

function renderCustomPresetSelect() {
  if (!customPresetSelect) return;
  const presets = getStoredPresets();
  customPresetSelect.innerHTML = '';
  for (const name of Object.keys(presets)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    customPresetSelect.appendChild(option);
  }
}

function saveCustomPreset() {
  const name = (customPresetName?.value || '').trim() || `Preset ${new Date().toLocaleString()}`;
  const presets = getStoredPresets();
  presets[name] = readConfig();
  setStoredPresets(presets);
  renderCustomPresetSelect();
  if (customPresetSelect) customPresetSelect.value = name;
}

function loadSelectedPreset() {
  const presets = getStoredPresets();
  const selected = customPresetSelect?.value;
  if (selected && presets[selected]) applyConfig(presets[selected]);
}

function deleteSelectedPreset() {
  const presets = getStoredPresets();
  const selected = customPresetSelect?.value;
  if (!selected) return;
  delete presets[selected];
  setStoredPresets(presets);
  renderCustomPresetSelect();
}

async function previewAudioMix() {
  if (!mixPreviewBtn) return;
  mixPreviewBtn.disabled = true;
  if (mixPreviewResult) mixPreviewResult.textContent = i18n[currentLang].mixPreviewing;
  try {
    const body = new FormData();
    const video = form.querySelector('input[name="videos"]')?.files?.[0];
    if (video) body.set('previewVideo', video);
    for (const name of ['ttsProvider', 'voice', 'ttsStyle', 'ttsVolume', 'ttsSpeed', 'originalVolume', 'openaiApiKey', 'openaiTtsModel', 'previewText']) {
      const el = document.querySelector(`[name="${name}"]`);
      if (el) body.set(name, el.value);
    }
    const response = await fetch('/api/audio-mix-preview', { method: 'POST', body });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Không tạo được bản nghe thử.');
    }
    const blob = await response.blob();
    if (mixPreviewAudio.src) URL.revokeObjectURL(mixPreviewAudio.src);
    mixPreviewAudio.src = URL.createObjectURL(blob);
    mixPreviewAudio.hidden = false;
    if (mixPreviewResult) mixPreviewResult.textContent = i18n[currentLang].mixPreviewReady;
    await mixPreviewAudio.play();
  } catch (error) {
    if (mixPreviewResult) mixPreviewResult.textContent = error.message;
    appendLog(error.message, true);
  } finally {
    mixPreviewBtn.disabled = false;
  }
}

async function checkUpdates() {
  if (!updateStatus) return;
  updateStatus.dataset.checked = '1';
  updateStatus.textContent = i18n[currentLang].updateChecking;
  try {
    const response = await fetch('/api/system/update');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Server đang chạy bản cũ, hãy khởi động lại VietDub AI rồi kiểm tra lại.');
    }
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Update check failed');
    updateStatus.textContent = data.hasUpdate
      ? `${i18n[currentLang].updateAvailable} ${data.latestCommit?.slice(0, 7) || ''}`
      : `${i18n[currentLang].updateLatest} ${data.localCommit?.slice(0, 7) || ''}`;
  } catch (error) {
    updateStatus.textContent = `${i18n[currentLang].updateFailed} ${error.message}`;
  }
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
  const t = i18n[currentLang];
  if (status === 'queued') return t.queued;
  if (status === 'running') return t.running;
  if (status === 'done') return t.done;
  if (status === 'error') return t.error;
  return t.ready;
}

async function loadDiskInfo() {
  try {
    const response = await fetch('/api/system/disk');
    const data = await response.json();
    window.latestDiskInfo = data;
    renderDiskNotice(data);
    return data;
  } catch (error) {
    window.latestDiskInfo = { ok: false, error: error.message };
    renderDiskNotice(window.latestDiskInfo);
    return window.latestDiskInfo;
  }
}

function renderDiskNotice(data) {
  if (!diskNotice || !data) return;
  diskNotice.classList.remove('hidden', 'warning');
  if (!data.ok || data.freeBytes == null) {
    diskNotice.textContent = i18n[currentLang].diskUnknown;
    return;
  }
  const free = formatBytes(data.freeBytes);
  diskNotice.textContent = (data.warning ? i18n[currentLang].diskWarning : i18n[currentLang].diskOk).replace('{free}', free);
  if (data.warning) diskNotice.classList.add('warning');
}

async function loadHistory() {
  if (!jobHistory) return;
  try {
    const response = await fetch('/api/jobs');
    const data = await response.json();
    renderHistory(data.jobs || []);
  } catch {
    renderHistory([]);
  }
}

function renderHistory(items) {
  if (!jobHistory) return;
  jobHistory.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = i18n[currentLang].historyEmpty;
    jobHistory.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const title = document.createElement(item.result?.url ? 'a' : 'span');
    title.textContent = item.result?.fileName || i18n[currentLang].historyNoResult;
    if (item.result?.url) {
      title.href = item.result.url;
      title.download = item.result.fileName;
    }
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = `${label(item.status)} · ${new Date(item.createdAt).toLocaleString()}`;
    li.append(title, meta);
    jobHistory.appendChild(li);
  }
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function bindRangeValue(inputId, outputId) {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return;
  input.dataset.outputId = outputId;
  input.addEventListener('input', () => syncRangeLabel(input));
  syncRangeLabel(input);
}

function setRangeLabel(inputId, label, suffix = '') {
  rangeLabelState[inputId] = { label, suffix };
  const input = document.querySelector(`#${inputId}`);
  if (input) syncRangeLabel(input);
}

function syncRangeLabel(input) {
  const state = rangeLabelState[input.id];
  const span = input.closest('label')?.querySelector('span');
  if (state && span) {
    span.textContent = `${state.label}: ${input.value}${state.suffix}`;
    return;
  }
  const output = document.querySelector(`#${input.dataset.outputId}`);
  if (output) output.value = input.value;
}

function initFilePickers() {
  document.querySelectorAll('.file-picker input[type="file"]').forEach((input) => {
    input.addEventListener('change', () => updateFilePicker(input));
    updateFilePicker(input);
  });
}

function updateFilePickers() {
  document.querySelectorAll('.file-picker input[type="file"]').forEach(updateFilePicker);
}

function updateFilePicker(input) {
  const picker = input.closest('.file-picker');
  if (!picker) return;
  const t = i18n[currentLang];
  const button = picker.querySelector('.file-button');
  const name = picker.querySelector('.file-name');
  if (button) button.textContent = t.chooseFile;
  if (!name) return;
  if (!input.files || input.files.length === 0) {
    name.textContent = t.noFileSelected;
  } else if (input.files.length === 1) {
    name.textContent = input.files[0].name;
  } else {
    name.textContent = t.filesSelected.replace('{count}', input.files.length);
  }
}

function translateOptions(t) {
  setOptions('#geminiModel', currentLang === 'en' ? {
    'gemini-3.5-flash': 'Gemini 3.5 Flash - latest',
    'gemini-2.5-pro': 'Gemini 2.5 Pro - most accurate',
    'gemini-2.5-flash': 'Gemini 2.5 Flash - fast',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash'
  } : {
    'gemini-3.5-flash': 'Gemini 3.5 Flash - mới nhất',
    'gemini-2.5-pro': 'Gemini 2.5 Pro - chính xác nhất',
    'gemini-2.5-flash': 'Gemini 2.5 Flash - nhanh',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash'
  });
  setOptions('#openaiTtsModel', currentLang === 'en' ? {
    'gpt-4o-mini-tts': 'gpt-4o-mini-tts - natural',
    'tts-1-hd': 'tts-1-hd - high quality',
    'tts-1': 'tts-1 - fast'
  } : {
    'gpt-4o-mini-tts': 'gpt-4o-mini-tts - tự nhiên',
    'tts-1-hd': 'tts-1-hd - chất lượng cao',
    'tts-1': 'tts-1 - nhanh'
  });
  setOptions('#ttsProvider', {
    'openai-tts': currentLang === 'en' ? 'OpenAI TTS - most natural' : 'OpenAI TTS - tự nhiên nhất',
    'edge-neural': currentLang === 'en' ? 'Microsoft Edge Neural - fallback' : 'Microsoft Edge Neural - dự phòng'
  });
  setOptions('#ttsStyle', currentLang === 'en' ? {
    natural: 'Natural, clear', friendly: 'Friendly, warm', cheerful: 'Bright, energetic', calm: 'Calm, gentle', serious: 'Serious, firm', story: 'Storytelling, expressive', news: 'Presenter, professional', soft: 'Soft, easy to hear'
  } : {
    natural: 'Tự nhiên, rõ chữ', friendly: 'Thân thiện, gần gũi', cheerful: 'Tươi sáng, có năng lượng', calm: 'Bình tĩnh, nhẹ nhàng', serious: 'Nghiêm túc, chắc giọng', story: 'Kể chuyện, có cảm xúc', news: 'Dẫn chương trình, chuyên nghiệp', soft: 'Mềm, nhẹ, dễ nghe'
  });
  setOptions('#subtitleBackground', currentLang === 'en' ? { none: 'No background', box: 'Box background' } : { none: 'Không nền', box: 'Nền hộp' });
  setOptions('select[name="watermarkPosition"]', currentLang === 'en' ? { 'top-right': 'Top right', 'top-left': 'Top left', 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left', center: 'Center' } : { 'top-right': 'Góc trên phải', 'top-left': 'Góc trên trái', 'bottom-right': 'Góc dưới phải', 'bottom-left': 'Góc dưới trái', center: 'Giữa video' });
  setOptions('select[name="cleanupDelayMinutes"]', currentLang === 'en' ? { 5: '5 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 180: '3 hours', 1440: '1 day' } : { 5: '5 phút', 15: '15 phút', 30: '30 phút', 60: '1 giờ', 180: '3 giờ', 1440: '1 ngày' });
}

function setOptions(selector, labels) {
  const select = document.querySelector(selector);
  if (!select) return;
  for (const option of select.options) {
    if (labels[option.value]) option.textContent = labels[option.value];
  }
}
