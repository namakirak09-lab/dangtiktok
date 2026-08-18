# Known limits — v2.3

- Publisher chính là TikTok Web UI, không phụ thuộc TikTok Developer API.
- PostFlow không tự vượt CAPTCHA, OTP, 2FA, age/security challenge. Nếu TikTok thực sự phát challenge, job chuyển `Cần xác nhận`.
- Session Bridge v2 phải được export từ Chrome đang đăng nhập thật. Sau import, cloud validation là bắt buộc; account không được đánh dấu Ready chỉ dựa vào việc file JSON hợp lệ.
- GitHub-hosted Windows runner vẫn là cloud runner và IP có thể thay đổi giữa các job. v2.3 giảm mismatch bằng Windows runner + profile headers/storage và tự kiểm tra cloud ngay sau import, nhưng không thể bắt TikTok cam kết giữ session mãi nếu chính TikTok thu hồi session.
- Photo mode và sound picker phụ thuộc UI TikTok Web của tài khoản/khu vực. Nếu Photo mode không tồn tại, validation báo ngay thay vì để tới giờ đăng mới lỗi.
