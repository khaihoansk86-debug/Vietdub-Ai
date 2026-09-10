# Bản 2.2.2

- Shell giới hạn 1440px và sidebar dùng cùng mốc căn giữa. Không có media mở rộng sidebar.
- Bỏ checkbox tiktokAutoUpload khỏi form, không gửi yêu cầu tự đăng sau render. Dropdown strategy thay bằng hidden distinct_random và nhãn 1:1 cố định.
- publish-policy-row ba cột và publish-fields hai cột, một cột trên mobile.

# Bản 2.2.1

- Bỏ media min-width 1800 làm tăng width/padding thanh bên xung đột với left mới. Test chồng lấn ở 1920/2560.
- POST history/refresh quét pending theo ID/kênh; UI gọi khi mở lịch sử và có nút quét lại. Không upload.
- DirectPublisher đặt account object sau spread result để tên account dạng string từ upload không ghi đè. Refresh phục hồi accountId thiếu từ URL khớp tài khoản hiện có.
- Đã quét hai bài thật và nâng success; giữ nguyên thao tác đăng và pipeline âm thanh.

# Bản chính thức 2.2.0

- Thanh bên cách mép 16px, theo lề shell trên màn rộng. Danh sách tài khoản giới hạn chiều cao và có chọn/bỏ chọn tất cả, ghi một lần qua API select-all.
- DirectPublisher thử lại AI tối đa một lần, upload chỉ thử lại lỗi mạng/timeout trước submitting. onStage submitting ghi needs_review vào lịch sử trước click; scan bỏ qua clip này để tránh gửi lại khi timeout.
- Kết quả processing được kiểm tra lại theo ID, cập nhật success khi đúng kênh và Everyone. Nếu TikTok còn xử lý vẫn ghi đúng trạng thái, không khẳng định công khai.
- Tổng kết số kênh công khai/đang xử lý/cần kiểm tra/thiếu clip. Bộ test 24 kênh và UI selection 24 tài khoản dùng profile tạm.
- Phát hành giữ duy nhất v2.2.0 trên GitHub theo yêu cầu; sao lưu refs/bundle trước khi dọn tag cũ. Không thay đổi dịch/TTS/render.

# Bản 2.1.5 — Lưu bài đang xử lý vào lịch sử

- DirectPublisher ghi cả success và processing có postId/postUrl. Processing được loại khỏi kho mới; không gắn nhãn Công khai khi TikTok còn xử lý.
- Lịch sử có nhãn trạng thái và liên kết bài, tự mở khi hoàn tất đăng; bộ đếm được làm mới từ lịch sử.
- recordPublishedVideo cho phép nâng processing lên success cùng postId mà không tạo bản ghi trùng.
- Đã khôi phục hai bài bị bỏ sót từ trạng thái app 2.1.4, đối chiếu ID trên Studio. Không upload lại.

# Bản 2.1.4 — Đăng trực tiếp, thay thế UI điều hành lượt

- Nút đăng gọi `POST /api/tiktok/warehouse/distribute`, trạng thái từ `GET /api/tiktok/warehouse/status`.
- `services/directPublisher.js` chọn từ `scanWarehouseVideos`, AI theo prompt, gọi uploadSingleAccount; bỏ prepare, preflight từng kênh và reserved của lượt cũ. Không đòi đủ video cho tất cả kênh.
- `public/publisher.js` chỉ quản lý nút đăng, trạng thái và nhật ký. Đã xóa bảng điều hành lượt khỏi HTML.
- Lịch sử success vẫn được ghi; lần gửi chưa rõ không ghi success và không tự retry trong cùng một cú bấm. Người dùng bấm đăng mới có thể chọn lại clip chưa có trong lịch sử success.
- Bộ điều phối cũ vẫn còn cho API tương thích và luồng tự đăng sau render, không dùng để phân bổ khi bấm nút đăng kho.

# Bản 2.1.3 — Đăng video một nút

- Tên thanh bên và cửa sổ: VietDub AI Studio.
- `warehouseDistributeBtn` tự gọi prepare rồi start sau một cú bấm Đăng video; không dừng chờ xem trước/xác nhận. Prompt, hashtag và cấu hình AI được truyền như cũ.
- Vẫn lưu tiến độ, kiểm tra chống trùng và xác minh công khai. Nút tiếp tục chỉ xuất hiện khi có phần chưa gửi cần phục hồi.
- Kiểm thử UI mô phỏng xác nhận một cú bấm gọi prepare/start đúng một lần, truyền prompt và không start khi chuẩn bị lỗi. Không đăng bài thật trong kiểm thử này.

# Bản vá 2.1.2 — 10/09/2026

- Đã quan sát trực tiếp DOM TikTok: quyền hiển thị dùng `video_visibility_container`, nhãn “Who can see this post”, nút combobox Everyone; hàng bài đăng dùng `data-tt="components_RowLayout_FlexRow"`.
- Đã sửa nhận diện quyền, danh sách rỗng và hàng bài trong `services/tiktokVerification.js`. Giữ nguyên kiểm tra bằng chứng và pipeline dịch/TTS.
- `npm run test:post` gồm 6 tình huống DOM hồi quy.
- Đã đăng thật qua Post + Post now, đối soát thành công bài công khai trên @khaihoanpharma. Lượt @khanhle5842 chưa có bằng chứng hoàn tất, giữ `needs_review`, không tự upload lại.

# Cập nhật bàn giao 2.1.1 — 10/09/2026

Phần này thay thế các mô tả tương ứng của 2.0.0 bên dưới. Xem `RELEASE_NOTES.md` để biết tính năng, kiểm thử và giới hạn nghiệm thu.

- `services/publishRuns.js`: bộ điều phối lưu bền, SHA-256 toàn file, giữ chỗ 1:1, khóa tiến trình, phục hồi, dừng/tiếp tục/thử lại/đối soát; ghi atomic JSON trước thao tác gửi.
- `services/tiktokVerification.js`: kiểm tra phiên/CAPTCHA, quyền Công khai, danh sách bài và bằng chứng đúng bài. Không coi toast, URL chuyển trang, “Only me” hoặc “Under review” là thành công.
- `services/tiktokPublisher.js`: Chrome có giao diện, đăng bài, metadata, kiểm tra video FFmpeg và tích hợp bộ điều phối mới. Giữ chuỗi Space → Escape → Escape → blur. Lịch sử mới lưu full SHA-256 và URL/ID bài.
- `public/publisher.js`, `public/studio.css`: Trung tâm xuất bản, bảng trạng thái, bản xem trước, điều khiển lượt, log và giao diện responsive. `public/app.js` vẫn phụ trách các control sản xuất/cài đặt cũ.
- API: `GET /api/tiktok/runs`, `POST /api/tiktok/runs/preview`, `POST /api/tiktok/runs/:id/{start,resume,pause,retry,reconcile,cancel}`. Endpoint distribute cũ hướng sang luồng xem trước.
- Data mới: `tiktok_publish_runs.json`, `tiktok_publish.lock`. Giữ nguyên account/profile/history hiện có. Bài chưa rõ kết quả luôn giữ chỗ và chỉ đối soát.
- Phân phối mới chỉ Public + 1:1. Video lỗi, thiếu video riêng biệt, chưa đăng nhập hoặc lỗi AI sẽ được báo trước khi đăng.
- Pipeline dịch/lồng tiếng thực tế nằm trong `server.js`; repository tại thời điểm này chỉ có module TikTok và các module mới trong `services/`, không có các file videoProcessor/audioService/geminiService như sơ đồ 2.0 mô tả. Mã pipeline được giữ nguyên.
- `npm test`, `npm run test:ui`, `node scripts/smoke-packaged.mjs` là các lệnh kiểm tra mới. Biến `VIETDUB_SKIP_KOKORO_AUTOSTART=1` chỉ dùng trong smoke test; chạy thông thường vẫn giữ tự khởi động Kokoro.
- Release: tăng phiên bản và tạo tag mới `v2.1.1`, không force-move tag `v2.0.0`. CI tiếp tục Windows NSIS + macOS arm64 DMG, có test và checksum.
- Chưa chạy đăng thật lên TikTok; kiểm thử DOM dùng dữ liệu mô phỏng. Không xem kết quả test như bảo đảm TikTok DOM không thay đổi.

---

# Tài liệu lịch sử 2.0.0 (tham khảo)

# 📘 TÀI LIỆU BÀN GIAO DỰ ÁN TOÀN DIỆN (HANDOFF FOR CODEX AGENT)
# DỰ ÁN: VIETDUB AI STUDIO PRO (v2.0.0)

> **Dành cho Agent tiếp quản (Codex / Antigravity Agent):**
> Tài liệu này mô tả toàn bộ kiến trúc, logic nghiệp vụ, cấu trúc mã nguồn, quy trình tự động hóa và các hướng dẫn vận hành của dự án **VietDub AI Studio Pro**. Đọc kỹ tài liệu này trước khi thực hiện bất kỳ chỉnh sửa nào trên codebase.

---

## 📌 1. THÔNG TIN ĐỊNH DANH & MÔI TRƯỜNG DỰ ÁN

* **Tên ứng dụng:** VietDub AI Studio Pro
* **Phiên bản hiện tại:** `2.0.0` (Mã commit mới nhất: `dfd6b4a`)
* **Thư mục làm việc cốt lõi (Workspace):** `D:\Project Anti\Vietdub AI`
* **Kho lưu trữ GitHub (Remote):** `https://github.com/khaihoansk86-debug/Vietdub-Ai.git` (Nhánh chính: `main`)
* **Trang GitHub Releases:** `https://github.com/khaihoansk86-debug/Vietdub-Ai/releases/tag/v2.0.0`
* **Thư mục dữ liệu AppData thực tế trên Windows:**
  `C:\Users\datdt\AppData\Roaming\vietdub-ai-local\data`
* **Kho video nguồn thử nghiệm:** `G:\My Drive\VietDubAI` *(LƯU Ý QUAN TRỌNG: TUYỆT ĐỐI KHÔNG XÓA HOẶC SỬA FILE TRONG THƯ MỤC NÀY)*.

---

## 🏛️ 2. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

VietDub AI là ứng dụng hybrid kết hợp giữa **Node.js Express Server**, **Electron Desktop Shell**, **Vanilla JS SPA** và **Playwright Automation Engine**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                     VIETDUB AI STUDIO PRO (v2.0.0)                     │
├───────────────────────────────┬────────────────────────────────────────┤
│  FRONTEND (Vanilla JS SPA)    │  DESKTOP SHELL (Electron 42.x)         │
│  - public/index.html          │  - electron/main.cjs                   │
│  - public/app.js              │  - System Tray, Window Management      │
│  - public/style.css           │  - Native File Dialogs                 │
├───────────────────────────────┴────────────────────────────────────────┤
│  BACKEND SERVER (Node.js ESM + Express.js - Port 3210)                 │
│  - server.js (REST API, SSE Realtime Log Stream, Task Queue)           │
├───────────────────────────────┬────────────────────────────────────────┤
│  MEDIA PROCESSING MODULE      │  TIKTOK BULK PUBLISHER AUTOMATION      │
│  - FFmpeg (ffmpeg-static)     │  - services/tiktokPublisher.js         │
│  - yt-dlp (yt-dlp-exec)       │  - Playwright-Core (System Chrome)     │
│  - Whisper / Gemini Speech    │  - Isolated User Data Profiles         │
│  - Edge-TTS / Kokoro / Gemini │  - Anti-Duplicate Binary Fingerprinting │
│  - Subtitle Alignment & Remux │  - 1:1 Warehouse Smart Distribution    │
│                               │  - Locked Public Post Engine           │
└───────────────────────────────┴────────────────────────────────────────┘
```

---

## ⚙️ 3. CÁC MODULE CHỨC NĂNG & LOGIC CỐT LÕI (CORE MODULES)

### 🚀 MODULE 1: TỰ ĐỘNG HÓA ĐĂNG BÀI TIKTOK THƯƠNG MẠI (`services/tiktokPublisher.js`)

Đây là module phức tạp và quan trọng nhất của hệ thống, phục vụ mục đích thương mại có thể quản lý số lượng lớn tài khoản TikTok và số lượng lớn video trong kho:

#### 1. Quản Lý Đa Kênh & Cách Ly Profile (Multi-Account Isolation)
- Mỗi tài khoản TikTok có một thư mục Profile Chrome riêng biệt trong AppData:
  `data/tiktok_profiles/<account_id>`
- Phiên làm việc (Cookies, LocalStorage, Cache) của các kênh hoàn toàn độc lập, không bao giờ bị đè phiên hay xung đột.
- Tự động xóa file `SingletonLock` trước khi mở Chrome để chống lỗi lock trình duyệt khi bị tắt đột ngột.
- Hỗ trợ đăng nhập qua 3 chế độ: Google/Gmail OAuth, SĐT/Email, và Quét mã QR (`launchBrowserForLogin`).
- Tự động trích xuất `@username` và tên hiển thị kênh từ Chrome History và SQLite Cookies (`syncChannelUsername`).

#### 2. Phân Bổ Kho Video 1:1 Độc Quyền (`distributeWarehouseVideos`)
- Quét kho video định dạng `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi` (`scanWarehouseVideos`).
- **Chống trùng 2 lớp (`isAlreadyPublished`):** 
  - Tính mã băm `SHA-256` của phần Header + Footer + File Size (`computeVideoFingerprint`).
  - Đối chiếu với lịch sử `tiktok_publish_history.json`. Dù người dùng đổi tên file, tool vẫn nhận diện chính xác và bỏ qua.
- **Phân phối 1:1 (`distinct_random`):**
  - Xáo trộn danh sách video mới bằng thuật toán Fisher-Yates.
  - Lấy `limit = Math.min(shuffledVideos.length, selectedAccounts.length)`.
  - **Mỗi kênh nhận đúng 1 video riêng biệt**, tuyệt đối không trùng video trong 1 lượt chạy.
  - Các video còn lại trong kho được giữ nguyên trạng thái "Video mới" (Fresh) cho các đợt chạy tiếp theo.

#### 3. Trí Tuệ Nhân Tạo Sinh Nội Dung Độc Bản (AI Metadata Engine)
- **Tự động nhận diện ngữ cảnh video thực tế (`resolveVideoContext`):**
  - Tích hợp `yt-dlp-exec`: Nếu tên file chứa YouTube ID (ví dụ: `youtube_NPobjvv2zrs.mp4`), hệ thống tự động fetch tiêu đề gốc tiếng Việt có dấu chuẩn UTF-8 trong 1-2 giây.
  - Tự động đọc file phụ đề hoặc transcript kèm theo (`.srt`, `.vtt`, `.txt`).
- **Tạo Metadata độc bản (`generateTikTokMetadata`):**
  - Truyền `accountName` và `accountUsername` vào prompt để định hình phong cách cho từng kênh.
  - Bổ sung quy tắc chống rập khuôn nghiêm ngặt, cấm các câu mở đầu sáo rỗng (*"Ủa alo..."*, *"Xem quả clip..."*).
  - Sử dụng `temperature: 0.85` kèm random seed để mỗi lần sinh nội dung là hoàn toàn duy nhất.

#### 4. Quy Trình Xuất Bản Khóa Mặc Định Đăng Công Khai (`handleTikTokPostSubmission`)
> [!IMPORTANT]
> **Quy tắc bất biến:** Toàn bộ hệ thống (UI, API, Engine) **ĐÃ LOẠI BỎ TRIỆT ĐỂ** chế độ "Lưu nháp" và "Chỉ mình tôi". Mặc định **100% là Đăng Công Khai (Public Post)**.

- **Giải phóng Popup Hashtag Autocomplete:**
  - Sau khi gõ Caption & Hashtag vào editor, tool lập tức gửi chuỗi lệnh:
    `page.keyboard.press('Space')` $\rightarrow$ `Escape` $\rightarrow$ `Escape` $\rightarrow$ `document.activeElement.blur()`.
  - Giúp đóng ngay menu gợi ý hashtag của TikTok Studio, ngăn chặn việc menu che khuất nút Đăng ở chân trang.
- **Định vị nút Post chuẩn xác:**
  - Cuộn trang xuống đáy: `window.scrollTo(0, document.body.scrollHeight)`.
  - Tìm nút Post submit chân trang bằng `getByRole('button', { name: /^(Post|Đăng)$/i, exact: true })`, loại trừ hoàn toàn menu "Posts" ở thanh sidebar.
- **Chờ Upload 100%:**
  - Chờ nút Post sáng lên (`isEnabled()`) với thời gian chờ tối ưu lên đến **90 giây** (hỗ trợ video dung lượng lớn).
- **Vượt qua cảnh báo kiểm tra bản quyền TikTok Studio:**
  - Tự động bắt hộp thoại *"Continue to post? The copyright check is incomplete..."* và click ngay nút **"Post now" / "Đăng ngay"** (`postNowByRole = page.getByRole('button', { name: /^(Post now|Đăng ngay|Post anyway|Vẫn đăng)$/i })`).
- **Cơ chế xác minh 2 lớp (Double-Check Confirmation):**
  - Sau khi bấm Post, nếu sau 30 giây trình duyệt chưa chuyển trang, tool tự động điều hướng sang `https://www.tiktok.com/tiktokstudio/content?tab=post` để kiểm tra danh sách bài đăng thực tế.
  - Chỉ khi video đã hiển thị trên kênh mới đánh dấu `status: 'success'` và lưu vào lịch sử. Nếu không, báo lỗi rõ ràng và giữ video lại trong kho.
- **Giải phóng tài nguyên tuần tự:**
  - Chạy tuần tự từng kênh: Mở Chrome $\rightarrow$ Đăng $\rightarrow$ Đóng Chrome giải phóng RAM $\rightarrow$ Chờ delay giữa các kênh (`channelDelaySeconds`, mặc định 6-20s) $\rightarrow$ Mở kênh kế tiếp. Giúp máy tính chạy 50-100 kênh mà RAM luôn ổn định dưới 800MB.

---

### 🎬 MODULE 2: PIPELINE XỬ LÝ VIDEO & LỒNG TIẾNG (`services/videoProcessor.js` & `server.js`)

Quy trình tự động hóa tải, dịch, tạo giọng nói và dựng video:
1. **Download:** Tải video từ YouTube / Link trực tiếp qua `yt-dlp`.
2. **Audio Extraction:** Tách luồng âm thanh gốc bằng `ffmpeg` (`-vn -acodec pcm_s16le`).
3. **Voice Separation / Whisper:** Nhận diện lời thoại thành các cue thời gian (timestamps).
4. **Translation (Gemini API):** Dịch phụ đề sang tiếng Việt tự nhiên, chuẩn văn phong hội thoại.
5. **Text-To-Speech (TTS):** 
   - Hỗ trợ Edge-TTS (miễn phí, chất lượng cao: `vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`), Kokoro TTS hoặc Gemini TTS.
   - Cơ chế căn chỉnh nhịp độ tự động (`MAX_TTS_TEMPO = 1.30`) để khớp khẩu hình và thời lượng từng đoạn câu.
6. **Video Rendering (FFmpeg Remuxing):**
   - Ghép âm thanh lồng tiếng mới, làm nhỏ âm thanh nền gốc (ducking), xuất video 1080x1920 60fps chuẩn TikTok/Reels/Shorts.

---

### 💻 MODULE 3: GIAO DIỆN & TƯƠNG TÁC NGƯỜI DÙNG (`public/`)

- **Kiến trúc Accordion:** Giao diện chia thành các phân vùng chính có thể thu gọn / phóng to để người dùng không bị rối:
  1. *Cấu hình API & Giọng đọc AI*
  2. *Kho Video Tự Động (Warehouse Manager)*
  3. *Quản Lý Kênh TikTok (Channel Multi-Account Manager)*
  4. *Quản Lý Prompt Mẫu Bài Viết (Prompt Presets Manager)*
  5. *Terminal Log Realtime (SSE Stream)*
- **Realtime Logs:** Kết nối Server-Sent Events `/api/logs/stream` giúp người dùng theo dõi từng hành động của bot trực tiếp trên màn hình.
- **Custom Modals:** Toàn bộ popup thông báo (xác nhận phân phối, thêm kênh, đổi tên kênh, thông báo hoàn thành) đều dùng HTML/CSS modal chuyên nghiệp, không dùng `alert()` hay `confirm()` nguyên thủy của trình duyệt.

---

## 📁 4. CẤU TRÚC THƯ MỤC CHI TIẾT (PROJECT DIRECTORY TREE)

```
D:\Project Anti\Vietdub AI\
├── .github/
│   └── workflows/
│       └── build.yml               # GitHub Actions CI/CD (Build Windows NSIS & macOS DMG khi push tag v*)
├── electron/
│   └── main.cjs                    # Entry point Electron Desktop, quản lý lifecycle, dialog, tray
├── public/
│   ├── index.html                  # Giao diện chính của ứng dụng SPA
│   ├── app.js                      # Logic client-side, event listeners, API fetch, SSE logs, modals
│   └── style.css                   # Toàn bộ CSS giao diện, Dark theme hiện đại, Responsive
├── services/
│   ├── tiktokPublisher.js          # Trái tim module TikTok Publisher & Studio Automation
│   ├── videoProcessor.js           # Xử lý video, Whisper, FFmpeg remuxing
│   ├── audioService.js             # Xử lý TTS, Edge-TTS, căn chỉnh tempo
│   └── geminiService.js            # Tích hợp Google Gemini API
├── dist/                           # Thư mục chứa các file build phát hành (.exe, .blockmap)
│   ├── VietDub-AI-Setup-2.0.0.exe  # Bộ cài đặt Windows chính thức v2.0.0 (~143 MB)
│   └── win-unpacked/               # Bản unpacked portable để chạy thử nhanh
├── data/                           # Thư mục dữ liệu runtime dự phòng (nếu không có AppData)
├── package.json                    # Cấu hình dự án, electron-builder, dependencies, scripts
├── server.js                       # Express Server trung tâm (Port 3210), REST API routes, job queue
├── handoff.md                      # Tài liệu bàn giao này
└── walkthrough.md                  # Nhật ký nghiệm thu và kiểm thử các đợt cập nhật
```

---

## 💾 5. DỮ LIỆU LƯU TRỮ TRÊN MÁY TÍNH (APPDATA RUNTIME)

Khi ứng dụng chạy trên Windows, toàn bộ dữ liệu cấu hình và phiên đăng nhập được lưu tại:
`C:\Users\datdt\AppData\Roaming\vietdub-ai-local\data\`

Các file và thư mục quan trọng bên trong:
1. **`tiktok_accounts.json`**: Mảng JSON chứa danh sách các tài khoản TikTok đã thêm:
   ```json
   [
     {
       "id": "acc_1788927499861",
       "name": "Kênh TikTok 1",
       "username": "@khanhle5842",
       "folder": "tiktok_profiles/acc_1788927499861",
       "selected": true,
       "loggedIn": true
     }
   ]
   ```
2. **`tiktok_publish_history.json`**: Lịch sử các video đã đăng thành công, dùng để chống trùng:
   ```json
   [
     {
       "id": "pub_1789002598811",
       "fileName": "youtube_NPobjvv2zrs.mp4",
       "fileHash": "9b12a8...f42",
       "videoPath": "G:\\My Drive\\VietDubAI\\youtube_NPobjvv2zrs.mp4",
       "accountId": "acc_1788927499861",
       "accountName": "Kênh TikTok 1",
       "accountUsername": "@khanhle5842",
       "caption": "...",
       "hashtags": ["#fyp", "#xuhuong"],
       "postMode": "public",
       "publishedAt": "2026-09-10T01:10:00.000Z",
       "status": "success"
     }
   ]
   ```
3. **`tiktok_profiles/`**: Thư mục chứa từng Chrome User Data Directory riêng biệt cho từng kênh.

---

## 🛠️ 6. CÁC LỆNH VẬN HÀNH, TEST & DEPLOY (COMMAND CHEATSHEET)

### 1. Khởi động và kiểm tra mã nguồn
```powershell
# Di chuyển vào thư mục dự án
cd "D:\Project Anti\Vietdub AI"

# Kiểm tra cú pháp toàn bộ file quan trọng (không được có lỗi cú pháp)
npm run check

# Khởi chạy Express Backend độc lập
npm start

# Khởi chạy ứng dụng dạng Desktop (Electron)
npm run desktop
```

### 2. Đóng gói bộ cài đặt (Build Release)
```powershell
# Build bộ cài đặt Windows (File sinh ra tại dist/VietDub-AI-Setup-2.0.0.exe)
npm run build:win

# Build bộ cài đặt macOS (Chỉ chạy được trên môi trường macOS thật hoặc qua GitHub Actions)
npm run build:mac
```

### 3. Quy trình Đẩy Code, Cập Nhật Tag & Kích Hoạt CI/CD Tự Động
Hệ thống sử dụng GitHub Actions (`.github/workflows/build.yml`) để tự động đóng gói cả **Windows (`.exe`)** và **macOS (`.dmg` arm64)** mỗi khi cập nhật Git Tag:

```powershell
# 1. Kiểm tra trạng thái git
git status

# 2. Stage và commit thay đổi
git add .
git commit -m "feat(module): mô tả tính năng hoặc bản sửa lỗi"

# 3. Đẩy code lên nhánh main
git push origin main

# 4. Cập nhật và đẩy đè Git Tag để kích hoạt GitHub Actions build macOS + Windows
git tag -f v2.0.0 HEAD
git push origin v2.0.0 --force

# 5. Theo dõi tiến trình build CI/CD trên GitHub
gh run list
gh run view <run-id>
```

---

## 🎯 7. LƯU Ý KỸ THUẬT QUAN TRỌNG CHO CODEX AGENT

1. **Tuyệt đối không khôi phục chế độ Lưu Nháp / Đăng Chỉ Mình Tôi:**
   - Khách hàng đã yêu cầu chuẩn hóa toàn diện cho thương mại: 100% video xuất bản phải là **Đăng Công Khai (Public Post)**.
2. **Quy tắc bảo vệ kho video nguồn:**
   - Tuyệt đối không xóa, di chuyển hay sửa đổi file trong `G:\My Drive\VietDubAI` hoặc các thư mục kho video của người dùng. Mọi thao tác chỉ là đọc (`read-only`).
3. **Bẫy Hashtag Autocomplete trên TikTok Studio:**
   - Bất cứ khi nào can thiệp vào logic gõ caption/hashtags, **bắt buộc** phải giữ nguyên khối lệnh gửi phím `Space`, `Escape`, `Escape` và `blur()`. Nếu bỏ khối này, popup gợi ý của TikTok sẽ che mất nút Đăng và làm treo tiến trình submit.
4. **Trình duyệt Chrome:**
   - Hệ thống ưu tiên khởi chạy Google Chrome thật của máy tính (`channel: 'chrome'`) với các cờ bypass automation detection (`--disable-infobars`, cờ evasions). Không được chuyển sang Chromium headless vì TikTok Studio sẽ chặn ngay lập tức.
5. **Danh sách Skills nên sử dụng khi làm việc tiếp:**
   - `error-handling`: Khi cần bổ sung cơ chế retry hoặc bắt lỗi mạng/DOM.
   - `ui-ux-pro-max`: Khi cần tinh chỉnh giao diện người dùng, màu sắc, bố cục CSS.
   - `agent-introspection-debugging`: Khi cần tự chẩn đoán và phân tích nguyên nhân lỗi logic.
