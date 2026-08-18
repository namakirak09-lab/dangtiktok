import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { decryptBuffer, encryptBuffer } from './crypto.mjs'
import { downloadPrivateObject, uploadPrivateObject } from './supabase.mjs'

const execFileAsync = promisify(execFile)

function profilePath(accountId) {
  return `${accountId}/chrome-profile.enc`
}

async function runTar(args, cwd) {
  const candidates = process.platform === 'win32' ? ['tar.exe', 'tar'] : ['tar']
  let last
  for (const command of candidates) {
    try {
      await execFileAsync(command, args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
      return
    } catch (err) { last = err }
  }
  throw last || new Error('tar unavailable')
}

export async function restoreEncryptedProfile(accountId, profileDir, workDir) {
  const encrypted = await downloadPrivateObject('browser-profiles', profilePath(accountId), true)
  if (!encrypted) return false
  const archive = path.join(workDir, 'profile.tar')
  try {
    await fs.mkdir(profileDir, { recursive: true })
    await fs.writeFile(archive, decryptBuffer(encrypted))
    await runTar(['-xf', archive, '-C', profileDir], workDir)
    await fs.rm(archive, { force: true })
    return true
  } catch (err) {
    await fs.rm(archive, { force: true }).catch(() => {})
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

async function pruneProfile(profileDir) {
  const targets = [
    'Default/Cache',
    'Default/Code Cache',
    'Default/GPUCache',
    'Default/Service Worker/CacheStorage',
    'Default/Service Worker/ScriptCache',
    'GrShaderCache',
    'ShaderCache',
    'GraphiteDawnCache',
    'Crashpad',
    'BrowserMetrics',
  ]
  for (const rel of targets) await fs.rm(path.join(profileDir, ...rel.split('/')), { recursive: true, force: true }).catch(() => {})
}

export async function saveEncryptedProfile(accountId, profileDir, workDir) {
  await pruneProfile(profileDir)
  const archive = path.join(workDir, 'profile.tar')
  await fs.rm(archive, { force: true })
  await runTar(['-cf', archive, '-C', profileDir, '.'], workDir)
  const bytes = await fs.readFile(archive)
  // Avoid silently filling the free storage tier with a pathological Chrome profile.
  if (bytes.length > 120 * 1024 * 1024) throw new Error(`Chrome profile too large: ${Math.round(bytes.length / 1024 / 1024)} MB`)
  await uploadPrivateObject('browser-profiles', profilePath(accountId), encryptBuffer(bytes))
  await fs.rm(archive, { force: true })
  return bytes.length
}
