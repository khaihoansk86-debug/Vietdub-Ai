# VietDub AI Studio 2.1.5 — Lịch sử bài đã gửi

- Lưu ngay bài đã tìm đúng trên TikTok nhưng còn đang xử lý vào lịch sử, kèm URL và trạng thái riêng.
- Bỏ qua clip đang xử lý khi chọn video mới để tránh đăng trùng.
- Tự quét lại kho, cập nhật bộ đếm và mở lịch sử khi hoàn tất đăng; bổ sung liên kết mở bài.
- Giữ nguyên thao tác đăng trực tiếp và pipeline dịch/lồng tiếng.

---

# VietDub AI Studio 2.1.4 — Đăng trực tiếp

- Bỏ bảng Điều hành lượt đăng, bộ chọn lượt, kiểm tra sẵn sàng và bước prepare/start khỏi nút Đăng video.
- Đăng trực tiếp bằng kho video, AI theo prompt và thao tác Post/Post now hiện hành; không dùng giữ chỗ từ các lượt cũ.
- Kho thiếu video vẫn đăng số clip hiện có; nhật ký hiển thị ngay dưới nút đăng.
- Giữ lịch sử bài đã xác nhận công khai, khóa chống chạy đồng thời và pipeline dịch/TTS/render.

---

# VietDub AI Studio 2.1.3 — Đăng video một nút

- Hiển thị đúng tên VietDub AI Studio ở thanh bên và tiêu đề cửa sổ.
- Thay Kiểm tra & tạo lượt đăng bằng Đăng video: tự chọn video, tạo content AI theo prompt và bắt đầu đăng sau một cú bấm.
- Giữ chống trùng, lưu tiến độ và xác minh bài công khai; không thay đổi dịch/TTS/render.
- Kiểm thử UI bao phủ prompt, bấm liên tiếp và lỗi chuẩn bị trước khi gửi.

---

# VietDub AI Studio 2.1.2 — Sửa thao tác Đăng

- Sửa nhận diện quyền hiển thị TikTok Studio: hỗ trợ nhãn “Who can see this post” và container `video_visibility_container` hiện hành.
- Đọc đúng ô combobox Everyone, hỗ trợ menu ngoài container và nhãn tiếng Việt; vẫn dừng nếu không xác nhận được Công khai.
- Sửa kiểm tra danh sách trống “No posts yet” khi tiêu đề và mô tả nằm chung phần tử.
- Hỗ trợ hàng nội dung `data-tt` để xác nhận đúng caption, kênh và quyền Everyone sau khi đăng.
- Bổ sung kiểm thử hồi quy với cấu trúc HTML đã quan sát trên TikTok thật.
- Giữ nguyên pipeline dịch/lồng tiếng và dữ liệu tài khoản.

---

# VietDub AI Studio 2.1.1

Trung tâm xuất bản TikTok mới thay luồng bốc video và đăng ngay bằng bản xem trước có thể kiểm tra và lượt đăng lưu bền.

## Tính năng

- Giao diện điều hành riêng: số video, số bài công khai, mục chờ và mục cần chú ý; lọc trạng thái, xem caption/hashtag, nhật ký từng video và mở bài đăng.
- Phân bổ 1:1 bằng SHA-256 toàn file, giữ chỗ các video đã phân bổ; giữ tương thích lịch sử fingerprint cũ. Không sửa/xóa video nguồn.
- Kiểm tra video bằng FFmpeg, Chrome, phiên đăng nhập TikTok Studio và tạo nội dung Gemini trước khi bắt đầu. Thiếu video riêng biệt hoặc lỗi API sẽ hiển thị mục cần sửa.
- Lưu trạng thái trước khi bấm Đăng. Lượt bị gián đoạn được phục hồi khi mở lại; bài đã gửi nhưng chưa rõ kết quả chỉ được đối soát, không tự tải lên lại.
- Xác minh bài bằng caption/hashtag, username, ID mới, thời điểm ID và nhãn Công khai trong chính dòng bài đăng. Toast, chuyển URL, “Only me” hoặc bài đang kiểm duyệt không được coi là thành công.
- Dừng sau kênh hiện tại, tiếp tục phần chưa gửi, thử lại mục lỗi trước khi gửi, đối soát bài đã gửi, hủy phần chưa gửi. CAPTCHA/phiên hết hạn cần người dùng xử lý qua cửa sổ đăng nhập.
- Chrome đóng lần lượt; khóa lượt đăng và khóa instance Electron ngăn chạy chồng. API điều khiển kiểm tra Origin, mặc định server chỉ nghe localhost.
- Windows NSIS và macOS Apple Silicon DMG tiếp tục build bằng tag GitHub Actions; bổ sung kiểm thử và SHA-256 cho từng nền tảng.

## Không thay đổi

Luồng tải, dịch, nhận diện giọng nói, TTS, căn chỉnh tempo, phụ đề, watermark và FFmpeg dựng video được giữ nguyên. Chỉ phần gửi kết quả sang TikTok dùng bộ điều phối mới, bắt buộc Public và 1:1.

## Kiểm chứng

- `npm run check`: cú pháp toàn bộ module đã thay đổi.
- `npm test`: 16 kiểm thử về phân bổ, hash, phục hồi, retry, CAPTCHA, ghi lịch sử, khóa lượt và bằng chứng Công khai.
- `npm run test:ui`: API local, chống Origin khác, escaping XSS, điều hướng, filter, form sản xuất còn nguyên, DOM adapter và bốn độ rộng 375/768/1024/1440; hai theme.
- `node scripts/smoke-packaged.mjs`: mở bản Windows đóng gói bằng profile tạm riêng, xác minh phiên bản và màn hình xuất bản.
- Đối chiếu mã pipeline trong `server.js` với baseline `d945639`: nguyên vẹn, ngoại trừ chuẩn hóa tùy chọn TikTok về Public.

## Phạm vi kiểm thử thực tế

Không đăng video lên tài khoản thật trong quá trình kiểm thử. DOM TikTok có thể thay đổi; khi không nhận diện được danh sách, quyền hiển thị hoặc đúng bài, ứng dụng dừng hoặc yêu cầu đối soát thay vì báo thành công. DMG được build và kiểm tra tự động trên macOS CI; chưa có nghiệm thu giao diện trên máy Mac thật.

## Dùng thử

1. Cài bộ Windows `VietDub-AI-Setup-2.1.1.exe`.
2. Mở Xuất bản TikTok, chọn kênh và kho video, điền Gemini API tại Cài đặt & API.
3. Chọn **Kiểm tra & tạo lượt đăng**; Chrome lần lượt kiểm tra các phiên. Xem caption/hashtag trước khi chọn **Bắt đầu đăng công khai**.
4. Nếu trạng thái **Cần đối soát**, chọn **Đối soát bài đã gửi**. Nếu **Cần thao tác**, mở đăng nhập kênh, xử lý xác minh rồi đóng Chrome và thử lại mục lỗi.

Dữ liệu mới: `tiktok_publish_runs.json` và khóa tiến trình `tiktok_publish.lock` trong data runtime hiện tại. API key không được lưu trong nhật ký lượt đăng. Không xóa khóa của tiến trình đang chạy.

Bản vá 2.1.1 sửa đường dẫn chạy test tương thích Node 20 trên Windows CI. Tag 2.1.0 được giữ nguyên để truy vết lần build lỗi.
