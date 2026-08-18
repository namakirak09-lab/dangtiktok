import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { decryptJson, encryptJson } from './lib/crypto.mjs'
import { NeedsAttention, postPhotoCarousel } from './lib/tiktok-ui.mjs'
import { baseContextOptions, seedPersistentContext, unpackSessionPayload } from './lib/browser-profile.mjs'
import { restoreEncryptedProfile, saveEncryptedProfile } from './lib/profile-store.mjs'
import { downloadAsset, getDuePosts, getUiSession, patch, uploadDiagnostic, upsert } from './lib/supabase.mjs'

const chromePath = process.env.CHROME_BIN || '/usr/bin/google-chrome'
const runnerJobId = process.env.RUNNER_JOB_ID || ''
const maxRetries = Number(process.env.MAX_RETRIES || 3)

async function updateRunner(body) {
  if (!runnerJobId) return
  await patch('runner_jobs', `id=eq.${encodeURIComponent(runnerJobId)}`, body).catch((err) => console.error('Runner state update:', err))
}

await updateRunner({ status: 'running', started_at: new Date().toISOString(), error: null })

let fatalError = null
try {
  const posts = await getDuePosts(Number(process.env.MAX_POSTS_PER_RUN || 8))
  if (!posts?.length) {
    console.log('No due posts.')
  } else {
    for (const post of posts) {
      if (post.account?.status !== 'ready') {
        await patch('posts', `id=eq.${post.id}`, { status: 'needs_attention', failure_reason: 'Tài khoản chưa sẵn sàng. Cập nhật lại phiên từ Chrome.' })
        continue
      }

      const attempt = Number(post.attempt_count || 0) + 1
      await patch('posts', `id=eq.${post.id}`, { status: 'processing', failure_reason: null, attempt_count: attempt })
      const work = await fs.mkdtemp(path.join(os.tmpdir(), 'postflow-'))
      let context
      let page
      try {
        const session = await getUiSession(post.account_id)
        if (!session?.encrypted_storage_state) throw new NeedsAttention('Không có phiên TikTok đã lưu.')
        const payload = unpackSessionPayload(decryptJson(session.encrypted_storage_state))
        const profile = session.client_profile || {}

        const assets = [...(post.post_assets || [])].sort((a, b) => a.sort_order - b.sort_order)
        if (!assets.length) throw new Error('Post không có ảnh.')
        const imagePaths = []
        for (let i = 0; i < assets.length; i++) {
          const bytes = await downloadAsset(assets[i].storage_path)
          const ext = path.extname(assets[i].storage_path) || '.jpg'
          const target = path.join(work, `${String(i + 1).padStart(2, '0')}${ext}`)
          await fs.writeFile(target, bytes)
          imagePaths.push(target)
        }

        const profileDir = path.join(work, 'chrome-profile')
        await fs.mkdir(profileDir, { recursive: true })
        await restoreEncryptedProfile(post.account_id, profileDir, work).catch((err) => {
          console.warn('No reusable cloud profile restored:', err?.message || err)
          return false
        })
        context = await chromium.launchPersistentContext(profileDir, {
          ...baseContextOptions(profile),
          headless: true,
          executablePath: chromePath,
          args: [
            '--disable-dev-shm-usage',
            '--window-size=1280,800',
            '--lang=vi-VN',
          ],
        })
        await seedPersistentContext(context, payload.storageState, payload.sessionStorage)
        page = context.pages()[0] || await context.newPage()

        const result = await postPhotoCarousel({
          page,
          imagePaths,
          description: post.description || '',
          musicMode: post.music_mode,
          musicQuery: post.music_query || '',
          privacyLabel: post.privacy_label,
          allowComments: post.allow_comments,
        })

        // Mark the post first. Session/profile refresh is best-effort after the post click,
        // so a storage failure cannot cause an automatic duplicate retry.
        await patch('posts', `id=eq.${post.id}`, {
          status: result.confirmed ? 'published' : 'submitted',
          runner_meta: { final_url: result.url, finished_at: new Date().toISOString() },
          failure_reason: null,
        })
        await patch('tiktok_accounts', `id=eq.${post.account_id}`, { status: 'ready', attention_reason: null, last_health_at: new Date().toISOString() })

        try {
          const updatedState = await context.storageState({ indexedDB: true })
          await upsert('ui_sessions', {
            account_id: post.account_id,
            encrypted_storage_state: encryptJson({ storageState: updatedState, sessionStorage: payload.sessionStorage }),
            last_ok_at: new Date().toISOString(),
          }, 'account_id')
          await context.close()
          context = null
          await saveEncryptedProfile(post.account_id, profileDir, work)
        } catch (stateErr) {
          console.warn('Post succeeded but session/profile refresh failed:', stateErr)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        let diagnosticsPath = null
        try {
          if (page) {
            const png = await page.screenshot({ fullPage: true })
            diagnosticsPath = `${post.owner_id}/${post.id}-${Date.now()}.png`
            await uploadDiagnostic(diagnosticsPath, png)
          }
        } catch {}

        const needsAttention = err instanceof NeedsAttention
        if (needsAttention) {
          await patch('posts', `id=eq.${post.id}`, { status: 'needs_attention', failure_reason: message, diagnostics_path: diagnosticsPath })
          await patch('tiktok_accounts', `id=eq.${post.account_id}`, { status: 'needs_attention', attention_reason: message })
        } else if (attempt < maxRetries) {
          const retryAt = new Date(Date.now() + Math.min(15, attempt * 3) * 60 * 1000).toISOString()
          await patch('posts', `id=eq.${post.id}`, {
            status: 'scheduled',
            scheduled_at: retryAt,
            failure_reason: `Lần ${attempt}/${maxRetries}: ${message}`,
            diagnostics_path: diagnosticsPath,
          })
        } else {
          await patch('posts', `id=eq.${post.id}`, { status: 'failed', failure_reason: message, diagnostics_path: diagnosticsPath })
        }
        console.error(`Post ${post.id}:`, err)
      } finally {
        if (context) await context.close().catch(() => {})
        await fs.rm(work, { recursive: true, force: true })
      }
    }
  }
} catch (err) {
  fatalError = err instanceof Error ? err.message : String(err)
  console.error('Runner fatal:', err)
} finally {
  await updateRunner({
    status: fatalError ? 'failed' : 'complete',
    finished_at: new Date().toISOString(),
    error: fatalError,
  })
}

if (fatalError) process.exit(1)
