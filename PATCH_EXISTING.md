# Patch existing PostFlow v2.1 -> v2.2

Code changes are already done. Deployment agent should NOT redesign or modify source.

Run only:

```bash
npm install
npm run typecheck
npm run build
supabase db push
supabase functions deploy queue-post --no-verify-jwt
supabase functions deploy dispatch-runner --no-verify-jwt
supabase functions deploy import-session --no-verify-jwt
```

Ensure Supabase Functions have the same `SESSION_ENCRYPTION_KEY` as GitHub Actions.

Push this source to the existing GitHub repo and redeploy the existing Cloudflare Pages project.

Do not restore these removed components:
- `.github/workflows/pair-tiktok.yml`
- `automation/pair.mjs`
- `automation/update-pairing.mjs`
- `supabase/functions/start-pairing`
- `supabase/functions/pairing-control`

Smoke test after deploy:
1. `/postflow-session-bridge.zip` downloads successfully.
2. Login TikTok in normal local Chrome.
3. Session Bridge exports JSON.
4. Account page imports JSON and becomes `ready`.
5. Schedule a 2-image post.
