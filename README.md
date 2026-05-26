# VietDub AI

Web local/LAN để tải video, ghép clip, tạo phụ đề, lồng tiếng tiếng Việt, chèn watermark và xuất video.

## Chạy local

```powershell
npm install
pip install edge-tts
copy .env.example .env
npm start
```

Điền `GEMINI_API_KEY` và `RAPIDAPI_KEY` trong `.env` trước khi dùng các tính năng tương ứng.

Máy cần có Python trong PATH vì phần lồng tiếng dùng `python -m edge_tts`.

Mặc định web chạy ở:

```text
http://localhost:3210
```

Nếu dùng trong LAN, mở bằng IP máy chủ, ví dụ:

```text
http://192.168.1.115:3210
```
