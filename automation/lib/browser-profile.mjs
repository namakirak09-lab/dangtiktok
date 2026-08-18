export function unpackSessionPayload(value) {
  if (value && typeof value === 'object' && value.storageState && Array.isArray(value.storageState.cookies)) {
    return {
      storageState: value.storageState,
      sessionStorage: Array.isArray(value.sessionStorage) ? value.sessionStorage : [],
    }
  }
  return { storageState: value, sessionStorage: [] }
}

function languageHeader(profile = {}) {
  const langs = Array.isArray(profile.languages) ? profile.languages.filter(Boolean).slice(0, 6) : []
  if (!langs.length && profile.locale) langs.push(profile.locale)
  if (!langs.length) langs.push('vi-VN', 'vi')
  return langs.map((lang, index) => index === 0 ? String(lang) : `${lang};q=${Math.max(0.5, 1 - index * 0.1).toFixed(1)}`).join(',')
}

export function baseContextOptions(profile = {}) {
  const viewport = profile.viewport && Number(profile.viewport.width) > 0 && Number(profile.viewport.height) > 0
    ? {
        width: Math.min(1600, Math.max(960, Number(profile.viewport.width))),
        height: Math.min(1000, Math.max(700, Number(profile.viewport.height))),
      }
    : { width: 1280, height: 800 }

  const options = {
    viewport,
    locale: typeof profile.locale === 'string' && profile.locale ? profile.locale : 'vi-VN',
    timezoneId: typeof profile.timezoneId === 'string' && profile.timezoneId ? profile.timezoneId : 'Asia/Ho_Chi_Minh',
    extraHTTPHeaders: { 'Accept-Language': languageHeader(profile) },
  }
  if (typeof profile.userAgent === 'string' && profile.userAgent.length > 20) options.userAgent = profile.userAgent
  return options
}

export function contextOptions({ storageState, profile = {} }) {
  return { ...baseContextOptions(profile), storageState }
}

export async function seedWebStorage(context, storageState, sessionStorage = []) {
  const localEntries = Array.isArray(storageState?.origins)
    ? storageState.origins.map((entry) => ({ origin: entry.origin, values: Array.isArray(entry.localStorage) ? entry.localStorage : [] }))
    : []
  const sessionEntries = Array.isArray(sessionStorage) ? sessionStorage : []
  if (!localEntries.length && !sessionEntries.length) return

  await context.addInitScript(({ localEntries, sessionEntries }) => {
    try {
      const local = localEntries.find((entry) => entry && entry.origin === location.origin)
      if (local && Array.isArray(local.values)) {
        for (const item of local.values) if (item && typeof item.name === 'string') localStorage.setItem(item.name, String(item.value ?? ''))
      }
      const session = sessionEntries.find((entry) => entry && entry.origin === location.origin)
      if (session && Array.isArray(session.values)) {
        for (const item of session.values) if (item && typeof item.name === 'string') sessionStorage.setItem(item.name, String(item.value ?? ''))
      }
    } catch {}
  }, { localEntries, sessionEntries })
}

export async function seedPersistentContext(context, storageState, sessionStorage = []) {
  if (Array.isArray(storageState?.cookies) && storageState.cookies.length) await context.addCookies(storageState.cookies)
  await seedWebStorage(context, storageState, sessionStorage)
}

export async function restoreSessionStorage(context, items = []) {
  await seedWebStorage(context, { origins: [] }, items)
}
