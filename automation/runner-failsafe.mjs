import { patch, rest } from './lib/supabase.mjs'

const runnerJobId = process.env.RUNNER_JOB_ID || ''
const accountId = process.env.ACCOUNT_ID || ''
if (!runnerJobId) process.exit(0)

try {
  const rows = await rest(`runner_jobs?id=eq.${encodeURIComponent(runnerJobId)}&select=id,status,kind,error`)
  const job = rows?.[0]
  if (!job || !['dispatching', 'running'].includes(job.status)) process.exit(0)

  const message = 'Browser runner dừng trước khi hoàn tất. Kiểm tra GitHub Actions log.'
  await patch('runner_jobs', `id=eq.${encodeURIComponent(runnerJobId)}`, {
    status: 'failed',
    finished_at: new Date().toISOString(),
    error: message,
  })

  if (accountId && job.kind === 'session_check') {
    await patch('tiktok_accounts', `id=eq.${encodeURIComponent(accountId)}`, {
      status: 'needs_attention',
      attention_reason: message,
      last_health_at: new Date().toISOString(),
    })
  }
} catch (err) {
  console.error('Failsafe could not update Supabase:', err)
}
