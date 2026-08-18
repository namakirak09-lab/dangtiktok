# PostFlow v2.1 — TikTok Photo UI Automation

Mục tiêu: **không phụ thuộc TikTok Developer API / Direct Post approval** và giảm tối đa việc phải mở TikTok hằng ngày.

PostFlow là web sáng, gọn, responsive cho laptop + Android browser. Luồng dùng bình thường:

1. thêm một hoặc nhiều tài khoản TikTok;
2. ghép phiên đăng nhập một lần qua cửa sổ TikTok thật chạy trên cloud;
3. ném 1–35 ảnh, kéo đúng thứ tự;
4. caption / hashtag / CTA Zalo lấy từ mặc định;
5. chọn nhạc: TikTok đề xuất, tìm theo tên, hoặc không nhạc;
6. đăng ngay hoặc hẹn giờ;
7. khi đến giờ, cloud bật Chrome và thao tác **giao diện TikTok**, không gọi Content Posting API.

## Kiến trúc

- Frontend: React + Vite + TypeScript.
- Auth / database / private image storage: Supabase Free.
- Scheduler nhẹ 24/7: Supabase `pg_cron` → Edge Function `dispatch-runner` mỗi phút.
- Browser runner: GitHub Actions + Chrome + Playwright UI automation.
- Ghép login từ xa: Xvfb + noVNC + Cloudflare Quick Tunnel.
- Static hosting: Cloudflare Pages Free hoặc host static tương đương.

**Không có browser chạy 24/7.** Scheduler chỉ bật GitHub runner khi thực sự có bài đến hạn. Cách này tiết kiệm Actions minutes hơn rất nhiều so với cron GitHub chạy mỗi 5 phút cả ngày.

## An toàn phiên đăng nhập

- TikTok cookie/localStorage/IndexedDB được lưu thành Playwright storage state rồi mã hóa **AES-256-GCM**.
- `ui_sessions` không có RLS policy cho frontend; chỉ service-role backend đọc được.
- Frontend không bao giờ nhận cookie TikTok.
- Nếu TikTok yêu cầu CAPTCHA, 2FA, xác minh tuổi hoặc login confirmation, runner dừng ở `needs_attention`; không bypass.
- Khi cần xác nhận lại, mở ghép phiên, tự xử lý challenge một lần rồi lưu phiên mới.

## Compatibility gate

TikTok có thể rollout Photo composer khác nhau theo account/khu vực. Khi ghép account, PostFlow thử nhiều đường upload web và chỉ chuyển account sang `ready` khi thật sự phát hiện input ảnh/Photo mode. Nếu không có, nó báo rõ ngay thay vì chờ tới ngày đăng mới lỗi.

## Database

Migration `supabase/migrations/202608180001_init.sql` tạo:

- `tiktok_accounts`
- `ui_sessions` — service-role only
- `pairing_sessions`
- `posting_defaults`
- `zalo_presets`
- `posts`
- `post_assets`
- `runner_jobs` — lock browser runner, chống dispatch trùng
- bucket private `tiktok-assets`
- bucket private `runner-diagnostics`

## Edge Functions

- `queue-post`: validate + lưu bài/ảnh theo account; bài đăng ngay sẽ thử đánh thức runner ngay.
- `start-pairing`: bật workflow ghép TikTok.
- `pairing-control`: nhận nút “đã login xong”.
- `dispatch-runner`: service-only scheduler endpoint; chỉ gọi GitHub khi có bài đến hạn và không có runner đang chạy.

## GitHub workflows

- `.github/workflows/pair-tiktok.yml`: chỉ chạy khi ghép/re-ghép account.
- `.github/workflows/process-queue.yml`: **không chạy cron rỗng**; chỉ chạy khi `dispatch-runner` gọi. Một run xử lý tối đa 8 bài đến hạn tuần tự.

## Retry

- lỗi UI do challenge/login/photo mode → `needs_attention`, không retry mù;
- lỗi kỹ thuật tạm thời → tự retry tối đa 3 lần với backoff;
- mỗi lỗi có thể lưu screenshot chẩn đoán vào bucket private.

## Nhạc

`music_mode`:

- `recommended`: nếu composer đã tự gắn sound thì giữ; nếu có nút Add Sound thì mở picker và chọn đề xuất đầu tiên;
- `search`: mở picker, tìm tên nhạc và chọn match/option phù hợp đầu tiên;
- `none`: cố bỏ sound nếu giao diện có nút remove/no sound.

Nếu web composer không có sound picker cho mode `search`, job dừng `needs_attention` thay vì chọn bừa.

## Ảnh và thứ tự

Frontend lưu asset paths theo đúng thứ tự kéo-thả. Runner tải về theo `sort_order` rồi đưa toàn bộ list file vào TikTok theo đúng thứ tự đó.

## Nhiều account

Mỗi TikTok account có encrypted session riêng và post row riêng. Một bộ ảnh có thể tick nhiều account; mỗi nick có trạng thái/retry độc lập. Không cần giữ nhiều browser online.

## Setup nhanh

### 1. Supabase

Tạo project Free rồi chạy:

```text
supabase/migrations/202608180001_init.sql
```

Deploy 4 functions:

```bash
supabase functions deploy queue-post --no-verify-jwt
supabase functions deploy start-pairing --no-verify-jwt
supabase functions deploy pairing-control --no-verify-jwt
supabase functions deploy dispatch-runner --no-verify-jwt
```

Set secrets:

```text
GITHUB_AUTOMATION_REPO=owner/repo
GITHUB_AUTOMATION_TOKEN=<fine-grained token chỉ cho repo này>
GITHUB_AUTOMATION_REF=main
DISPATCH_SECRET=<random secret dài>
```

### 2. GitHub Actions secrets

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SESSION_ENCRYPTION_KEY
```

Tạo `SESSION_ENCRYPTION_KEY`:

```bash
openssl rand -hex 32
```

### 3. Scheduler 24/7

Mở `supabase/cron_setup.sql`, thay:

```text
<SUPABASE_PROJECT_REF>
<DISPATCH_SECRET>
```

rồi chạy file trong Supabase SQL Editor. Cron chỉ gọi một Edge Function nhẹ mỗi phút. Nếu không có bài đến hạn thì không bật GitHub runner.

### 4. Frontend

```bash
cp .env.example .env
npm install
npm run typecheck
npm run build
```

Điền:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Deploy `dist/` lên Cloudflare Pages/static host.

## Test bàn giao một lần

1. ghép 1 account TikTok;
2. account phải thành `ready`, capability `photo_web=true`;
3. upload 2 ảnh test;
4. thử `recommended` music;
5. hẹn sau 5–10 phút;
6. kiểm tra `scheduled → processing → submitted/published`;
7. sau khi selector chạy đúng với account thật mới ghép thêm hàng loạt account.

## Không làm

- không TikTok Developer API;
- không reverse-engineer private endpoint;
- không giả device token;
- không stealth plugin/fingerprint spoof để né bot protection;
- không bypass CAPTCHA/2FA/age verification;
- không auto-comment bằng endpoint ẩn.

Mục tiêu của v2.1 là tự động hóa phần lặp đi lặp lại để người dùng chỉ còn phải can thiệp khi TikTok thật sự bật security challenge hoặc thay đổi composer UI.
