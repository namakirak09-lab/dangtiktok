# PostFlow v2.2 — TikTok Photo UI Automation

Mục tiêu: đăng photo carousel TikTok theo lịch mà **không phụ thuộc TikTok Developer API**.

Điểm thay đổi lớn ở v2.2: **không đăng nhập TikTok trong cloud nữa**. Pairing cloud/noVNC đã bị bỏ vì dễ làm TikTok coi đó là thiết bị/địa chỉ đăng nhập mới và bắt xác minh liên tục.

Luồng dùng:

1. Thêm tài khoản trong PostFlow.
2. Trên Chrome laptop đang dùng bình thường, đăng nhập TikTok như thường lệ.
3. Tải `PostFlow Session Bridge` từ trang Tài khoản, cài extension local một lần, bấm `Xuất phiên TikTok`.
4. Quay lại PostFlow → `Nhập phiên Chrome` cho tài khoản tương ứng.
5. Sau đó ném 1–35 ảnh, kéo đúng thứ tự, caption/hashtag/CTA Zalo lấy mặc định, chọn nhạc, đăng ngay hoặc hẹn giờ.
6. Scheduler cloud tự bật runner khi có bài đến hạn; laptop không cần mở sau bước ghép phiên.

## Kiến trúc

- Frontend: React + Vite + TypeScript.
- Auth / database / private image storage: Supabase.
- Scheduler: Supabase `pg_cron` → Edge Function `dispatch-runner`.
- Browser runner: GitHub Actions + Chrome + Playwright UI automation.
- Pairing: local Chrome session export → Edge Function `import-session` → AES-256-GCM encrypted `ui_sessions`.
- Static hosting: Cloudflare Pages/static host.

## Session Bridge

Source extension nằm ở `public/session-bridge/` và bản zip tải trực tiếp từ web là `public/postflow-session-bridge.zip`.

Extension chỉ có host permission cho `https://*.tiktok.com/*`. Nó đọc cookie TikTok + localStorage của tab TikTok đang đăng nhập, tạo Playwright-compatible storage state rồi tải xuống một file JSON. File được người dùng upload vào PostFlow; backend mã hóa trước khi lưu database.

## Database

Chạy migration theo thứ tự:

- `supabase/migrations/202608180001_init.sql`
- `supabase/migrations/202608180002_local_session_import.sql`

Migration 002 thêm `client_profile` vào `ui_sessions` để giữ locale/timezone/viewport từ Chrome thật.

## Edge Functions

- `queue-post`: lưu bài + assets.
- `dispatch-runner`: scheduler endpoint, chỉ bật GitHub khi có bài đến hạn.
- `import-session`: nhận session export từ Chrome, mã hóa và gắn vào account.

## GitHub workflow

Chỉ còn `.github/workflows/process-queue.yml`.

Không còn workflow pair/noVNC/cloudflared.

## Setup

### Supabase

```bash
supabase db push
supabase functions deploy queue-post --no-verify-jwt
supabase functions deploy dispatch-runner --no-verify-jwt
supabase functions deploy import-session --no-verify-jwt
```

Secrets cho Edge Functions:

```text
GITHUB_AUTOMATION_REPO=owner/repo
GITHUB_AUTOMATION_TOKEN=<repo token>
GITHUB_AUTOMATION_REF=main
DISPATCH_SECRET=<random secret>
SESSION_ENCRYPTION_KEY=<same key used by GitHub Actions>
```

GitHub Actions secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_ENCRYPTION_KEY
```

`SESSION_ENCRYPTION_KEY` phải giống hệt ở Supabase Functions và GitHub Actions.

### Scheduler

Điền `<SUPABASE_PROJECT_REF>` + `<DISPATCH_SECRET>` trong `supabase/cron_setup.sql` rồi chạy trong SQL Editor.

### Frontend

```bash
npm install
npm run typecheck
npm run build
```

Env:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Deploy `dist/` lên Cloudflare Pages.

## Test đúng thứ tự

1. Mở TikTok trong Chrome laptop và login bình thường.
2. Tải/cài PostFlow Session Bridge.
3. Export session.
4. Import file JSON vào 1 account PostFlow → trạng thái `ready`.
5. Upload 2 ảnh test, schedule 5–10 phút.
6. Kiểm tra `scheduled → processing → submitted/published`.
7. Nếu TikTok UI thay đổi, patch duy nhất `automation/lib/tiktok-ui.mjs`.

## Ghi chú

v2.2 sửa đúng lỗi pairing cloud: OTP/login verification không còn nằm trong flow PostFlow. Cloud chỉ sử dụng session đã được tạo từ Chrome thật của người dùng.
