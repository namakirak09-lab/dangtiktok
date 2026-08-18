const btn = document.getElementById('exportBtn')
const statusEl = document.getElementById('status')

function setStatus(text, kind='') {
  statusEl.textContent = text
  statusEl.className = `status ${kind}`.trim()
}

function mapSameSite(value) {
  if (value === 'strict') return 'Strict'
  if (value === 'no_restriction') return 'None'
  return 'Lax'
}

async function getTikTokTab() {
  const tabs = await chrome.tabs.query({ url: ['https://*.tiktok.com/*'] })
  if (!tabs.length) throw new Error('Hãy mở tiktok.com và đăng nhập trước.')
  return tabs.find((t) => t.active) || tabs[0]
}

async function readPageState(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      origin: location.origin,
      localStorage: Object.keys(localStorage).map((name) => ({ name, value: localStorage.getItem(name) || '' })),
      profile: {
        userAgent: navigator.userAgent,
        locale: navigator.language || 'vi-VN',
        languages: navigator.languages || [],
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        viewport: { width: window.innerWidth || 1280, height: window.innerHeight || 800 },
        exportedAt: new Date().toISOString()
      }
    })
  })
  return result?.[0]?.result
}

btn.addEventListener('click', async () => {
  btn.disabled = true
  setStatus('Đang đọc phiên TikTok...')
  try {
    const tab = await getTikTokTab()
    if (!tab.id) throw new Error('Không đọc được tab TikTok.')
    const cookies = await chrome.cookies.getAll({ domain: 'tiktok.com' })
    if (!cookies.length) throw new Error('Không thấy cookie TikTok. Hãy chắc chắn ông đã đăng nhập.')

    const pageState = await readPageState(tab.id)
    const exported = {
      version: 1,
      storageState: {
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          expires: c.expirationDate ?? -1,
          httpOnly: Boolean(c.httpOnly),
          secure: Boolean(c.secure),
          sameSite: mapSameSite(c.sameSite)
        })),
        origins: pageState?.origin ? [{ origin: pageState.origin, localStorage: pageState.localStorage || [] }] : []
      },
      clientProfile: pageState?.profile || {}
    }

    const blob = new Blob([JSON.stringify(exported)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: `postflow-tiktok-session-${Date.now()}.json`,
      saveAs: true
    })
    setStatus('Đã xuất file phiên. Quay lại PostFlow và bấm “Nhập phiên Chrome”.', 'ok')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'err')
  } finally {
    btn.disabled = false
  }
})
