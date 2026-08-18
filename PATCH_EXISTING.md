# PATCH EXISTING — v2.3 FINAL SESSION FIX

Patch này dành cho project `dangtiktok` đang chạy v2.2. KHÔNG tạo project mới và KHÔNG xóa dữ liệu.

## Vì sao v2.2 báo "Phiên TikTok đã hết hạn" ngay sau khi vừa nhập
v2.2 lấy session từ Chrome Windows nhưng chạy browser publish trên Ubuntu/Xvfb, đồng thời không dùng lại User-Agent đã export. Account bị đánh dấu `ready` ngay khi upload JSON nên web báo thành công dù cloud chưa hề kiểm tra session.

v2.3 sửa cả hai điểm:
- runner chuyển sang `windows-latest` và dùng User-Agent/locale/timezone/viewport của Chrome đã export;
- Session Bridge v2 export đầy đủ hơn: cookies + partition key (nếu có) + localStorage + sessionStorage;
- sau khi nhập session, PostFlow tự chạy `validate-session.yml` trên cloud; CHỈ khi check thực tế qua TikTok upload pass thì account mới thành `Sẵn sàng tự đăng`;
- queue dùng chính cơ chế browser/session đã được validation, và lưu session mới sau mỗi lần đăng.

## Antigravity chỉ làm đúng các bước này
1. Chạy `npm install`, `npm run typecheck`, `npm run build`.
2. Apply migration mới:
   - `supabase/migrations/202608180003_cloud_session_validation.sql`
3. Deploy/redeploy Edge Functions:
   - `import-session`
   - `validate-session` (MỚI)
   - giữ nguyên `queue-post`
   - giữ nguyên `dispatch-runner`
4. Đảm bảo Edge Function `validate-session` có cùng secrets đã dùng bởi `dispatch-runner`:
   - `GITHUB_AUTOMATION_REPO`
   - `GITHUB_AUTOMATION_TOKEN`
   - `GITHUB_AUTOMATION_REF`
   - `SESSION_ENCRYPTION_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Push source lên repo GitHub hiện tại để có 2 workflow:
   - `.github/workflows/process-queue.yml`
   - `.github/workflows/validate-session.yml`
6. Giữ nguyên GitHub Actions secrets hiện tại:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_ENCRYPTION_KEY`
7. Deploy đè frontend Cloudflare Pages hiện tại.
8. KHÔNG khôi phục noVNC / pair-tiktok / QR cloud / TikTok API.

## Sau deploy
- Trên PostFlow tải LẠI tiện ích Session Bridge (v1.1.0) và Load unpacked lại folder mới.
- Mở TikTok trên Chrome Windows đang đăng nhập, refresh 1 lần, Export session v2.
- Nhập file vào account.
- Web sẽ hiện `Đang kiểm tra cloud`; không cần tạo post test cho tới khi nó tự chuyển sang `Sẵn sàng tự đăng`.

Nếu cloud check fail thì account KHÔNG được phép hiện Ready. Đây là fail-fast để không mất thời gian tạo lịch rồi mới phát hiện session lỗi.
