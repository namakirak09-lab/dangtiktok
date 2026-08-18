export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function toLocalInputValue(date = new Date()) {
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function combineDescription(caption: string, hashtags: string, cta: string) {
  return [caption.trim(), cta.trim(), hashtags.trim()].filter(Boolean).join('\n\n')
}

export function normalizeHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('#') ? part : `#${part}`))
    .join(' ')
}
