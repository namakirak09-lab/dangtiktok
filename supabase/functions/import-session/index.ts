import { corsHeaders } from '../_shared/cors.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function encryptJson(value: unknown) {
  const raw = Deno.env.get('SESSION_ENCRYPTION_KEY')
  if (!raw) throw new Error('Missing SESSION_ENCRYPTION_KEY')
  const keyHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
  const key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clear = new TextEncoder().encode(JSON.stringify(value))
  const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, clear))
  const tag = encryptedWithTag.slice(encryptedWithTag.length - 16)
  const encrypted = encryptedWithTag.slice(0, encryptedWithTag.length - 16)
  return ['v1', bytesToBase64Url(iv), bytesToBase64Url(tag), bytesToBase64Url(encrypted)].join('.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const { account_id, session_state, session_storage, client_profile } = await req.json()
    if (!account_id || !session_state || !Array.isArray(session_state.cookies)) throw new Error('File phiên không hợp lệ.')

    const cookies = session_state.cookies as Array<{ domain?: string; name?: string }>
    const tiktokCookies = cookies.filter((c) => /(^|\.)tiktok\.com$/i.test(String(c.domain || '')))
    if (!tiktokCookies.length) throw new Error('Không tìm thấy cookie TikTok trong file phiên.')
    const hasAuthCookie = tiktokCookies.some((c) => /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss)$/i.test(String(c.name || '')))
    if (!hasAuthCookie) throw new Error('File phiên chưa có cookie đăng nhập TikTok. Hãy đăng nhập TikTok trên Chrome rồi xuất lại bằng tiện ích mới.')

    const db = serviceClient()
    const { data: account, error: accountError } = await db.from('tiktok_accounts').select('id,owner_id,capabilities').eq('id', account_id).single()
    if (accountError || !account || account.owner_id !== user.id) throw new Error('Không tìm thấy tài khoản.')

    const encrypted = await encryptJson({
      storageState: session_state,
      sessionStorage: Array.isArray(session_storage) ? session_storage : [],
    })
    const now = new Date().toISOString()
    const { error: sessionError } = await db.from('ui_sessions').upsert({
      account_id,
      encrypted_storage_state: encrypted,
      client_profile: client_profile || {},
      session_version: 2,
      last_ok_at: null,
    }, { onConflict: 'account_id' })
    if (sessionError) throw sessionError

    const { error: accountUpdateError } = await db.from('tiktok_accounts').update({
      status: 'pairing',
      attention_reason: 'Đang kiểm tra phiên trên cloud...',
      capabilities: { ...(account.capabilities || {}), session_source: 'local_chrome_v2', imported_at: now, cloud_session_validated: false },
      last_health_at: null,
    }).eq('id', account_id)
    if (accountUpdateError) throw accountUpdateError

    return Response.json({ ok: true, needs_validation: true }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400, headers: corsHeaders })
  }
})
