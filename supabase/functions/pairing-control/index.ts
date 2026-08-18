import { corsHeaders } from '../_shared/cors.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const { pairing_id, action } = await req.json()
    if (action !== 'finish') throw new Error('Action không hợp lệ.')
    const db = serviceClient()
    const { data: pairing, error } = await db.from('pairing_sessions').select('id,owner_id,status').eq('id', pairing_id).single()
    if (error || !pairing || pairing.owner_id !== user.id) throw new Error('Không tìm thấy phiên ghép.')
    if (!['starting','ready'].includes(pairing.status)) throw new Error('Phiên ghép không còn hoạt động.')
    await db.from('pairing_sessions').update({ status: 'finishing', finish_requested_at: new Date().toISOString() }).eq('id', pairing_id)
    return Response.json({ ok: true }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message === 'UNAUTHORIZED' ? 'Phiên đăng nhập hết hạn.' : message }, { status: message === 'UNAUTHORIZED' ? 401 : 400, headers: corsHeaders })
  }
})
