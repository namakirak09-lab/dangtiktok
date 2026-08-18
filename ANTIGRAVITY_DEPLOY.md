# Antigravity deploy — PostFlow v2.2

Deploy end-to-end, **không quay lại pairing cloud/noVNC** và không chuyển sang TikTok API.

Checklist:
1. `npm install`, `npm run typecheck`, `npm run build`.
2. Chạy toàn bộ Supabase migrations bằng `supabase db push`, gồm migration `202608180002_local_session_import.sql`.
3. Deploy đúng 3 Edge Functions: `queue-post`, `dispatch-runner`, `import-session`.
4. Set Supabase Function secrets: `GITHUB_AUTOMATION_REPO`, `GITHUB_AUTOMATION_TOKEN`, `GITHUB_AUTOMATION_REF=main`, `DISPATCH_SECRET`, `SESSION_ENCRYPTION_KEY`.
5. Set GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_ENCRYPTION_KEY`.
6. `SESSION_ENCRYPTION_KEY` ở Supabase và GitHub phải giống hệt nhau.
7. Giữ workflow `.github/workflows/process-queue.yml`. Không tạo lại `pair-tiktok.yml`.
8. Chạy `supabase/cron_setup.sql` sau khi điền project ref + dispatch secret.
9. Deploy frontend lên Cloudflare Pages với `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
10. Test extension download `/postflow-session-bridge.zip` trả file hợp lệ.
11. Test 1 account: local Chrome TikTok login → extension export → PostFlow import → account ready → 2 ảnh → schedule 5–10 phút.
12. Nếu post runner gặp selector mismatch, patch tối thiểu `automation/lib/tiktok-ui.mjs`.

Không dùng lại remote login/cloud noVNC vì đó là nguyên nhân làm TikTok yêu cầu verification liên tục ở bước pairing.
