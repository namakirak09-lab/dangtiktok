# v2.3 FINAL FIX

Concrete bugs fixed from v2.2:

1. **False Ready** — v2.2 marked account Ready immediately after accepting a JSON file. v2.3 marks it `pairing` and runs a real cloud validation first. Ready only means the same cloud browser path used for publishing has already opened TikTok Photo mode successfully.
2. **Environment mismatch** — v2.2 exported a Windows Chrome session but published on Ubuntu/Xvfb and ignored exported User-Agent. v2.3 uses GitHub `windows-latest` plus exported UA/locale/timezone/viewport/Accept-Language.
3. **Incomplete portable state** — Session Bridge v2 now exports auth cookies, supported partition keys, localStorage and sessionStorage. Old v1 JSON is rejected so it cannot silently repeat the same failure.
4. **Ephemeral browser identity** — after cloud validation, v2.3 stores an AES-256-GCM encrypted persistent Chrome profile in private Supabase Storage and restores it on later jobs. Cache/profile junk is pruned before upload.
5. **Infinite/late failure** — validation has a 3-minute UI timeout and GitHub workflow fail-safe. A broken runner can no longer leave the account looking Ready or spinning indefinitely.
6. **Duplicate protection after Post click** — once TikTok submission is confirmed, PostFlow records the post before best-effort session/profile refresh, so a profile-storage error does not automatically retry and create a duplicate post.

Deployment details are in `PATCH_EXISTING.md`.
