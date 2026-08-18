# Antigravity deploy — PostFlow v2.3

Đây là PATCH cho project `dangtiktok` hiện tại, không phải project mới.

## Quy tắc
- Không rewrite frontend.
- Không chuyển sang TikTok API.
- Không tạo Supabase/GitHub/Cloudflare project mới.
- Không khôi phục noVNC, QR cloud, pair-tiktok.
- Patch tối thiểu đúng source trong ZIP.

## Làm theo thứ tự
1. Đọc `PATCH_EXISTING.md`.
2. `npm install`
3. `npm run typecheck`
4. `npm run build`
5. Apply migration `202608180003_cloud_session_validation.sql` vào Supabase hiện tại.
6. Deploy Edge Functions `import-session` và `validate-session`; giữ `queue-post`, `dispatch-runner` hiện tại.
7. Xác nhận secrets của `validate-session` giống secrets GitHub automation đang dùng.
8. Push source/workflows lên GitHub repo hiện tại.
9. Deploy `dist/` đè Cloudflare Pages hiện tại.
10. Không tự ghép TikTok. Dừng lại và báo user tải Session Bridge mới, export session v2, import vào web.

## Tiêu chí pass
Sau khi user import session v2:
`Đang kiểm tra cloud -> Sẵn sàng tự đăng`
phải do workflow `validate-session.yml` chạy thật và pass. Không được set Ready giả ở frontend/database.
