# 🤖 VietDub AI

VietDub AI là web app chạy trên máy cá nhân hoặc mạng LAN để tải video, ghép nhiều clip, tạo phụ đề, lồng tiếng AI, chèn watermark và xuất video hoàn chỉnh.

Giao diện hỗ trợ tiếng Việt/tiếng Anh, chế độ sáng/tối, tuỳ chỉnh phụ đề, watermark, giọng đọc TTS và nhập API trực tiếp trên web hoặc qua file `.env`.

## Tính năng chính

- Tải video từ link, tải nhiều link và gộp thành một video.
- Upload video/SRT trực tiếp từ máy.
- Tạo phụ đề bằng Gemini.
- Lồng tiếng AI bằng OpenAI TTS hoặc Microsoft Edge Neural.
- Tuỳ chỉnh font phụ đề, kích thước, nền phụ đề, khoảng cách đáy và độ dài dòng.
- Chèn watermark ảnh với vị trí và kích thước tuỳ chỉnh.
- Tự dọn dữ liệu tạm sau khi xử lý để giảm dung lượng ổ cứng.
- Chạy local hoặc mở cho các máy cùng mạng LAN truy cập.
- Có script cài tự khởi động cùng Windows bằng Task Scheduler.

## Yêu cầu hệ thống

Nên dùng Windows 10/11. Các hệ điều hành khác vẫn có thể chạy nếu đã cài đủ Node.js, Python và các công cụ tương ứng.

Cần cài trước:

- Node.js 20 trở lên.
- Python 3.10 trở lên.
- Git.
- Kết nối internet để tải video và gọi API AI.

Gói `ffmpeg-static` và `yt-dlp-exec` được cài qua `npm install`. Microsoft Edge TTS cần thêm gói Python `edge-tts`.

## Clone project về máy

```powershell
git clone https://github.com/khaihoansk86-debug/Vietdub-Ai.git
cd Vietdub-Ai
```

## Cài đặt thư viện

```powershell
npm install
pip install edge-tts
copy .env.example .env
```

Nếu máy dùng nhiều phiên bản Python, có thể cần chạy:

```powershell
py -m pip install edge-tts
```

## Cấu hình API

Mở file `.env` và điền API key của bạn:

```text
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
RAPIDAPI_KEY=your_rapidapi_key_here
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TTS_MODEL=gpt-4o-mini-tts
PORT=3210
HOST=0.0.0.0
```

Bạn cũng có thể để trống `.env` và nhập API trực tiếp trong mục `API & mô hình AI` trên giao diện web.

Lưu ý:

- File `.env` chứa API riêng của từng máy và không được commit lên Git.
- Người khác clone project về chỉ cần tự tạo `.env` hoặc tự nhập API trên giao diện.
- Nếu API hết hạn, có thể thay API mới ngay trên giao diện mà không cần sửa code.

## Chạy web

```powershell
npm start
```

Mở trên chính máy đang chạy server:

```text
http://localhost:3210
```

Mở từ máy khác cùng mạng LAN:

```text
http://IP_MAY_CHU:3210
```

Ví dụ:

```text
http://192.168.1.115:3210
```

Nếu máy khác không truy cập được, hãy kiểm tra:

- Server đang chạy chưa.
- `HOST=0.0.0.0` trong `.env`.
- Tường lửa Windows đã cho phép cổng `3210`.
- Các máy đang cùng một mạng LAN.

Cho phép cổng `3210` qua Windows Firewall bằng PowerShell Administrator:

```powershell
New-NetFirewallRule -DisplayName "VietDub AI 3210" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3210
```

Nếu muốn xoá rule này:

```powershell
Remove-NetFirewallRule -DisplayName "VietDub AI 3210"
```

## Chạy dạng app Windows

Project có thêm bản desktop bằng Electron. Cách này tự mở cửa sổ `VietDub AI` như một phần mềm Windows, bên trong vẫn chạy server local nội bộ để giữ nguyên toàn bộ chức năng.

Chạy thử app desktop khi đang phát triển:

```powershell
npm run desktop
```

Tạo bộ cài Windows:

```powershell
npm run build:win
```

Sau khi build xong, bộ cài nằm trong thư mục:

```text
dist/VietDub-AI-Setup-1.0.0.exe
```

Ghi chú:

- App desktop tự chọn cổng trống bắt đầu từ `3210`, nên hạn chế bị trùng với server web đang chạy.
- Dữ liệu xử lý của app desktop được lưu trong thư mục dữ liệu người dùng của Windows, không lưu vào thư mục cài đặt.
- API key vẫn là của từng máy. Người dùng có thể nhập trực tiếp trong giao diện hoặc tạo file `.env` khi chạy bản source.
- Muốn chia sẻ cho máy khác, chỉ cần gửi file cài trong `dist`.

## Tự chạy khi bật Windows

Mở PowerShell bằng quyền Administrator tại thư mục project, sau đó chạy:

```powershell
.\scripts\install-startup-task.ps1
```

Script này tạo Task Scheduler tên `VietDub AI Server`. Server sẽ tự chạy khi Windows khởi động. Watchdog trong `scripts/start-vietdub-watch.ps1` sẽ tự bật lại server nếu tiến trình bị tắt.

Log khởi động nằm trong:

```text
data\logs\startup-watch.log
data\logs\install-startup-task.log
```

## Kiểm tra nhanh

Kiểm tra cú pháp server và frontend:

```powershell
npm run check
```

Kiểm tra server đang sống:

```powershell
Invoke-RestMethod http://127.0.0.1:3210/health
```

Kết quả đúng sẽ có dạng:

```json
{"ok":true}
```

## Cấu trúc thư mục

```text
public/      Giao diện web
server.js    Backend xử lý job, tải video, TTS, phụ đề và render
scripts/     Script tự khởi động Windows
data/        Dữ liệu tạm, job, output và log runtime
.env.example Mẫu cấu hình API
```

## Ghi chú vận hành

- Không đưa `.env`, file video, job output hoặc dữ liệu trong `data/jobs` lên Git.
- Nếu render video dài, hãy giữ máy không sleep trong lúc xử lý.
- Chế độ `Chỉ tải/gộp video` không cần API AI.
- Chế độ `Tạo phụ đề + lồng tiếng` cần Gemini API và TTS API tương ứng.
- Có thể dùng OpenAI TTS để giọng tự nhiên hơn, hoặc Edge Neural làm phương án dự phòng.

## Gợi ý tạo release v1.0.0

Sau khi test ổn định, có thể tạo release đầu tiên trên GitHub:

```powershell
git tag -a v1.0.0 -m "Phát hành VietDub AI v1.0.0"
git push origin v1.0.0
```

Sau đó vào tab `Releases` trên GitHub, chọn tag `v1.0.0`, ghi chú các tính năng chính và bấm publish.
