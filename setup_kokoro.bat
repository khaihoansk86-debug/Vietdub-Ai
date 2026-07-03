@echo off
chcp 65001 > nul
echo ====================================================
echo      KHỞI TẠO MÔI TRƯỜNG LỒNG TIẾNG KOKORO VIETNAMESE
echo ====================================================
echo.

:: Kiểm tra Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Không tìm thấy Python trên máy tính của bạn.
    echo Vui lòng cài đặt Python 3.8+ và tích vào ô "Add Python to PATH".
    pause
    exit /b 1
)

cd kokoro-vietnamese

:: Tạo venv
if not exist venv (
    echo [*] Đang tạo môi trường ảo Python (venv)...
    python -m venv venv
) else (
    echo [*] Môi trường ảo (venv) đã tồn tại.
)

:: Kích hoạt venv và cài đặt thư viện
echo [*] Đang kích hoạt venv và cài đặt các thư viện cần thiết...
call venv\Scripts\activate.bat

:: Nâng cấp pip
python -m pip install --upgrade pip

:: Cài đặt gói kokoro-vietnamese và các dependency cho API server
echo [*] Đang cài đặt thư viện Kokoro và các dependency...
pip install -e .
pip install fastapi uvicorn soundfile onnxruntime

echo.
echo ====================================================
echo      CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!
echo ====================================================
echo.
echo Bạn có thể chạy file "run_kokoro.bat" để khởi động server TTS.
echo.
pause
