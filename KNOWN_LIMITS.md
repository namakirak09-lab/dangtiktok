# KNOWN LIMITS — PostFlow v2.2

## Pairing
Pairing được thực hiện từ Chrome thật của người dùng bằng Session Bridge, không phải Chrome cloud. Điều này loại bỏ lỗi OTP/xác minh ngay trong bước ghép phiên do môi trường remote login.

## Cloud runner
Sau pairing, scheduled post vẫn chạy bằng browser cloud. Nếu TikTok chủ động vô hiệu hóa session khi thấy môi trường mới, account sẽ chuyển `needs_attention`; cập nhật session từ Chrome lại là đường phục hồi hiện tại.

## TikTok UI
Photo composer và sound picker có thể khác theo account/khu vực. Selectors tập trung trong `automation/lib/tiktok-ui.mjs`.

## Scheduler
Supabase cron đánh thức GitHub runner khi có bài tới hạn; có thể trễ vài phút do startup queue.

## Music
Recommended/search phụ thuộc sound UI hiện ra trên TikTok Web.
