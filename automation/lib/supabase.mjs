const base = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!base || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

export async function rest(path, init = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${(await res.text()).slice(0, 500)}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function getPairing(id) {
  const rows = await rest(`pairing_sessions?id=eq.${encodeURIComponent(id)}&select=*`)
  return rows?.[0] || null
}

export async function getAccount(id) {
  const rows = await rest(`tiktok_accounts?id=eq.${encodeURIComponent(id)}&select=*`)
  return rows?.[0] || null
}

export async function getUiSession(accountId) {
  const rows = await rest(`ui_sessions?account_id=eq.${encodeURIComponent(accountId)}&select=*`)
  return rows?.[0] || null
}

export async function patch(table, filter, body) {
  return rest(`${table}?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
}

export async function upsert(table, body, onConflict) {
  return rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  })
}

export async function getDuePosts(limit = 8) {
  const now = new Date().toISOString()
  const select = encodeURIComponent('*,account:tiktok_accounts(*),post_assets(*)')
  const path = `posts?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&select=${select}&order=scheduled_at.asc&limit=${limit}`
  return await rest(path)
}

export async function downloadAsset(storagePath) {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${base}/storage/v1/object/tiktok-assets/${encoded}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Asset download ${res.status}: ${storagePath}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function uploadDiagnostic(storagePath, buffer, contentType = 'image/png') {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${base}/storage/v1/object/runner-diagnostics/${encoded}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  })
  if (!res.ok) throw new Error(`Diagnostic upload ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return storagePath
}
