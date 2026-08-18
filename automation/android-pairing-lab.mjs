import { appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const mode = process.argv[2]
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const accountId = process.env.ACCOUNT_ID

if (!mode || !supabaseUrl || !serviceKey || !accountId) {
  throw new Error('Android pairing lab environment is incomplete')
}

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase ${response.status}: ${body.slice(0, 300)}`)
  }
  if (response.status === 204) return null
  return response.json()
}

async function patchPairing(id, body) {
  await rest(`pairing_sessions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

async function patchAccount(body) {
  await rest(`tiktok_accounts?id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

async function latestPairing(statuses) {
  const filter = statuses.map((status) => `status.eq.${status}`).join(',')
  const rows = await rest(
    `pairing_sessions?account_id=eq.${encodeURIComponent(accountId)}` +
    `&or=(${encodeURIComponent(filter)})&order=created_at.desc&limit=1&select=id,status,finish_requested_at`,
    { headers: { Prefer: 'return=representation' } },
  )
  return rows?.[0] || null
}

async function writeEnv(values) {
  const envFile = process.env.GITHUB_ENV
  if (!envFile) throw new Error('GITHUB_ENV is unavailable')
  await appendFile(envFile, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''))
}

if (mode === 'init') {
  await rest(
    `pairing_sessions?account_id=eq.${encodeURIComponent(accountId)}&status=in.(starting,ready,finishing)`,
    { method: 'PATCH', body: JSON.stringify({ status: 'expired', live_url: null, view_password: null }) },
  )
  const accounts = await rest(
    `tiktok_accounts?id=eq.${encodeURIComponent(accountId)}&select=owner_id`,
    { headers: { Prefer: 'return=representation' } },
  )
  const ownerId = accounts?.[0]?.owner_id
  if (!ownerId) throw new Error('Android pairing account does not exist')
  const inserted = await rest('pairing_sessions?select=id,status,finish_requested_at', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: ownerId,
      account_id: accountId,
      status: 'starting',
      expires_at: new Date(Date.now() + 35 * 60_000).toISOString(),
    }),
  })
  const pairing = inserted?.[0]
  if (!pairing) throw new Error('Could not create an Android pairing request')
  const password = createHash('sha256').update(`postflow-android-v1:${pairing.id}`).digest('base64url').slice(0, 8)
  process.stdout.write(`::add-mask::${password}\n`)
  await writeEnv({ PAIRING_ID: pairing.id, PAIR_VIEW_PASSWORD: password })
  await patchAccount({
    driver: 'android_ui',
    status: 'pairing',
    attention_reason: null,
  })
  process.stdout.write('Android pairing request resolved.\n')
} else if (mode === 'ready') {
  const id = process.env.PAIRING_ID
  if (!id || !process.env.PAIR_LIVE_URL || !process.env.PAIR_VIEW_PASSWORD) throw new Error('Pairing tunnel is incomplete')
  await patchPairing(id, {
    status: 'ready',
    live_url: process.env.PAIR_LIVE_URL,
    view_password: process.env.PAIR_VIEW_PASSWORD,
    error: null,
    expires_at: new Date(Date.now() + 35 * 60_000).toISOString(),
  })
  process.stdout.write('Private Android pairing window is ready.\n')
} else if (mode === 'wait') {
  const id = process.env.PAIRING_ID
  if (!id) throw new Error('PAIRING_ID is unavailable')
  const deadline = Date.now() + 32 * 60_000
  while (Date.now() < deadline) {
    const rows = await rest(
      `pairing_sessions?id=eq.${encodeURIComponent(id)}&select=status,finish_requested_at`,
      { headers: { Prefer: 'return=representation' } },
    )
    const pairing = rows?.[0]
    if (!pairing) throw new Error('Pairing request disappeared')
    if (pairing.status === 'finishing' || pairing.finish_requested_at) {
      process.stdout.write('Login confirmation received; validating Android session.\n')
      process.exit(0)
    }
    if (['failed', 'expired'].includes(pairing.status)) throw new Error(`Pairing stopped with status ${pairing.status}`)
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  throw new Error('Android pairing window expired before login confirmation')
} else if (mode === 'detected') {
  const id = process.env.PAIRING_ID
  if (!id) throw new Error('PAIRING_ID is unavailable')
  await patchPairing(id, {
    status: 'finishing',
    finish_requested_at: new Date().toISOString(),
    error: null,
  })
  process.stdout.write('Authenticated TikTok profile detected; saving the Android session.\n')
} else if (mode === 'saved') {
  const id = process.env.PAIRING_ID
  const manifestPath = process.env.SESSION_MANIFEST_PATH
  if (!id || !manifestPath) throw new Error('Saved session metadata is incomplete')
  const rows = await rest(
    `tiktok_accounts?id=eq.${encodeURIComponent(accountId)}&select=capabilities`,
    { headers: { Prefer: 'return=representation' } },
  )
  const capabilities = rows?.[0]?.capabilities || {}
  await patchAccount({
    driver: 'android_ui',
    status: 'pairing',
    attention_reason: 'Phiên Android đã lưu; đang kiểm tra lại trên cloud mới.',
    capabilities: {
      ...capabilities,
      android_app: true,
      android_session_manifest_path: manifestPath,
      android_session_pairing_id: id,
      cloud_session_validated: false,
      android_session_saved_at: new Date().toISOString(),
    },
  })
  await patchPairing(id, { status: 'complete', live_url: null, view_password: null, error: null })
  process.stdout.write('Encrypted Android session uploaded for cold restore.\n')
} else if (mode === 'init-restore') {
  const rows = await rest(
    `tiktok_accounts?id=eq.${encodeURIComponent(accountId)}&select=capabilities`,
    { headers: { Prefer: 'return=representation' } },
  )
  const capabilities = rows?.[0]?.capabilities || {}
  const manifestPath = capabilities.android_session_manifest_path
  const pairingId = capabilities.android_session_pairing_id
  if (!manifestPath || !pairingId) throw new Error('No encrypted Android session is ready to restore')
  await writeEnv({ SESSION_MANIFEST_PATH: manifestPath, PAIRING_ID: pairingId })
  process.stdout.write('Encrypted Android session metadata resolved.\n')
} else if (mode === 'validated') {
  const rows = await rest(
    `tiktok_accounts?id=eq.${encodeURIComponent(accountId)}&select=capabilities`,
    { headers: { Prefer: 'return=representation' } },
  )
  const capabilities = rows?.[0]?.capabilities || {}
  await patchAccount({
    driver: 'android_ui',
    status: 'ready',
    attention_reason: null,
    last_health_at: new Date().toISOString(),
    capabilities: {
      ...capabilities,
      android_app: true,
      cloud_session_validated: true,
      android_session_restored_at: new Date().toISOString(),
    },
  })
  process.stdout.write('P4 passed: Android login survived a fresh cloud job.\n')
} else if (mode === 'fail') {
  const id = process.env.PAIRING_ID
  const message = process.env.PAIR_ERROR || 'Android pairing lab failed; diagnostics were captured.'
  if (id) await patchPairing(id, { status: 'failed', live_url: null, view_password: null, error: message })
  const latest = await latestPairing(['starting', 'ready', 'finishing', 'complete', 'failed'])
  if (!latest || latest.id === id) {
    await patchAccount({ status: 'needs_attention', attention_reason: message })
  }
} else {
  throw new Error(`Unknown Android pairing mode: ${mode}`)
}
