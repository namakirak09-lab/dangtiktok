import fs from 'node:fs/promises'
import path from 'node:path'

const GITHUB_REPO = 'namakirak09-lab/dangtiktok'
const GITHUB_PAT = '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'
const PROJECT_DIR = 'd:/postflow-tiktok-ui-automation-v2.1/postflow-ui-automation'

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

async function getAllFiles(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  let files = []
  for (const entry of entries) {
    const res = path.join(dir, entry.name)
    const rel = base ? `${base}/${entry.name}` : entry.name
    // Only exclude .git folder and node_modules / dist, NOT .github
    if (rel === '.git' || rel.startsWith('.git/') || rel === 'node_modules' || rel.startsWith('node_modules/') || rel === 'dist' || rel.startsWith('dist/')) {
      continue
    }
    if (entry.isDirectory()) {
      files = files.concat(await getAllFiles(res, rel))
    } else {
      files.push({ fullPath: res, path: rel.replace(/\\/g, '/') })
    }
  }
  return files
}

async function pushRepo() {
  console.log('Collecting project files including .github workflows...')
  const files = await getAllFiles(PROJECT_DIR)
  console.log(`Found ${files.length} files to push.`)

  const treeEntries = []
  for (const file of files) {
    const content = await fs.readFile(file.fullPath)
    const isBinary = file.path.endsWith('.png') || file.path.endsWith('.jpg') || file.path.endsWith('.jpeg') || file.path.endsWith('.webp')
    const encoding = isBinary ? 'base64' : 'utf-8'
    const blob = await gh(`/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: content.toString(encoding),
        encoding: isBinary ? 'base64' : 'utf-8',
      }),
    })
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    })
    process.stdout.write('.')
  }
  console.log('\nAll blobs created.')

  const tree = await gh(`/repos/${GITHUB_REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: treeEntries }),
  })
  console.log('Created tree:', tree.sha)

  const ref = await gh(`/repos/${GITHUB_REPO}/git/refs/heads/main`)
  const parentCommitSha = ref.object.sha

  const commit = await gh(`/repos/${GITHUB_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Add workflows and all project files',
      tree: tree.sha,
      parents: [parentCommitSha],
    }),
  })
  console.log('Created commit:', commit.sha)

  await gh(`/repos/${GITHUB_REPO}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: true }),
  })
  console.log('Updated refs/heads/main to commit successfully!')
}

pushRepo().catch(err => {
  console.error('Push error:', err)
  process.exit(1)
})
