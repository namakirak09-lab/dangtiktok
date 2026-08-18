const btn = document.getElementById('exportBtn')
const statusEl = document.getElementById('status')

function setStatus(text, kind='') {
  statusEl.textContent = text
  statusEl.className = `status ${kind}`.trim()
}

function sameSiteValue(value) {
  if (value === 'strict') return 'Strict'
  if (value === 'lax') return 'Lax'
  if (value === 'no_restriction') return 'None'
  return undefined
}

async function getTikTokTabs() {
  const tabs = await chrome.tabs.query({ url: ['https://*.tiktok.com/*'] })
  if (!tabs.length) throw new Error('Hãy mở tiktok.com và đăng nhập trước.')
  return tabs
}

async function readPageState(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      origin: location.origin,
      path: location.pathname,
      localStorage: Object.keys(localStorage).map((name) => ({ name, value: localStorage.getItem(name) || '' })),
      sessionStorage: Object.keys(sessionStorage).map((name) => ({ name, value: sessionStorage.getItem(name) || '' })),
      profile: {
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        locale: navigator.language || 'vi-VN',
        languages: navigator.languages || [],
        timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        viewport: { width: window.innerWidth || 1280, height: window.innerHeight || 800 },
        screen: { width: screen.width || 1280, height: screen.height || 800, colorDepth: screen.colorDepth || 24 },
        exportedAt: new Date().toISOString()
      }
    })
  })
  return result?.[0]?.result
}

function mapCookie(c) {
  const cookie = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: c.expirationDate ?? -1,
    httpOnly: Boolean(c.httpOnly),
    secure: Boolean(c.secure),
  }
  const ss = sameSiteValue(c.sameSite)
  if (ss) cookie.sameSite = ss
  if (c.partitionKey?.topLevelSite) cookie.partitionKey = c.partitionKey.topLevelSite
  return cookie
}

btn.addEventListener('click', async () => {
  btn.disabled = true
  setStatus('Đang đọc đầy đủ phiên TikTok...')
  try {
    const tabs = await getTikTokTabs()
    const active = tabs.find((t) => t.active) || tabs[0]
    if (!active?.id) throw new Error('Không đọc được tab TikTok.')

    const cookies = await chrome.cookies.getAll({ domain: 'tiktok.com' })
    if (!cookies.length) throw new Error('Không thấy cookie TikTok. Hãy chắc chắn ông đã đăng nhập.')
    const authCookie = cookies.some((c) => /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss)$/i.test(c.name))
    if (!authCookie) throw new Error('Chrome chưa có cookie đăng nhập TikTok. Hãy đăng nhập xong rồi tải lại tiktok.com trước khi xuất phiên.')

    const pageStates = []
    for (const tab of tabs.slice(0, 8)) {
      if (!tab.id) continue
      try {
        const state = await readPageState(tab.id)
        if (state?.origin) pageStates.push(state)
      } catch {}
    }
    const primary = pageStates.find((x) => x && !/\/login/i.test(x.path || '')) || pageStates[0]
    if (!primary) throw new Error('Không đọc được trạng thái trang TikTok.')

    const originMap = new Map()
    const sessionMap = new Map()
    for (const state of pageStates) {
      if (!originMap.has(state.origin)) originMap.set(state.origin, state.localStorage || [])
      if (!sessionMap.has(state.origin)) sessionMap.set(state.origin, state.sessionStorage || [])
    }

    const exported = {
      version: 2,
      storageState: {
        cookies: cookies.map(mapCookie),
        origins: [...originMap.entries()].map(([origin, localStorage]) => ({ origin, localStorage }))
      },
      sessionStorage: [...sessionMap.entries()].map(([origin, values]) => ({ origin, values })),
      clientProfile: primary.profile || {}
    }

    const blob = new Blob([JSON.stringify(exported)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: `postflow-tiktok-session-v2-${Date.now()}.json`,
      saveAs: true
    })
    setStatus('Đã xuất phiên v2. Quay lại PostFlow và nhập file này.', 'ok')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), 'err')
  } finally {
    btn.disabled = false
  }
})
