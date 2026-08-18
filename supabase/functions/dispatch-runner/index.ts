import { corsHeaders } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'

async function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const secret = Deno.env.get('DISPATCH_SECRET')
    if (!secret || req.headers.get('x-postflow-dispatch-secret') !== secret) return jsonError('UNAUTHORIZED', 401)

    const db = serviceClient()
    const staleCutoff = new Date(Date.now() - 40 * 60 * 1000).toISOString()
    await db.from('runner_jobs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Stale runner lock released automatically.' })
      .in('status', ['dispatching', 'running'])
      .lt('created_at', staleCutoff)

    const { data: due, error: dueError } = await db.from('posts')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
    if (dueError) throw dueError
    if (!due?.length) return Response.json({ dispatched: false, reason: 'no_due_posts' }, { headers: corsHeaders })

    const { data: job, error: lockError } = await db.from('runner_jobs')
      .insert({ kind: 'queue', status: 'dispatching' })
      .select('id')
      .single()
    if (lockError) {
      if (lockError.code === '23505') return Response.json({ dispatched: false, reason: 'runner_already_active' }, { headers: corsHeaders })
      throw lockError
    }

    const repo = Deno.env.get('GITHUB_AUTOMATION_REPO')
    const token = Deno.env.get('GITHUB_AUTOMATION_TOKEN')
    const ref = Deno.env.get('GITHUB_AUTOMATION_REF') || 'main'
    if (!repo || !token) throw new Error('Chưa cấu hình GitHub automation secrets.')

    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/process-queue.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PostFlow',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: { runner_job_id: job.id } }),
    })
    if (!r.ok) {
      const text = await r.text()
      await db.from('runner_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error: `GitHub ${r.status}: ${text.slice(0, 500)}` }).eq('id', job.id)
      throw new Error(`Không gọi được browser runner (GitHub ${r.status}).`)
    }

    return Response.json({ dispatched: true, runner_job_id: job.id }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonError(message, 500)
  }
})
