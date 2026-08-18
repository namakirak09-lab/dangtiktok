import { chromium } from 'playwright-core'
import { decryptJson, encryptJson } from './lib/crypto.mjs'
import { openPhotoComposer, assertNoChallenge } from './lib/tiktok-ui.mjs'
import { getAccount, getPairing, getUiSession, patch, upsert } from './lib/supabase.mjs'

const pairingId = process.env.PAIRING_ID
if (!pairingId) throw new Error('PAIRING_ID is required')
const liveUrl = process.env.PAIR_LIVE_URL || null
const viewPassword = process.env.PAIR_VIEW_PASSWORD || null
const chromePath = process.env.CHROME_BIN || '/usr/bin/google-chrome'

const pairing = await getPairing(pairingId)
if (!pairing) throw new Error('Pairing session not found')
const account = await getAccount(pairing.account_id)
if (!account) throw new Error('Account not found')

let storageState
const previous = await getUiSession(account.id)
if (previous?.encrypted_storage_state) {
  try { storageState = decryptJson(previous.encrypted_storage_state) } catch { storageState = undefined }
}

await patch('pairing_sessions', `id=eq.${pairingId}`, {
  status: 'ready',
  live_url: liveUrl,
  view_password: viewPassword,
  error: null,
})

const browser = await chromium.launch({
  headless: false,
  executablePath: chromePath,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
    '--disable-blink-features=AutomationControlled',
    '--lang=vi-VN',
  ],
})

const context = await browser.newContext({
  storageState,
  viewport: { width: 1280, height: 800 },
  locale: 'vi-VN',
  timezoneId: 'Asia/Ho_Chi_Minh',
  deviceScaleFactor: 1,
})

const page = await context.newPage()
await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(async () => {
  await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
})

const deadline = Date.now() + 23 * 60 * 1000
let requested = false
while (Date.now() < deadline) {
  const row = await getPairing(pairingId)
  if (!row) break
  if (row.finish_requested_at || row.status === 'finishing') { requested = true; break }
  if (row.status === 'expired' || row.status === 'failed') break
  await new Promise((r) => setTimeout(r, 2500))
}

if (!requested) {
  await patch('pairing_sessions', `id=eq.${pairingId}`, { status: 'expired', error: 'Phiên ghép hết thời gian.' })
  await patch('tiktok_accounts', `id=eq.${account.id}`, { status: account.status === 'ready' ? 'ready' : 'unpaired' })
  await browser.close()
  process.exit(0)
}

try {
  await assertNoChallenge(page)
  const cookies = await context.cookies()
  const hasTikTokCookie = cookies.some((c) => /(^|\.)tiktok\.com$/i.test(c.domain))
  if (!hasTikTokCookie) throw new Error('Chưa thấy phiên đăng nhập TikTok. Hãy đăng nhập xong rồi bấm lưu phiên.')

  const state = await context.storageState({ indexedDB: true })
  const encrypted = encryptJson(state)
  await upsert('ui_sessions', {
    account_id: account.id,
    encrypted_storage_state: encrypted,
    last_ok_at: new Date().toISOString(),
  }, 'account_id')

  let photoWeb = false
  let probeError = null
  try {
    const probe = await openPhotoComposer(page)
    photoWeb = probe.ok
  } catch (err) {
    probeError = err instanceof Error ? err.message : String(err)
  }

  await patch('tiktok_accounts', `id=eq.${account.id}`, {
    status: photoWeb ? 'ready' : 'needs_attention',
    attention_reason: photoWeb ? null : `Đã lưu đăng nhập nhưng chưa phát hiện Photo mode trên TikTok Web.${probeError ? ` ${probeError}` : ''}`,
    capabilities: { photo_web: photoWeb, probed_at: new Date().toISOString() },
    last_health_at: new Date().toISOString(),
  })
  await patch('pairing_sessions', `id=eq.${pairingId}`, { status: 'complete', live_url: null, view_password: null, error: null })
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  await patch('pairing_sessions', `id=eq.${pairingId}`, { status: 'failed', error: message, live_url: null, view_password: null })
  await patch('tiktok_accounts', `id=eq.${account.id}`, { status: 'needs_attention', attention_reason: message })
  throw err
} finally {
  await browser.close()
}
