import { patch } from './lib/supabase.mjs'
const id = process.env.PAIRING_ID
if (!id) throw new Error('PAIRING_ID missing')
const body = {}
if (process.env.PAIR_LIVE_URL) body.live_url = process.env.PAIR_LIVE_URL
if (process.env.PAIR_VIEW_PASSWORD) body.view_password = process.env.PAIR_VIEW_PASSWORD
if (process.env.PAIR_STATUS) body.status = process.env.PAIR_STATUS
if (process.env.PAIR_ERROR) body.error = process.env.PAIR_ERROR
await patch('pairing_sessions', `id=eq.${id}`, body)
