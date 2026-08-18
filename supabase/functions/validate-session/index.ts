import { corsHeaders } from '../_shared/cors.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const { account_id } = await req.json()
    if (!account_id) return jsonError('Thiếu account_id.')

    const db = serviceClient()
    const { data: account, error: accountError } = await db.from('tiktok_accounts').select('id,owner_id').eq('id', account_id).single()
    if (accountError || !account || account.owner_id !== user.id) return jsonError('Không tìm thấy tài khoản.', 404)

    const staleCutoff = new Date(Date.now() - 12 * 60 * 1000).toISOString()
    await db.from('runner_jobs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Stale session validation released automatically.' })
      .eq('kind', 'session_check')
      .eq('account_id', account_id)
      .in('status', ['dispatching', 'running'])
      .lt('created_at', staleCutoff)

    const { data: active } = await db.from('runner_jobs')
      .select('id,status')
      .eq('kind', 'session_check')
      .eq('account_id', account_id)
      .in('status', ['dispatching', 'running'])
      .limit(1)
    if (active?.length) return Response.json({ dispatched: false, runner_job_id: active[0].id, reason: 'already_running' }, { headers: corsHeaders })

    const { data: job, error: jobError } = await db.from('runner_jobs')
      .insert({ kind: 'session_check', status: 'dispatching', account_id })
      .select('id')
      .single()
    if (jobError) throw jobError

    const repo = Deno.env.get('GITHUB_AUTOMATION_REPO')
    const token = Deno.env.get('GITHUB_AUTOMATION_TOKEN')
    const ref = Deno.env.get('GITHUB_AUTOMATION_REF') || 'main'
    if (!repo || !token) throw new Error('Chưa cấu hình GitHub automation secrets.')

    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/validate-session.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PostFlow',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: { runner_job_id: job.id, account_id } }),
    })
    if (!r.ok) {
      const text = await r.text()
      await db.from('runner_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error: `GitHub ${r.status}: ${text.slice(0, 500)}` }).eq('id', job.id)
      await db.from('tiktok_accounts').update({ status: 'needs_attention', attention_reason: 'Không khởi động được bước kiểm tra cloud.' }).eq('id', account_id)
      throw new Error(`Không gọi được browser kiểm tra phiên (GitHub ${r.status}).`)
    }

    return Response.json({ dispatched: true, runner_job_id: job.id }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonError(message, 500)
  }
})
