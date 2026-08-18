import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { decryptJson, encryptJson } from './lib/crypto.mjs'
import { baseContextOptions, seedPersistentContext, unpackSessionPayload } from './lib/browser-profile.mjs'
import { restoreEncryptedProfile, saveEncryptedProfile } from './lib/profile-store.mjs'
import { NeedsAttention, validateTikTokSession } from './lib/tiktok-ui.mjs'
import { getAccount, getUiSession, patch, upsert } from './lib/supabase.mjs'

const chromePath = process.env.CHROME_BIN
const runnerJobId = process.env.RUNNER_JOB_ID || ''
const accountId = process.env.ACCOUNT_ID || ''
if (!chromePath) throw new Error('Missing CHROME_BIN')
if (!runnerJobId || !accountId) throw new Error('Missing RUNNER_JOB_ID / ACCOUNT_ID')

async function updateRunner(body) {
  await patch('runner_jobs', `id=eq.${encodeURIComponent(runnerJobId)}`, body).catch((err) => console.error('Runner state update:', err))
}

await updateRunner({ status: 'running', started_at: new Date().toISOString(), error: null })
let context
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'postflow-validate-'))
try {
  const account = await getAccount(accountId)
  if (!account) throw new Error('Account not found')
  const session = await getUiSession(accountId)
  if (!session?.encrypted_storage_state) throw new NeedsAttention('Không có phiên TikTok đã lưu.')

  const payload = unpackSessionPayload(decryptJson(session.encrypted_storage_state))
  const profile = session.client_profile || {}
  const profileDir = path.join(work, 'chrome-profile')
  await fs.mkdir(profileDir, { recursive: true })
  await restoreEncryptedProfile(accountId, profileDir, work).catch(() => false)

  context = await chromium.launchPersistentContext(profileDir, {
    ...baseContextOptions(profile),
    headless: true,
    executablePath: chromePath,
    args: ['--disable-dev-shm-usage', '--lang=vi-VN', '--window-size=1280,800'],
  })
  await seedPersistentContext(context, payload.storageState, payload.sessionStorage)
  const page = context.pages()[0] || await context.newPage()

  const result = await validateTikTokSession(page)
  const updatedState = await context.storageState({ indexedDB: true })
  await upsert('ui_sessions', {
    account_id: accountId,
    encrypted_storage_state: encryptJson({ storageState: updatedState, sessionStorage: payload.sessionStorage }),
    last_ok_at: new Date().toISOString(),
  }, 'account_id')

  await patch('tiktok_accounts', `id=eq.${encodeURIComponent(accountId)}`, {
    status: 'ready',
    attention_reason: null,
    last_health_at: new Date().toISOString(),
    capabilities: { ...(account.capabilities || {}), cloud_session_validated: true, persistent_cloud_profile: true, photo_web: Boolean(result.photoWeb), validated_at: new Date().toISOString() },
  })

  await context.close()
  context = null
  await saveEncryptedProfile(accountId, profileDir, work)
  await updateRunner({ status: 'complete', finished_at: new Date().toISOString(), error: null })
  console.log('TikTok session validation passed and persistent profile saved.')
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error('Session validation failed:', err)
  const needsAttention = err instanceof NeedsAttention
  await patch('tiktok_accounts', `id=eq.${encodeURIComponent(accountId)}`, {
    status: needsAttention ? 'needs_attention' : 'unpaired',
    attention_reason: message,
    last_health_at: new Date().toISOString(),
  }).catch(() => {})
  await updateRunner({ status: 'failed', finished_at: new Date().toISOString(), error: message })
  process.exitCode = 1
} finally {
  if (context) await context.close().catch(() => {})
  await fs.rm(work, { recursive: true, force: true }).catch(() => {})
}
