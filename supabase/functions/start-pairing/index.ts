import { corsHeaders } from '../_shared/cors.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const { account_id } = await req.json()
    const db = serviceClient()
    const { data: account, error } = await db.from('tiktok_accounts').select('id,owner_id').eq('id', account_id).single()
    if (error || !account || account.owner_id !== user.id) throw new Error('Không tìm thấy tài khoản.')

    await db.from('pairing_sessions').update({ status: 'expired' }).eq('account_id', account_id).in('status', ['starting','ready','finishing'])
    const { data: pairing, error: pairError } = await db.from('pairing_sessions').insert({ owner_id: user.id, account_id }).select('*').single()
    if (pairError) throw pairError
    await db.from('tiktok_accounts').update({ status: 'pairing', attention_reason: null }).eq('id', account_id)

    const repo = Deno.env.get('GITHUB_AUTOMATION_REPO')
    const token = Deno.env.get('GITHUB_AUTOMATION_TOKEN')
    const ref = Deno.env.get('GITHUB_AUTOMATION_REF') || 'main'
    if (!repo || !token) throw new Error('Chưa cấu hình GitHub automation secrets.')

    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pair-tiktok.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PostFlow',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: { pairing_id: pairing.id } }),
    })
    if (!r.ok) {
      const text = await r.text()
      await db.from('pairing_sessions').update({ status: 'failed', error: `GitHub ${r.status}: ${text.slice(0, 300)}` }).eq('id', pairing.id)
      await db.from('tiktok_accounts').update({ status: 'unpaired' }).eq('id', account_id)
      throw new Error('Không gọi được runner GitHub.')
    }

    return Response.json({ pairing_id: pairing.id }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message === 'UNAUTHORIZED' ? 'Phiên đăng nhập hết hạn.' : message }, { status: message === 'UNAUTHORIZED' ? 401 : 400, headers: corsHeaders })
  }
})
