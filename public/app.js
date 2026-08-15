const form = document.querySelector('#jobForm');
const logs = document.querySelector('#logs');
const state = document.querySelector('#state');
const result = document.querySelector('#result');
const cleanupBtn = document.querySelector('#cleanupBtn');
const themeToggle = document.querySelector('#themeToggle');
const submitBtn = document.querySelector('#submitBtn') || form.querySelector('button[type="submit"]');
const linksInput = document.querySelector('#linksInput') || form.querySelector('textarea[name="links"]');
const batchCountBadge = document.querySelector('#batchCountBadge');
const batchInspectorBox = document.querySelector('#batchInspectorBox');
const batchInspectorList = document.querySelector('#batchInspectorList');
const batchInspectorCount = document.querySelector('#batchInspectorCount');
const clearBatchDuplicatesBtn = document.querySelector('#clearBatchDuplicatesBtn');
const clearLogsBtn = document.querySelector('#clearLogsBtn');
const topStatusDot = document.querySelector('#topStatusDot');
const topEngineText = document.querySelector('#topEngineText');

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
const gitPullBtn = document.querySelector('#gitPullBtn');
const updateYtdlpBtn = document.querySelector('#updateYtdlpBtn');
const ytdlpUpdateStatus = document.querySelector('#ytdlpUpdateStatus');
const outputDirInput = document.querySelector('#outputDir');
const selectOutputDirBtn = document.querySelector('#selectOutputDirBtn');
const apiFields = ['geminiApiKey', 'geminiModel', 'openaiApiKey', 'openaiTtsModel', 'rapidApiKey'];
const rememberApiKeys = document.querySelector('#rememberApiKeys');

let queuedJobs = [];
let queueRunning = false;

// Theme Initialization
const savedTheme = localStorage.getItem('vietdub-theme') || 'dark';
setTheme(savedTheme);
restoreAiSettings();
restoreOutputDir();
let currentLang = 'vi';

themeToggle?.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
});

function setTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem('vietdub-theme', normalized);
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
    themeToggle.textContent = normalized === 'dark' ? '🌓 Giao diện' : '☀️ Giao diện';
  }
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

function restoreOutputDir() {
  if (outputDirInput) {
    outputDirInput.value = localStorage.getItem('vietdub-output-dir') || '';
  }
}

function saveOutputDir() {
  if (outputDirInput) {
    localStorage.setItem('vietdub-output-dir', outputDirInput.value.trim());
  }
}

outputDirInput?.addEventListener('input', saveOutputDir);
languageSelect?.addEventListener('change', () => setLanguage(languageSelect.value));

const i18n = {
  vi: {
    brandSubtitle: 'Studio Tải Video, Ghép Phụ Đề & Lồng Tiếng AI Hàng Loạt',
    cleanup: 'Dọn file cũ',
    sourceTitle: 'Nguồn Video Đầu Vào',
    sourceDesc: 'Dán danh sách nhiều link video để tải hàng loạt, hoặc tải tệp video trực tiếp từ máy tính.',
    linksLabel: 'Danh sách link video hoặc link SRT',
    linksPlaceholder: 'Dán một hoặc nhiều link video (TikTok, Douyin, YouTube, Facebook, Kuaishou, MP4...). Mỗi link một dòng.',
    videoFile: 'File video cục bộ',
    srtFile: 'File SRT có sẵn',
    srtUrl: 'URL SRT riêng biệt (nếu có)',
    setupTitle: 'Thiết Lập Xử Lý & Âm Thanh',
    setupDesc: 'Tùy chỉnh chế độ xuất video, tỷ lệ khung hình và giọng đọc AI.',
    modeLegend: 'Chế độ xuất video',
    modeDub: '🎬 Phụ đề + Lồng tiếng',
    modeDownload: '⚡ Chỉ tải / Gộp video',
    apiSummary: '🔑 Cấu hình API Keys & Mô hình AI',
    geminiKey: 'Gemini API Key (Tạo phụ đề)',
    envPlaceholder: 'Dùng file .env nếu để trống',
    geminiModel: 'Mô hình Gemini',
    openaiKey: 'OpenAI API Key (Lồng tiếng)',
    openaiModel: 'Mô hình OpenAI TTS',
    rapidKey: 'RapidAPI Key (Dự phòng tải Douyin/TikTok)',
    rememberApi: 'Lưu thông tin API và Mô hình trên trình duyệt này',
    ttsLegend: '🎙️ Máy chủ TTS & Giọng Đọc AI',
    statusTitle: 'Tiến Trình Xử Lý',
    statusDesc: 'Theo dõi trực tiếp quá trình tạo video theo thời gian thực.',
    ready: 'Sẵn sàng',
    queued: 'Đang chờ',
    running: 'Đang xử lý',
    done: 'Hoàn tất',
    error: 'Lỗi',
    creatingVoice: 'Đang tạo giọng...',
    previewVoiceError: 'Không tạo được giọng đọc thử',
    createJobError: 'Không tạo được job',
    cleanupConfirm: 'Xoá tất cả file job cũ trong data/jobs? Các link tải cũ sẽ không dùng được nữa.',
    resultDone: 'Đã hoàn tất xử lý video!',
    resultDownload: 'Tải video thành phẩm:',
    cleanupNote: 'File tạm sẽ tự xoá sau {minutes} phút.',
    chooseFile: 'Chọn tệp',
    noFileSelected: 'Không có tệp nào được chọn',
    filesSelected: 'Đã chọn {count} tệp',
    apiCheckButton: '⚡ Kiểm tra kết nối API',
    apiChecking: 'Đang kiểm tra API...',
    apiCheckOk: 'API sẵn sàng hoạt động.',
    apiCheckFail: 'Có API cần kiểm tra lại thông tin.',
    diskOk: 'Dung lượng ổ đĩa trống: {free}.',
    diskWarning: 'Ổ đĩa chỉ còn {free}. Nên dọn thêm dung lượng trước khi render video dài.',
    diskUnknown: 'Không đọc được dung lượng ổ đĩa.',
    diskConfirm: 'Ổ đĩa còn ít dung lượng. Bạn vẫn muốn bắt đầu xử lý?',
    historyTitle: 'Video Hoàn Tất Gần Đây',
    historyRefresh: 'Làm mới',
    historyEmpty: 'Chưa có video nào hoàn tất.',
    historyDownload: 'Tải kết quả',
    historyNoResult: 'Chưa có file kết quả',
    queueTitle: 'Hàng Đợi Xử Lý Hàng Loạt',
    queueCount: '{count} video trong hàng đợi',
    outputDirLegend: '📂 Thư Mục Lưu Video Đầu Ra',
    outputDirLabel: 'Đường dẫn thư mục lưu trữ',
    outputDirPlaceholder: 'Để trống để lưu tại thư mục tạm của app',
    selectFolderBtn: '📁 Chọn thư mục',
    appUpdateTitle: 'Cập Nhật Ứng Dụng',
    engineUpdateTitle: 'Engine Tải Video',
    ytdlpUpdateBtn: 'Cập nhật yt-dlp',
    ytdlpUpdating: 'Đang cập nhật engine...',
    ytdlpUpdated: 'yt-dlp đã được cập nhật bản mới nhất!',
    ytdlpUpdateFailed: 'Cập nhật engine lỗi: ',
    gitPullBtn: 'Cập nhật ngay',
    gitPulling: 'Đang tải bản cập nhật...',
    gitPullSuccess: 'Cập nhật thành công! Vui lòng khởi động lại app.',
    gitPullFailed: 'Cập nhật lỗi: ',
    updateCheck: 'Kiểm tra',
    updateIdle: 'Chưa kiểm tra.',
    updateChecking: 'Đang kiểm tra...',
    updateLatest: 'Đang là bản mới nhất.',
    updateAvailable: 'Có bản cập nhật mới trên GitHub.',
    updateFailed: 'Không kiểm tra được cập nhật.',
    mixPreviewButton: '🎧 Nghe thử mix âm thanh',
    mixPreviewing: 'Đang tạo bản nghe thử...',
    mixPreviewReady: 'Đã tạo bản nghe thử thành công.',
    savePreset: '💾 Lưu cấu hình',
    loadPreset: '⚡ Áp dụng',
    deletePreset: '🗑️ Xóa',
    processTab: 'Quy trình Xử lý',
    settingsTab: 'Cài đặt & API',
    quickPresetTitle: 'Preset Thiết Lập Nhanh',
    quickPresetDesc: 'Chọn nhanh cấu hình tối ưu cho từng nền tảng trước khi xuất video.',
    presetNone: 'Mặc định',
    presetShorts: 'TikTok / Reels / Shorts',
    presetClearVoice: 'Lồng tiếng rõ giọng',
    presetKeepMusic: 'Giữ nhạc nền gốc',
    presetSubtitleFocus: 'Phụ đề nổi bật',
    customPresetLegend: '💾 Lưu Preset Cấu Hình Riêng',
    customPresetName: 'Tên preset cá nhân',
    customPresetNamePlaceholder: 'Ví dụ: Khải Hoàn Shorts Chuẩn',
    customPresetSaved: 'Danh sách preset đã lưu',
    presetApplied: 'Đã áp dụng preset: {name}'
  },
  en: {
    brandSubtitle: 'Batch Video Downloader, Subtitler & AI Dubbing Studio',
    cleanup: 'Clean old files',
    sourceTitle: 'Video Input Source',
    sourceDesc: 'Paste multiple video links for batch processing, or upload video files directly.',
    linksLabel: 'Video links or SRT link list',
    linksPlaceholder: 'Paste one or more video links (TikTok, Douyin, YouTube, Facebook, MP4...). One link per line.',
    videoFile: 'Local video file',
    srtFile: 'Existing SRT file',
    srtUrl: 'Separate SRT URL',
    setupTitle: 'Processing & Audio Setup',
    setupDesc: 'Configure video export mode, aspect ratio, and AI dubbing voices.',
    modeLegend: 'Video export mode',
    modeDub: '🎬 Subtitle + AI Dubbing',
    modeDownload: '⚡ Download / Merge Only',
    apiSummary: '🔑 AI APIs & Model Configuration',
    geminiKey: 'Gemini API Key (Subtitle Generator)',
    envPlaceholder: 'Leave blank to use .env file',
    geminiModel: 'Gemini Model',
    openaiKey: 'OpenAI API Key (Dubbing)',
    openaiModel: 'OpenAI TTS Model',
    rapidKey: 'RapidAPI Key (Douyin/TikTok Fallback)',
    rememberApi: 'Remember API keys in this browser',
    ttsLegend: '🎙️ TTS Server & AI Voices',
    statusTitle: 'Processing Progress',
    statusDesc: 'Watch real-time processing logs and status updates.',
    ready: 'Ready',
    queued: 'Queued',
    running: 'Processing',
    done: 'Done',
    error: 'Error',
    creatingVoice: 'Generating voice preview...',
    previewVoiceError: 'Could not generate voice preview',
    createJobError: 'Could not create processing job',
    cleanupConfirm: 'Delete all previous job files in data/jobs?',
    resultDone: 'Video processing completed!',
    resultDownload: 'Download exported video:',
    cleanupNote: 'Temporary files will be removed after {minutes} mins.',
    chooseFile: 'Choose file',
    noFileSelected: 'No file selected',
    filesSelected: '{count} files selected',
    apiCheckButton: '⚡ Test API Connection',
    apiChecking: 'Checking API keys...',
    apiCheckOk: 'APIs are ready.',
    apiCheckFail: 'Some APIs failed validation.',
    diskOk: 'Free disk space: {free}.',
    diskWarning: 'Low disk space: {free}. Consider cleaning up before long renders.',
    diskUnknown: 'Could not read disk space.',
    diskConfirm: 'Disk space is low. Do you want to continue?',
    historyTitle: 'Recently Completed Videos',
    historyRefresh: 'Refresh',
    historyEmpty: 'No completed videos yet.',
    historyDownload: 'Download Result',
    historyNoResult: 'No result file available',
    queueTitle: 'Batch Processing Queue',
    queueCount: '{count} videos in queue',
    outputDirLegend: '📂 Output Video Folder',
    outputDirLabel: 'Output directory path',
    outputDirPlaceholder: 'Leave empty to save inside default app folder',
    selectFolderBtn: '📁 Browse Folder',
    appUpdateTitle: 'Application Updates',
    engineUpdateTitle: 'Video Download Engine',
    ytdlpUpdateBtn: 'Update yt-dlp',
    ytdlpUpdating: 'Updating engine...',
    ytdlpUpdated: 'yt-dlp has been updated to latest version!',
    ytdlpUpdateFailed: 'Engine update failed: ',
    gitPullBtn: 'Update Now',
    gitPulling: 'Downloading update...',
    gitPullSuccess: 'Update completed! Please restart the application.',
    gitPullFailed: 'Update failed: ',
    updateCheck: 'Check',
    updateIdle: 'Not checked yet.',
    updateChecking: 'Checking updates...',
    updateLatest: 'You are on the latest version.',
    updateAvailable: 'New update available on GitHub.',
    updateFailed: 'Could not check for updates.',
    mixPreviewButton: '🎧 Preview Audio Mix',
    mixPreviewing: 'Generating audio mix preview...',
    mixPreviewReady: 'Audio mix preview is ready.',
    savePreset: '💾 Save Preset',
    loadPreset: '⚡ Apply',
    deletePreset: '🗑️ Delete',
    processTab: 'Processing Workflow',
    settingsTab: 'Settings & APIs',
    quickPresetTitle: 'Quick Presets',
    quickPresetDesc: 'Quickly select optimized configurations for your target platform.',
    presetNone: 'Default',
    presetShorts: 'TikTok / Reels / Shorts',
    presetClearVoice: 'Clear Voice Dub',
    presetKeepMusic: 'Keep Background Music',
    presetSubtitleFocus: 'Highlighted Subtitles',
    customPresetLegend: '💾 Custom Preset Storage',
    customPresetName: 'Custom Preset Name',
    customPresetNamePlaceholder: 'e.g., Khai Hoan Shorts Default',
    customPresetSaved: 'Saved Presets List',
    presetApplied: 'Applied preset: {name}'
  }
};

const extraI18n = {
  vi: { previewButton: '▶️ Phát giọng nói' },
  en: { previewButton: '▶️ Play Voice' }
};

function setLanguage(lang) {
  currentLang = lang === 'en' ? 'en' : 'vi';
  localStorage.setItem('vietdub-lang', currentLang);
  if (languageSelect) languageSelect.value = currentLang;
  const t = i18n[currentLang];
  
  setText('#cleanupBtn', t.cleanup);
  setText('.source-section .section-head h2', t.sourceTitle);
  setText('.source-section .section-head p', t.sourceDesc);
  setText('textarea[name="links"]', t.linksPlaceholder, 'placeholder');
  setText('.setup-section .section-head h2', t.setupTitle);
  setText('.setup-section .section-head p', t.setupDesc);
  setText('.segmented legend', t.modeLegend);
  setText('.segmented label:nth-child(2) span', t.modeDub);
  setText('.segmented label:nth-child(3) span', t.modeDownload);
  setText('#apiSettings summary', t.apiSummary);
  setText('.tts-settings legend', t.ttsLegend);
  setText('.status-head h2', t.statusTitle);
  setText('.status-head .helper-text', t.statusDesc);
  setText('#previewVoiceBtn', extraI18n[currentLang].previewButton);
  setText('#mixPreviewBtn', t.mixPreviewButton);
  setText('#apiCheckBtn', t.apiCheckButton);
  setText('.recent-box .history-head h3', t.historyTitle);
  setText('#refreshHistoryBtn', t.historyRefresh);
  setText('.queue-box .history-head h3', t.queueTitle);
  setText('.tab-btn[data-view="process"] span:last-child', t.processTab);
  setText('.tab-btn[data-view="settings"] span:last-child', t.settingsTab);
  setText('.quick-presets .section-head h2', t.quickPresetTitle);
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
  setText('.app-update-title', t.appUpdateTitle);
  setText('.engine-update-title', t.engineUpdateTitle);
  setText('.output-directory-box legend', t.outputDirLegend);
  setText('#outputDir', t.outputDirLabel, 'previous');
  setText('#outputDir', t.outputDirPlaceholder, 'placeholder');
  setText('#selectOutputDirBtn', t.selectFolderBtn);
  
  document.documentElement.lang = currentLang;
  translateOptions(t);
  updateFilePickers();
  updateBatchInspector();
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
  'kokoro-local': [
    ['diem_trinh', 'Diễm Trinh - Nữ Nam Bộ'],
    ['hung_thinh', 'Hưng Thịnh - Nam miền Nam'],
    ['mai_linh', 'Mai Linh - Nữ Hà Nội'],
    ['mai_loan', 'Mai Loan - Nữ ấm áp'],
    ['manh_dung', 'Mạnh Dũng - Nam trầm Bắc'],
    ['my_yen', 'Mỹ Yến - Nữ ngọt ngào'],
    ['ngoc_huyen', 'Ngọc Huyền - Nữ Bắc Bộ'],
    ['phat_tai', 'Phát Tài - Nam miền Tây'],
    ['thanh_dat', 'Thành Đạt - Nam Hà Nội'],
    ['thuc_trinh', 'Thục Trinh - Nữ truyền cảm'],
    ['tuan_ngoc', 'Tuấn Ngọc - Nam trầm ấm'],
    ['storyvert', 'Storyvert - Kể chuyện'],
    ['duc_an', 'Đức An - Nam nhẹ nhàng'],
    ['duc_duy', 'Đức Duy - Nam trẻ']
  ],
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
    diem_trinh: 'Diễm Trinh - Nữ Nam Bộ',
    hung_thinh: 'Hưng Thịnh - Nam miền Nam',
    mai_linh: 'Mai Linh - Nữ Hà Nội',
    mai_loan: 'Mai Loan - Nữ ấm áp',
    manh_dung: 'Mạnh Dũng - Nam trầm Bắc',
    my_yen: 'Mỹ Yến - Nữ ngọt ngào',
    ngoc_huyen: 'Ngọc Huyền - Nữ Bắc Bộ',
    phat_tai: 'Phát Tài - Nam miền Tây',
    thanh_dat: 'Thành Đạt - Nam Hà Nội',
    thuc_trinh: 'Thục Trinh - Nữ truyền cảm',
    tuan_ngoc: 'Tuấn Ngọc - Nam trầm ấm',
    storyvert: 'Storyvert - Kể chuyện',
    duc_an: 'Đức An - Nam nhẹ nhàng',
    duc_duy: 'Đức Duy - Nam trẻ',
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
    diem_trinh: 'Diem Trinh - Southern female',
    hung_thinh: 'Hung Thinh - Southern male',
    mai_linh: 'Mai Linh - Northern female',
    mai_loan: 'Warm female',
    manh_dung: 'Deep Northern male',
    my_yen: 'Sweet female',
    ngoc_huyen: 'Northern female',
    phat_tai: 'Western male',
    thanh_dat: 'Thanh Dat - Northern male',
    thuc_trinh: 'Expressive female',
    tuan_ngoc: 'Deep warm male',
    storyvert: 'Storyteller',
    duc_an: 'Soft male',
    duc_duy: 'Young male',
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
  const voices = voiceCatalog[ttsProvider.value] || voiceCatalog['kokoro-local'];
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
initLiveSubtitlePreview();
initBatchInspector();
loadDiskInfo();
loadHistory();

if (logs && logs.children.length === 0) {
  appendLog('VietDub AI Studio Pro v2.0 đã khởi động thành công.');
  appendLog('Dán danh sách link video hoặc chọn tệp để bắt đầu xử lý hàng loạt.');
}

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
    body.set('ttsProvider', document.querySelector('#ttsProvider')?.value || 'kokoro-local');
    body.set('voice', document.querySelector('#voice')?.value || 'diem_trinh');
    body.set('ttsStyle', document.querySelector('#ttsStyle')?.value || 'natural');
    body.set('ttsVolume', document.querySelector('#ttsVolume')?.value || '1.05');
    body.set('ttsSpeed', document.querySelector('#ttsSpeed')?.value || '0.9');
    body.set('originalVolume', String(Number(document.querySelector('#originalVolume')?.value || 52) / 100));
    body.set('openaiApiKey', document.querySelector('#openaiApiKey')?.value || '');
    body.set('openaiTtsModel', document.querySelector('#openaiTtsModel')?.value || 'gpt-4o-mini-tts');
    body.set('previewText', document.querySelector('#previewText')?.value || 'Xin chào, đây là giọng đọc thử nghiệm chất lượng cao của VietDub AI.');

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
gitPullBtn?.addEventListener('click', doGitPull);
updateYtdlpBtn?.addEventListener('click', updateYtdlp);
clearLogsBtn?.addEventListener('click', () => {
  if (logs) logs.innerHTML = '';
});

selectOutputDirBtn?.addEventListener('click', async () => {
  try {
    selectOutputDirBtn.disabled = true;
    const response = await fetch('/api/system/select-folder', { method: 'POST' });
    const data = await response.json();
    if (data.success && !data.canceled && data.path) {
      outputDirInput.value = data.path;
      saveOutputDir();
    } else if (!data.success) {
      alert(data.error || 'Không chọn được thư mục.');
    }
  } catch (error) {
    alert('Lỗi kết nối server: ' + error.message);
  } finally {
    selectOutputDirBtn.disabled = false;
  }
});

presetButtons.forEach((button) => button.addEventListener('click', () => applyQuickPreset(button.dataset.preset)));
savePresetBtn?.addEventListener('click', saveCustomPreset);
loadPresetBtn?.addEventListener('click', loadSelectedPreset);
deletePresetBtn?.addEventListener('click', deleteSelectedPreset);
mixPreviewBtn?.addEventListener('click', previewAudioMix);

/* ==========================================================================
   REAL-TIME BATCH VIDEO INSPECTOR & NUMBERING (#01, #02, #03...)
   ========================================================================== */

function initBatchInspector() {
  if (!linksInput) return;
  linksInput.addEventListener('input', updateBatchInspector);
  linksInput.addEventListener('change', updateBatchInspector);
  linksInput.addEventListener('paste', () => setTimeout(updateBatchInspector, 50));
  clearBatchDuplicatesBtn?.addEventListener('click', removeBatchDuplicates);
  updateBatchInspector();
}

function parseLinks(rawText) {
  return (rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateBatchInspector() {
  if (!linksInput || !batchInspectorBox || !batchInspectorList) return;
  const links = parseLinks(linksInput.value);

  if (links.length === 0) {
    batchInspectorBox.classList.add('hidden');
    if (batchCountBadge) batchCountBadge.classList.add('hidden');
    return;
  }

  batchInspectorBox.classList.remove('hidden');
  if (batchCountBadge) {
    batchCountBadge.classList.remove('hidden');
    batchCountBadge.textContent = currentLang === 'en' ? `🔢 ${links.length} videos` : `🔢 ${links.length} video`;
  }
  if (batchInspectorCount) {
    batchInspectorCount.textContent = `(${links.length} video)`;
  }

  batchInspectorList.innerHTML = '';
  links.forEach((url, idx) => {
    const li = document.createElement('li');
    li.className = 'batch-item-card';

    const numBadge = document.createElement('span');
    numBadge.className = 'batch-num-badge';
    numBadge.textContent = `#${String(idx + 1).padStart(2, '0')}`;

    const urlText = document.createElement('span');
    urlText.className = 'batch-item-url';
    urlText.title = url;
    urlText.textContent = getShortUrlDisplay(url);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'batch-item-remove';
    removeBtn.title = 'Xóa link này';
    removeBtn.innerHTML = '✕';
    removeBtn.addEventListener('click', () => removeLinkByIndex(idx));

    li.append(numBadge, urlText, removeBtn);
    batchInspectorList.appendChild(li);
  });
}

function getShortUrlDisplay(url) {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace('www.', '');
    let path = parsed.pathname;
    if (path.length > 25) path = path.slice(0, 22) + '...';
    return `${domain}${path}`;
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '...' : url;
  }
}

function removeLinkByIndex(index) {
  const links = parseLinks(linksInput.value);
  if (index >= 0 && index < links.length) {
    links.splice(index, 1);
    linksInput.value = links.join('\n');
    updateBatchInspector();
  }
}

function removeBatchDuplicates() {
  const links = parseLinks(linksInput.value);
  const uniqueLinks = Array.from(new Set(links));
  linksInput.value = uniqueLinks.join('\n');
  updateBatchInspector();
}

/* ==========================================================================
   LIVE SUBTITLE & WATERMARK SCREEN MOCKUP PREVIEW
   ========================================================================== */

function initLiveSubtitlePreview() {
  const fontSelect = document.querySelector('#subtitleFontSelect') || document.querySelector('select[name="subtitleFont"]');
  const sizeRange = document.querySelector('#subtitleSize');
  const bottomRange = document.querySelector('#subtitleBottomMargin');
  const bgSelect = document.querySelector('#subtitleBackground');
  const bgColorInput = document.querySelector('#subtitleBgColor');
  const bgOpacityRange = document.querySelector('#subtitleBgOpacity');
  const watermarkCheck = document.querySelector('#watermarkEnabled') || document.querySelector('input[name="watermarkEnabled"]');
  const watermarkPos = document.querySelector('#watermarkPositionSelect') || document.querySelector('select[name="watermarkPosition"]');
  const watermarkWidth = document.querySelector('#watermarkWidthPercent');
  const watermarkOpacity = document.querySelector('#watermarkOpacity');

  const controls = [fontSelect, sizeRange, bottomRange, bgSelect, bgColorInput, bgOpacityRange, watermarkCheck, watermarkPos, watermarkWidth, watermarkOpacity];
  controls.forEach((ctrl) => {
    ctrl?.addEventListener('input', updateSubtitleMockup);
    ctrl?.addEventListener('change', updateSubtitleMockup);
  });

  updateSubtitleMockup();
}

function updateSubtitleMockup() {
  const mockupSubtitle = document.querySelector('#mockupSubtitle');
  const mockupWatermark = document.querySelector('#mockupWatermark');
  if (!mockupSubtitle || !mockupWatermark) return;

  const font = document.querySelector('select[name="subtitleFont"]')?.value || 'segoe-ui';
  const size = Number(document.querySelector('#subtitleSize')?.value || 11);
  const bottom = Number(document.querySelector('#subtitleBottomMargin')?.value || 34);
  const bgType = document.querySelector('#subtitleBackground')?.value || 'none';
  const bgColor = document.querySelector('input[name="subtitleBgColor"]')?.value || '#000000';
  const bgOpacity = Number(document.querySelector('#subtitleBgOpacity')?.value || 65) / 100;

  const fontMap = {
    'segoe-ui': "'Segoe UI', sans-serif",
    'arial': 'Arial, sans-serif',
    'times-new-roman': "'Times New Roman', serif",
    'tahoma': 'Tahoma, sans-serif',
    'verdana': 'Verdana, sans-serif',
    'calibri': 'Calibri, sans-serif',
    'georgia': 'Georgia, serif'
  };

  mockupSubtitle.style.fontFamily = fontMap[font] || fontMap['segoe-ui'];
  mockupSubtitle.style.fontSize = `${Math.max(10, size * 0.95)}px`;
  mockupSubtitle.style.bottom = `${Math.min(180, Math.max(10, bottom * 0.85))}px`;

  if (bgType === 'box') {
    mockupSubtitle.style.backgroundColor = hexToRgba(bgColor, bgOpacity);
    mockupSubtitle.style.padding = '4px 10px';
    mockupSubtitle.style.borderRadius = '4px';
  } else {
    mockupSubtitle.style.backgroundColor = 'transparent';
    mockupSubtitle.style.padding = '0';
  }

  // Watermark Preview
  const watermarkEnabled = document.querySelector('input[name="watermarkEnabled"]')?.checked;
  const wmPos = document.querySelector('select[name="watermarkPosition"]')?.value || 'top-right';
  const wmWidth = Number(document.querySelector('#watermarkWidthPercent')?.value || 14);
  const wmOpacity = Number(document.querySelector('#watermarkOpacity')?.value || 85) / 100;

  if (watermarkEnabled) {
    mockupWatermark.classList.remove('hidden');
    mockupWatermark.style.opacity = wmOpacity;
    mockupWatermark.style.transform = `scale(${Math.max(0.7, wmWidth / 14)})`;
    mockupWatermark.style.top = '';
    mockupWatermark.style.bottom = '';
    mockupWatermark.style.left = '';
    mockupWatermark.style.right = '';

    if (wmPos === 'top-right') { mockupWatermark.style.top = '12px'; mockupWatermark.style.right = '12px'; }
    else if (wmPos === 'top-left') { mockupWatermark.style.top = '12px'; mockupWatermark.style.left = '12px'; }
    else if (wmPos === 'bottom-right') { mockupWatermark.style.bottom = '12px'; mockupWatermark.style.right = '12px'; }
    else if (wmPos === 'bottom-left') { mockupWatermark.style.bottom = '12px'; mockupWatermark.style.left = '12px'; }
    else if (wmPos === 'center') {
      mockupWatermark.style.top = '50%';
      mockupWatermark.style.left = '50%';
      mockupWatermark.style.transform = `translate(-50%, -50%) scale(${Math.max(0.7, wmWidth / 14)})`;
    }
  } else {
    mockupWatermark.classList.add('hidden');
  }
}

function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

/* ==========================================================================
   FORM SUBMISSION & BATCH RUNNER
   ========================================================================= */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveAiSettings();
  saveOutputDir();
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
      queuedJobs = queueItems.map((item, index) => ({
        ...item,
        status: 'queued',
        index: index + 1,
        title: item.link
      }));
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
        result.innerHTML = `<strong>${i18n[currentLang].resultDone}</strong><br><a href="${job.result.url}" download="${job.result.fileName}">📥 ${i18n[currentLang].resultDownload} ${job.result.fileName}</a>${cleanupNote}`;
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
  const links = parseLinks(linksInput?.value);
  const videoInput = form.querySelector('input[name="videos"]');
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
      appendLog(`[#${String(item.index).padStart(2, '0')}/${queuedJobs.length}] Bắt đầu xử lý: ${item.link}`);

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
        appendLog(`❌ Lỗi xử lý [#${String(item.index).padStart(2, '0')}]: ${error.message || error}`, true);
      }
    }
  } finally {
    queueRunning = false;
    submitBtn.disabled = false;
    renderQueue();
  }
}

/* ==========================================================================
   QUEUE & HISTORY RENDERING WITH NUMBERING BADGES
   ========================================================================== */

function renderQueue() {
  if (!jobQueue || !queueState) return;
  queueState.textContent = i18n[currentLang].queueCount.replace('{count}', queuedJobs.length);
  jobQueue.innerHTML = '';
  
  if (queuedJobs.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'helper-text';
    emptyLi.style.padding = '8px 0';
    emptyLi.textContent = currentLang === 'en' ? 'No active batch jobs.' : 'Chưa có job xử lý hàng loạt nào.';
    jobQueue.appendChild(emptyLi);
    return;
  }

  for (const item of queuedJobs) {
    const li = document.createElement('li');
    li.className = `queue-item-card ${item.status}`;

    const topDiv = document.createElement('div');
    topDiv.className = 'queue-item-top';

    const numSpan = document.createElement('span');
    numSpan.className = 'batch-num-badge';
    numSpan.textContent = `#${String(item.index).padStart(2, '0')}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'queue-item-title';
    titleSpan.title = item.link;
    titleSpan.textContent = getShortUrlDisplay(item.link);

    const statusPill = document.createElement('span');
    statusPill.className = `queue-item-status-pill ${item.status}`;
    statusPill.textContent = label(item.status);

    topDiv.append(numSpan, titleSpan, statusPill);
    li.appendChild(topDiv);
    jobQueue.appendChild(li);
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
    meta.textContent = `${label(item.status)} · ${new Date(item.createdAt).toLocaleTimeString()}`;
    li.append(title, meta);
    jobHistory.appendChild(li);
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

  const viewProcess = document.querySelector('#viewProcess');
  const viewSettings = document.querySelector('#viewSettings');

  if (normalized === 'process') {
    viewProcess?.classList.remove('hidden');
    viewSettings?.classList.add('hidden');
  } else {
    viewProcess?.classList.add('hidden');
    viewSettings?.classList.remove('hidden');
  }
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
    shorts: 'TikTok / Reels / Shorts',
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
  updateSubtitleMockup();
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
  updateSubtitleMockup();
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
  if (gitPullBtn) gitPullBtn.style.display = 'none';
  try {
    const response = await fetch('/api/system/update');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Server đang chạy bản cũ, hãy khởi động lại VietDub AI rồi kiểm tra lại.');
    }
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Update check failed');
    
    if (data.hasUpdate) {
      updateStatus.textContent = `${i18n[currentLang].updateAvailable} ${data.latestCommit?.slice(0, 7) || ''}`;
      if (gitPullBtn) gitPullBtn.style.display = 'inline-block';
    } else {
      updateStatus.textContent = `${i18n[currentLang].updateLatest} ${data.localCommit?.slice(0, 7) || ''}`;
    }
  } catch (error) {
    updateStatus.textContent = `${i18n[currentLang].updateFailed} ${error.message}`;
  }
}

async function doGitPull() {
  if (!gitPullBtn || !updateStatus) return;
  gitPullBtn.disabled = true;
  updateStatus.textContent = i18n[currentLang].gitPulling;
  try {
    const response = await fetch('/api/system/git-pull', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || (data.stderr ? data.stderr : 'Pull failed'));
    }
    updateStatus.textContent = i18n[currentLang].gitPullSuccess;
    gitPullBtn.style.display = 'none';
  } catch (error) {
    updateStatus.textContent = `${i18n[currentLang].gitPullFailed} ${error.message}`;
  } finally {
    gitPullBtn.disabled = false;
  }
}

async function updateYtdlp() {
  if (!updateYtdlpBtn || !ytdlpUpdateStatus) return;
  updateYtdlpBtn.disabled = true;
  ytdlpUpdateStatus.dataset.checked = '1';
  ytdlpUpdateStatus.textContent = i18n[currentLang].ytdlpUpdating;
  try {
    const response = await fetch('/api/system/ytdlp-update', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || (data.stderr ? data.stderr : 'Update failed'));
    }
    ytdlpUpdateStatus.textContent = i18n[currentLang].ytdlpUpdated;
  } catch (error) {
    ytdlpUpdateStatus.textContent = `${i18n[currentLang].ytdlpUpdateFailed} ${error.message}`;
  } finally {
    updateYtdlpBtn.disabled = false;
  }
}

function appendLog(message, error = false) {
  if (!message) return;
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  if (error) li.className = 'error';
  else if (message.includes('thành công') || message.includes('Hoàn tất') || message.includes('success')) li.className = 'success';
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

function syncRangeLabel(input) {
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
    'gemini-3.7-flash': 'Gemini 3.7 Flash - Latest (Recommended)',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro - Most accurate',
    'gemini-2.5-flash': 'Gemini 2.5 Flash - Fast',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash'
  } : {
    'gemini-3.7-flash': 'Gemini 3.7 Flash - Mới nhất (Khuyên dùng)',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro - Chính xác cao',
    'gemini-2.5-flash': 'Gemini 2.5 Flash - Siêu nhanh',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash'
  });
  setOptions('#openaiTtsModel', currentLang === 'en' ? {
    'gpt-4o-mini-tts': 'gpt-4o-mini-tts - Natural',
    'tts-1-hd': 'tts-1-hd - High quality',
    'tts-1': 'tts-1 - Fast'
  } : {
    'gpt-4o-mini-tts': 'gpt-4o-mini-tts - Tự nhiên',
    'tts-1-hd': 'tts-1-hd - Chất lượng cao',
    'tts-1': 'tts-1 - Nhanh'
  });
  setOptions('#ttsProvider', {
    'kokoro-local': currentLang === 'en' ? 'Kokoro TTS (Local Offline) - Fast' : 'Kokoro TTS (Local Offline) - Siêu nhanh',
    'edge-neural': currentLang === 'en' ? 'Microsoft Edge Neural - Free Online' : 'Microsoft Edge Neural - Miễn phí Online',
    'openai-tts': currentLang === 'en' ? 'OpenAI TTS - Most Natural' : 'OpenAI TTS - Tự nhiên nhất'
  });
  checkKokoroStatus();
  setOptions('#ttsStyle', currentLang === 'en' ? {
    natural: 'Natural, clear', friendly: 'Friendly, warm', cheerful: 'Bright, energetic', calm: 'Calm, gentle', serious: 'Serious, firm', story: 'Storytelling, expressive', news: 'Presenter, professional', soft: 'Soft, easy to hear'
  } : {
    natural: 'Tự nhiên, rõ chữ', friendly: 'Thân thiện, gần gũi', cheerful: 'Tươi sáng, có năng lượng', calm: 'Bình tĩnh, nhẹ nhàng', serious: 'Nghiêm túc, chắc giọng', story: 'Kể chuyện, có cảm xúc', news: 'Dẫn chương trình, chuyên nghiệp', soft: 'Mềm, nhẹ, dễ nghe'
  });
  setOptions('#subtitleBackground', currentLang === 'en' ? { none: 'No background', box: 'Box background' } : { none: 'Không nền (Viền chữ sắc nét)', box: 'Nền hộp (Box mờ)' });
  setOptions('select[name="watermarkPosition"]', currentLang === 'en' ? { 'top-right': 'Top right', 'top-left': 'Top left', 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left', center: 'Center' } : { 'top-right': 'Góc trên bên phải', 'top-left': 'Góc trên bên trái', 'bottom-right': 'Góc dưới bên phải', 'bottom-left': 'Góc dưới bên trái', center: 'Chính giữa video' });
  setOptions('select[name="cleanupDelayMinutes"]', currentLang === 'en' ? { 5: '5 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 180: '3 hours', 1440: '1 day' } : { 5: '5 phút', 15: '15 phút', 30: '30 phút', 60: '1 giờ', 180: '3 giờ', 1440: '1 ngày' });
}

function setOptions(selector, labels) {
  const select = document.querySelector(selector);
  if (!select) return;
  for (const option of select.options) {
    if (labels[option.value]) option.textContent = labels[option.value];
  }
}

async function checkKokoroStatus() {
  const select = document.querySelector('#ttsProvider');
  if (!select) return;
  const option = Array.from(select.options).find((opt) => opt.value === 'kokoro-local');
  if (!option) return;

  const alertBox = document.querySelector('#kokoroStatusAlert');
  const alertText = document.querySelector('#kokoroAlertText');
  const retryBtn = document.querySelector('#kokoroRetryBtn');

  try {
    const res = await fetch('/api/kokoro/status');
    const data = await res.json();
    if (data.success) {
      if (topStatusDot && topEngineText) {
        topStatusDot.className = `status-dot ${data.status}`;
        if (data.status === 'ready') topEngineText.textContent = 'Kokoro Sẵn sàng';
        else if (data.status === 'installing') topEngineText.textContent = 'Kokoro Đang cài...';
        else if (data.status === 'starting') topEngineText.textContent = 'Kokoro Khởi động...';
        else if (data.status === 'error') topEngineText.textContent = 'Kokoro Lỗi';
        else topEngineText.textContent = 'Kokoro Chưa chạy';
      }

      if (data.status === 'installing') {
        option.textContent = currentLang === 'en' ? 'Kokoro TTS (Installing...)' : 'Kokoro TTS (Đang cài đặt ngầm...)';
        option.disabled = true;
      } else if (data.status === 'starting') {
        option.textContent = currentLang === 'en' ? 'Kokoro TTS (Starting...)' : 'Kokoro TTS (Đang khởi động...)';
        option.disabled = true;
      } else if (data.status === 'ready') {
        option.textContent = currentLang === 'en' ? 'Kokoro TTS (Local Offline) - Ready' : 'Kokoro TTS (Local Offline) - Sẵn sàng';
        option.disabled = false;
      } else if (data.status === 'error') {
        option.textContent = currentLang === 'en' ? 'Kokoro TTS (Local Offline) - Error' : 'Kokoro TTS (Ngoại tuyến Local) - Lỗi cài đặt';
        option.disabled = false;
      } else {
        option.textContent = currentLang === 'en' ? 'Kokoro TTS (Local Offline) - Stopped' : 'Kokoro TTS (Local Offline) - Chưa khởi chạy';
        option.disabled = false;
      }

      if (alertBox && alertText && retryBtn) {
        if (data.status === 'installing') {
          alertBox.className = 'alert-box info';
          alertBox.classList.remove('hidden');
          alertText.innerHTML = currentLang === 'en'
            ? 'Downloading Kokoro models and libraries (2-5 mins)... <a href="http://localhost:3210/api/kokoro/status" target="_blank">Watch Logs</a>'
            : 'Đang tải mô hình & cài đặt ngầm Kokoro Việt Nam... <a href="http://localhost:3210/api/kokoro/status" target="_blank">Xem Logs chi tiết</a>';
          retryBtn.classList.add('hidden');
        } else if (data.status === 'starting') {
          alertBox.className = 'alert-box warning';
          alertBox.classList.remove('hidden');
          alertText.textContent = currentLang === 'en' ? 'Starting Kokoro Offline TTS server...' : 'Đang khởi chạy máy chủ lồng tiếng Kokoro chạy ngầm...';
          retryBtn.classList.add('hidden');
        } else if (data.status === 'error') {
          alertBox.className = 'alert-box error';
          alertBox.classList.remove('hidden');
          alertText.innerHTML = currentLang === 'en'
            ? 'Setup failed. Please check <a href="http://localhost:3210/api/kokoro/status" target="_blank">logs</a> or click <strong>Retry</strong>.'
            : 'Cài đặt lồng tiếng thất bại. Vui lòng bấm <a href="http://localhost:3210/api/kokoro/status" target="_blank">xem logs lỗi</a> hoặc click <strong>Thử lại</strong>.';
          retryBtn.classList.remove('hidden');
        } else if (data.status === 'ready') {
          alertBox.classList.add('hidden');
        } else {
          alertBox.className = 'alert-box warning';
          alertBox.classList.remove('hidden');
          alertText.innerHTML = currentLang === 'en'
            ? 'Kokoro Local Server is stopped. Click <button type="button" class="btn-link" id="kokoroStartInlineBtn">Start Server</button> to run.'
            : 'Máy chủ lồng tiếng Kokoro đang dừng. Bấm <button type="button" class="btn-link" id="kokoroStartInlineBtn">Khởi chạy máy chủ</button> để chạy.';
          
          document.querySelector('#kokoroStartInlineBtn')?.addEventListener('click', async () => {
            await fetch('/api/kokoro/retry', { method: 'POST' });
            checkKokoroStatus();
          });
          retryBtn.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra trạng thái Kokoro:', err);
  }
}

document.querySelector('#kokoroRetryBtn')?.addEventListener('click', async () => {
  const retryBtn = document.querySelector('#kokoroRetryBtn');
  if (retryBtn) retryBtn.disabled = true;
  try {
    await fetch('/api/kokoro/retry', { method: 'POST' });
    checkKokoroStatus();
  } catch (err) {
    console.error('Lỗi khi thử lại cài đặt Kokoro:', err);
  } finally {
    if (retryBtn) retryBtn.disabled = false;
  }
});

setInterval(checkKokoroStatus, 4000);
checkKokoroStatus();
