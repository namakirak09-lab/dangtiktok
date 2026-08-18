# KNOWN LIMITS — PostFlow v2.1

## 1. TikTok vẫn có quyền yêu cầu xác minh
PostFlow không thêm bước xác minh riêng, nhưng TikTok có thể yêu cầu CAPTCHA, 2FA, login confirmation hoặc xác minh tuổi. Khi đó runner dừng `needs_attention`. Đây là điểm can thiệp thủ công hiếm nhưng không thể hứa loại bỏ 100%.

## 2. Photo mode trên TikTok Web có thể khác account/khu vực
Pairing có compatibility probe. Account chỉ `ready` nếu thật sự thấy Photo-capable composer/input. Nếu TikTok không rollout cho account đó, runner không dùng private endpoint để giả feature.

## 3. TikTok UI có thể đổi
Toàn bộ selector quan trọng được gom trong `automation/lib/tiktok-ui.mjs` để khi TikTok đổi layout chỉ patch một file nhỏ.

## 4. Scheduler và runner tách riêng
Supabase cron check mỗi phút; GitHub runner chỉ bật khi có bài đến hạn. Thời gian thực tế có thể trễ vài phút do queue/runner startup, phù hợp daily posting nhưng không phải scheduler real-time từng giây.

## 5. Free quota
GitHub Actions private repo có quota free theo tháng. v2.1 không còn chạy workflow rỗng 5 phút/lần, nên quota chỉ bị dùng khi ghép account hoặc thật sự đăng bài. Nếu số account/post tăng mạnh, cần theo dõi usage.

## 6. Music picker
`recommended` và `search` chỉ hoạt động khi TikTok Web composer expose sound UI tương ứng. Nếu `search` không có picker, job dừng thay vì chọn sai.

## 7. Không auto-comment
CTA Zalo nên nằm trong caption/profile/bio. V2.1 không gọi private TikTok endpoint để tạo comment.

## 8. Quick Tunnel chỉ dành cho ghép phiên
URL noVNC là URL tạm. Nó không phải hạ tầng post 24/7 và không ảnh hưởng các bài đã xếp lịch sau khi session đã lưu.
