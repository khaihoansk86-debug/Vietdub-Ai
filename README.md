# VietDub AI Studio

**Sản xuất video, lồng tiếng tiếng Việt và quản lý xuất bản TikTok trong một ứng dụng desktop.**

VietDub AI kết hợp tải video, xử lý phụ đề, tạo giọng đọc và xuất bản nhiều kênh. Trung tâm xuất bản giúp xem trước nội dung, phân bổ mỗi kênh một video riêng và theo dõi đến bước xác nhận Công khai.

[![Build and Release](https://github.com/khaihoansk86-debug/Vietdub-Ai/actions/workflows/build.yml/badge.svg)](https://github.com/khaihoansk86-debug/Vietdub-Ai/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/khaihoansk86-debug/Vietdub-Ai)](https://github.com/khaihoansk86-debug/Vietdub-Ai/releases/latest)

[Tải ứng dụng](https://github.com/khaihoansk86-debug/Vietdub-Ai/releases/latest) · [Ghi chú phát hành](RELEASE_NOTES.md) · [Báo lỗi](https://github.com/khaihoansk86-debug/Vietdub-Ai/issues)

## Tải và cài đặt

Phiên bản hiện tại: **2.1.2**.

| Nền tảng | Bộ cài |
| --- | --- |
| Windows x64 | [VietDub-AI-Setup-2.1.2.exe](https://github.com/khaihoansk86-debug/Vietdub-Ai/releases/download/v2.1.2/VietDub-AI-Setup-2.1.2.exe) |
| macOS Apple Silicon — arm64 | [VietDub-AI-2.1.2-macOS-arm64.dmg](https://github.com/khaihoansk86-debug/Vietdub-Ai/releases/download/v2.1.2/VietDub-AI-2.1.2-macOS-arm64.dmg) |

Trang release có tệp `SHA256SUMS` để đối chiếu tính toàn vẹn bộ cài. Hiện chưa cung cấp bộ cài cho Mac Intel.

1. Cài ứng dụng phù hợp với hệ điều hành.
2. Mở **Cài đặt & API**, cấu hình dịch vụ AI cần sử dụng.
3. Chọn **Sản xuất video** để xử lý nội dung hoặc **Xuất bản TikTok** để quản lý lượt đăng.

Bộ cài đã đóng gói Electron/Node.js, FFmpeg và yt-dlp. Các tính năng sau cần thêm thành phần tương ứng:

| Thành phần | Khi nào cần |
| --- | --- |
| Google Chrome | Đăng nhập và tự động hóa TikTok Studio |
| Gemini API key | Tạo/dịch phụ đề và tạo caption AI cho lượt đăng từ kho |
| OpenAI API key | Khi chọn OpenAI TTS |
| Python và `edge-tts` | Khi chọn Microsoft Edge Neural |
| Python, Git và môi trường Kokoro | Khi dùng Kokoro local; ứng dụng có quy trình thiết lập backend |
| Internet | Tải video, gọi dịch vụ AI trực tuyến và đăng TikTok |

## Tính năng

### Sản xuất video

- Nhập danh sách liên kết hoặc video/SRT từ máy tính.
- Tải và ghép clip, tạo/dịch phụ đề bằng Gemini.
- Lồng tiếng với **Kokoro local**, **Microsoft Edge Neural** hoặc **OpenAI TTS**.
- Căn nhịp giọng đọc theo từng đoạn; điều chỉnh âm lượng giọng và âm thanh gốc.
- Tùy chỉnh phụ đề, watermark và khung hình đầu ra.
- Theo dõi hàng đợi, nhật ký và video đã hoàn tất.

### Xuất bản TikTok

- Quản lý nhiều kênh với profile Chrome riêng biệt.
- Phân bổ **1:1**: mỗi kênh nhận một video riêng trong lượt đăng.
- Chống trùng bằng SHA-256 toàn file, tương thích lịch sử fingerprint cũ.
- Xem trước kênh, video, caption và hashtag trước khi bắt đầu.
- Kiểm tra video, Chrome, phiên đăng nhập và nội dung AI trước khi đăng.
- Lưu trạng thái để phục hồi khi ứng dụng hoặc kết nối bị gián đoạn.
- Dừng sau kênh hiện tại, tiếp tục phần chưa gửi, thử lại mục lỗi và đối soát bài đã gửi.
- Lưu URL/ID bài khi xác minh được kết quả; giữ nguyên kho video nguồn.

### Không gian làm việc

Giao diện chia thành các màn hình xuất bản, sản xuất và cài đặt. Bảng điều hành có số liệu tổng quan, bộ lọc trạng thái, nhật ký từng video và liên kết mở bài đăng. Hỗ trợ giao diện sáng/tối và bố cục responsive.

## Quy trình đăng Công khai 1:1

```mermaid
flowchart LR
    A[Chọn kênh và kho video] --> B[Kiểm tra sẵn sàng]
    B --> C[Xem trước phân bổ và caption]
    C --> D[Bắt đầu đăng Công khai]
    D --> E[Xác minh bài đăng]
    E --> F[Đã công khai]
    E --> G[Cần đối soát hoặc đang xử lý]
```

1. **Chuẩn bị kênh:** thêm tài khoản, đăng nhập qua Chrome, đóng cửa sổ đăng nhập và đồng bộ kênh.
2. **Chọn nguồn:** chọn kênh nhận và thư mục video. Các video đã đăng hoặc đang giữ chỗ trong lượt khác được loại khỏi phân bổ mới.
3. **Tạo bản xem trước:** chọn **Kiểm tra & tạo lượt đăng**. Kho cần đủ video riêng biệt cho số kênh được chọn.
4. **Kiểm tra nội dung:** xem caption/hashtag trong bảng, sau đó chọn **Bắt đầu đăng công khai**.
5. **Theo dõi:** các kênh chạy tuần tự, có thời gian chờ và nhật ký từng video.

| Trạng thái | Thao tác phù hợp |
| --- | --- |
| Chờ đăng | Bắt đầu hoặc tiếp tục phần chưa gửi |
| Đang tải / Đang gửi / Đang xác minh | Theo dõi hoặc yêu cầu dừng sau kênh hiện tại |
| Đã công khai | Mở liên kết bài đã xác nhận |
| TikTok đang xử lý | Đối soát lại khi TikTok xử lý xong |
| Cần đối soát | Kiểm tra bài đã gửi; không tự tải video lên lại |
| Cần thao tác | Xử lý đăng nhập/CAPTCHA trong Chrome, đóng cửa sổ rồi thử lại mục lỗi |
| Chưa gửi · Có lỗi | Khắc phục nguyên nhân rồi thử lại mục lỗi |

**Ứng dụng chỉ xuất bản ở chế độ Công khai.** Việc chuyển trang hoặc xuất hiện thông báo thành công chưa đủ để ghi nhận kết quả. Bộ xác minh đối chiếu nội dung, kênh, ID bài mới và quyền hiển thị; nếu chưa rõ, ứng dụng dừng hoặc yêu cầu đối soát.

## Chạy từ mã nguồn

Cần Node.js **20 trở lên**, npm và Git. Cài thêm Python/dependency của TTS và Google Chrome theo tính năng sử dụng.

```powershell
git clone https://github.com/khaihoansk86-debug/Vietdub-Ai.git
cd Vietdub-Ai
npm ci
npm run desktop
```

Chạy backend và giao diện web local:

```powershell
npm start
```

Mở [http://127.0.0.1:3210](http://127.0.0.1:3210). Bản Electron tự chọn cổng trống bắt đầu từ `3210`.

### Cấu hình API

Nhập khóa trong **Cài đặt & API**, hoặc tạo `.env` dựa trên `.env.example` khi chạy từ source. Chọn model khả dụng trong tài khoản của bạn.

```dotenv
HOST=127.0.0.1
PORT=3210
GEMINI_API_KEY=
GEMINI_MODEL=
OPENAI_API_KEY=
OPENAI_TTS_MODEL=gpt-4o-mini-tts
RAPIDAPI_KEY=
```

Nếu sao chép `.env.example`, đổi `HOST=0.0.0.0` trong tệp mẫu thành `HOST=127.0.0.1` để chỉ truy cập server trên máy. API local hiện chưa có cơ chế đăng nhập dành cho triển khai công khai.

Cài dependency Edge TTS nếu cần:

```powershell
python -m pip install edge-tts
```

Không đưa `.env`, API key, profile Chrome hoặc dữ liệu tài khoản lên Git. Chế độ chỉ tải/ghép video không yêu cầu dịch vụ AI; nhu cầu API phụ thuộc chế độ xử lý đã chọn.

## Dữ liệu và phục hồi

Bản desktop lưu dữ liệu tách khỏi thư mục cài đặt:

| Môi trường | Vị trí mặc định |
| --- | --- |
| Windows desktop | `%APPDATA%\vietdub-ai-local\data` |
| macOS desktop | `~/Library/Application Support/vietdub-ai-local/data` |
| Backend từ source | `data/` cho job; module TikTok trên Windows ưu tiên data AppData đã tồn tại |

Biến `VIETDUB_DATA_DIR` cho phép chỉ định chung thư mục runtime khi cần.

| Dữ liệu | Nội dung |
| --- | --- |
| `tiktok_accounts.json` | Danh sách kênh và cấu hình profile |
| `tiktok_profiles/` | Phiên Chrome riêng cho từng kênh |
| `tiktok_publish_history.json` | Lịch sử bài đăng đã xác nhận |
| `tiktok_publish_runs.json` | Phân bổ, trạng thái và nhật ký lượt đăng |
| `tiktok_publish.lock` | Khóa điều phối để ngăn tiến trình chạy chồng |

Giữ lại dữ liệu khi nâng cấp để bảo toàn phiên đăng nhập, phục hồi và chống trùng. Không xóa khóa của tiến trình đang chạy. API key không được ghi vào nhật ký lượt đăng.

## Kiến trúc mã nguồn

Ứng dụng sử dụng **Electron**, **Express/Node.js ESM**, **Vanilla JavaScript/CSS**, **Playwright + Chrome**, **FFmpeg** và **yt-dlp**.

```text
Vietdub-Ai/
├── electron/main.cjs              # Desktop shell
├── public/
│   ├── index.html                 # Các màn hình ứng dụng
│   ├── app.js                     # Sản xuất video và cấu hình
│   ├── publisher.js               # Điều hành lượt đăng
│   ├── style.css                  # Kiểu dáng nền và control
│   └── studio.css                 # Giao diện Studio
├── services/
│   ├── tiktokPublisher.js         # Chrome, metadata và đăng bài
│   ├── publishRuns.js             # Phân bổ, trạng thái, phục hồi
│   └── tiktokVerification.js      # Xác minh phiên và bài Công khai
├── server.js                      # API, dịch, TTS, phụ đề, render
├── tests/publishRuns.test.js      # Kiểm thử bộ điều phối
├── scripts/                       # Kiểm tra, checksum và vận hành
├── .github/workflows/build.yml    # Build Windows/macOS khi push tag
├── RELEASE_NOTES.md               # Thay đổi và phạm vi kiểm thử
└── handoff.md                     # Bàn giao kỹ thuật
```

## Kiểm thử và đóng gói

| Lệnh | Mục đích |
| --- | --- |
| `npm run check` | Kiểm tra cú pháp backend, frontend và module xuất bản |
| `npm test` | Kiểm thử phân bổ, chống trùng, khóa lượt, phục hồi và xác minh |
| `npm run test:ui` | Kiểm tra API/giao diện bằng Chrome với dữ liệu mô phỏng |
| `npm run build:win` | Tạo bộ cài Windows NSIS trong `dist/` |
| `npm run build:mac` | Tạo DMG arm64 trên macOS |
| `node scripts/smoke-packaged.mjs` | Mở bản Windows đóng gói bằng profile kiểm thử riêng |
| `node scripts/release-checksums.mjs` | Tạo SHA-256 cho bộ cài phiên bản hiện tại |

GitHub Actions kiểm tra và đóng gói trên Windows/macOS khi push tag `v*`, sau đó tải bộ cài cùng checksum lên Releases. Dùng tag mới cho mỗi phiên bản.

Bản 2.1.2 có 16 kiểm thử logic và 6 tình huống DOM hồi quy, cùng kiểm thử API/giao diện và khởi động bản Windows đóng gói. Đã kiểm chứng một bài đăng thật qua Post → Post now → đối soát Công khai trên TikTok Studio. Giao diện macOS chưa được nghiệm thu trên máy Mac thật; TikTok có thể tiếp tục thay đổi giao diện.

## Hỗ trợ

Khi [báo lỗi](https://github.com/khaihoansk86-debug/Vietdub-Ai/issues), cung cấp phiên bản, hệ điều hành, bước tái hiện và nhật ký liên quan. Loại bỏ khóa API, cookie và thông tin nhạy cảm trước khi đính kèm.

Xem [ghi chú phát hành](RELEASE_NOTES.md) để theo dõi thay đổi hoặc [tài liệu bàn giao](handoff.md) để tiếp tục phát triển.
