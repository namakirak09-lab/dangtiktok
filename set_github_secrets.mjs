import fs from 'node:fs/promises'
import sodium from 'libsodium-wrappers'

const GITHUB_REPO = 'namakirak09-lab/dangtiktok'
const GITHUB_PAT = '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'

const deploymentInfo = JSON.parse(await fs.readFile('supabase_deployment_info.json', 'utf8'))
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_ENCRYPTION_KEY } = deploymentInfo

async function gh(endpoint, options = {}) {
  const url = `https://api.github.com${endpoint}`
  const r = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PostFlow-Deployer',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
  const text = await r.text()
  try {
    const data = JSON.parse(text)
    if (!r.ok) throw new Error(`GitHub API ${endpoint} returned ${r.status}: ${text}`)
    return data
  } catch (e) {
    if (!r.ok) throw new Error(`GitHub API ${endpoint} returned ${r.status}: ${text}`)
    return text
  }
}

async function main() {
  await sodium.ready
  console.log('Fetching repository public key for secrets...')
  const pubKey = await gh(`/repos/${GITHUB_REPO}/actions/secrets/public-key`)
  console.log('Public key id:', pubKey.key_id)

  const secrets = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SESSION_ENCRYPTION_KEY,
  }

  for (const [name, val] of Object.entries(secrets)) {
    console.log(`Setting GitHub Actions secret: ${name}...`)
    const bckey = Buffer.from(pubKey.key, 'base64')
    const sec = Buffer.from(val)
    const encBytes = sodium.crypto_box_seal(sec, bckey)
    const encVal = Buffer.from(encBytes).toString('base64')

    await gh(`/repos/${GITHUB_REPO}/actions/secrets/${name}`, {
      method: 'PUT',
      body: JSON.stringify({
        encrypted_value: encVal,
        key_id: pubKey.key_id,
      }),
    })
    console.log(`Secret ${name} set successfully.`)
  }

  console.log('All GitHub Actions secrets configured successfully!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
