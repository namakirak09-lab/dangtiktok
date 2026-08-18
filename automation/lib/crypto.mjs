import crypto from 'node:crypto'

function keyBytes() {
  const raw = process.env.SESSION_ENCRYPTION_KEY
  if (!raw) throw new Error('Missing SESSION_ENCRYPTION_KEY')
  return crypto.createHash('sha256').update(raw).digest()
}

export function encryptJson(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv)
  const clear = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptJson(blob) {
  if (!blob) return null
  const [version, ivB64, tagB64, dataB64] = String(blob).split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Unsupported session blob')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  const clear = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()])
  return JSON.parse(clear.toString('utf8'))
}
