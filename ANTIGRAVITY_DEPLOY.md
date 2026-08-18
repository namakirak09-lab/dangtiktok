# Prompt cho Antigravity — deploy PostFlow v2.1

Deploy repo này end-to-end. **Không chuyển sang TikTok Content Posting API và không rewrite kiến trúc.**

Mục tiêu: web photo carousel chạy bằng TikTok UI automation, Supabase Free + GitHub Actions + static frontend; không VPS/local chạy 24/7.

Checklist:
1. Chạy `npm install`, `npm run typecheck`, `npm run build`; chỉ fix compile/runtime bug tối thiểu, không đổi UX.
2. Tạo/chọn Supabase Free project; chạy `supabase/migrations/202608180001_init.sql`.
3. Deploy 4 Edge Functions: `queue-post`, `start-pairing`, `pairing-control`, `dispatch-runner`.
4. Set Supabase function secrets: `GITHUB_AUTOMATION_REPO`, `GITHUB_AUTOMATION_TOKEN`, `GITHUB_AUTOMATION_REF=main`, `DISPATCH_SECRET` random mạnh.
5. Push source lên GitHub private repo. Set Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`.
6. Không thêm cron GitHub cho `process-queue.yml`. Browser runner chỉ được dispatch khi có bài đến hạn.
7. Điền `<SUPABASE_PROJECT_REF>` và `<DISPATCH_SECRET>` trong `supabase/cron_setup.sql`, chạy SQL để Supabase cron gọi `dispatch-runner` mỗi phút.
8. Deploy frontend `dist` lên Cloudflare Pages Free/static host. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
9. Test đúng 1 account: ghép phiên → `ready/photo_web=true` → 2 ảnh → recommended sound → schedule 5–10 phút → runner thao tác TikTok UI.
10. Nếu selector TikTok lệch, chỉ patch `automation/lib/tiktok-ui.mjs`. Không private API, không stealth, không CAPTCHA/2FA/age bypass.
11. Sau test, bật thêm account lần lượt và bàn giao URL web + vị trí secrets.
12. Thiết lập GitHub billing budget/spending guard ở mức không phát sinh chi phí ngoài quota free nếu UI tài khoản cho phép.

Ràng buộc cố định:
- không TikTok Developer approval;
- không dịch vụ paid bắt buộc;
- không yêu cầu thẻ quốc tế cho kiến trúc ứng dụng;
- không VPS;
- không máy local treo;
- web responsive laptop + Android;
- caption/hashtag/CTA lưu mặc định;
- nhiều account;
- ảnh đăng đúng `sort_order`;
- security challenge phải dừng `needs_attention`, không vượt qua tự động.
