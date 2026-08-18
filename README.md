# PostFlow v2.3 — TikTok Photo Scheduler

Web để upload/sắp thứ tự ảnh, lưu caption/hashtag mặc định, chọn nhiều tài khoản, CTA Zalo, nhạc, đăng ngay/hẹn giờ và chạy cloud.

## Kiến trúc

`Cloudflare Pages UI -> Supabase -> GitHub Windows browser runner -> TikTok Web UI`

Không dùng TikTok Developer API làm publisher chính. Không cần VPS riêng hoặc treo máy sau bước ghép phiên.

## Ghép tài khoản v2.3

1. Tải `PostFlow Session Bridge` từ trang Tài khoản.
2. Load unpacked vào Chrome desktop.
3. Đăng nhập TikTok trên Chrome bình thường và refresh tiktok.com.
4. Extension export bundle v2 gồm cookies/localStorage/sessionStorage + profile trình duyệt.
5. Import JSON vào PostFlow.
6. PostFlow tự dispatch workflow `Validate TikTok session` trên `windows-latest`.
7. Chỉ khi cloud thật sự mở được TikTok Photo composer thì account mới chuyển `Sẵn sàng tự đăng`.

## Runner

- Queue runner cũng chạy `windows-latest` để gần với Chrome Windows đã export session hơn bản Ubuntu/Xvfb cũ.
- Dùng lại `userAgent`, locale, timezone, viewport và `Accept-Language` đã export.
- Sau mỗi lần đăng thành công, storage state mới được mã hóa và ghi ngược vào Supabase.
- Lỗi kỹ thuật retry tự động; challenge thật chuyển `Cần xác nhận`.

## Deploy patch từ v2.2

Đọc `PATCH_EXISTING.md`. Không tạo project Supabase/GitHub/Cloudflare mới.
