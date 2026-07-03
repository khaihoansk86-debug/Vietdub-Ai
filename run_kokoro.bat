@echo off
chcp 65001 > nul
echo ====================================================
echo      ĐANG KHỞI ĐỘNG KOKORO TTS LOCAL SERVER (PORT 8888)
echo ====================================================
echo.

if not exist kokoro-vietnamese\venv (
    echo [ERROR] Thư mục venv chưa được khởi tạo. 
    echo Vui lòng chạy file "setup_kokoro.bat" trước để cài đặt môi trường.
    pause
    exit /b 1
)

cd kokoro-vietnamese
call venv\Scripts\activate.bat
python server_api.py

pause
