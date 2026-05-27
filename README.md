# VietDub AI

Web local/LAN để tải video, ghép clip, tạo phụ đề, lồng tiếng tiếng Việt, chèn watermark và xuất video.

## Cài đặt

```powershell
npm install
pip install edge-tts
copy .env.example .env
```

Điền các khóa cần dùng trong `.env`:

```text
GEMINI_API_KEY=...
RAPIDAPI_KEY=...
OPENAI_API_KEY=...
HOST=0.0.0.0
PORT=3210
```

## Chạy thủ công

```powershell
npm start
```

Mở trên máy chủ:

```text
http://localhost:3210
```

Mở từ máy khác cùng mạng LAN bằng IP máy chủ, ví dụ:

```text
http://192.168.1.115:3210
```

## Tự chạy khi bật máy

Chạy PowerShell bằng quyền Administrator rồi chạy:

```powershell
.\scripts\install-startup-task.ps1
```

Script này tạo Task Scheduler tên `VietDub AI Server`, chạy bằng quyền `SYSTEM` ngay khi máy khởi động. Watchdog ở `scripts/start-vietdub-watch.ps1` sẽ tự bật lại server nếu tiến trình bị tắt.

Log khởi động nằm trong:

```text
data\logs\startup-watch.log
data\logs\install-startup-task.log
```

## Kiểm tra nhanh

```powershell
npm run check
Invoke-RestMethod http://127.0.0.1:3210/health
```
