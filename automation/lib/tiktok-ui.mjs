const TEXT = {
  photo: /(^|\s)(photo|photos|ảnh|hình ảnh)(\s|$)/i,
  addSound: /(add sound|sounds?|thêm âm thanh|âm thanh)/i,
  search: /(search|tìm kiếm|tìm)/i,
  post: /^(post|đăng)$/i,
  caption: /(caption|description|mô tả|chú thích)/i,
  challenge: /(captcha|verify to continue|verification required|xác minh|confirm your age|age verification|xác nhận tuổi|security check|two-step verification|2-step verification)/i,
  success: /(posted|post uploaded|upload complete|đã đăng|đăng thành công|processing your post|your post is being processed)/i,
}

export class NeedsAttention extends Error {
  constructor(message) { super(message); this.name = 'NeedsAttention' }
}

async function visibleText(page) {
  try { return (await page.locator('body').innerText({ timeout: 3000 })).slice(0, 30000) } catch { return '' }
}

export async function assertNoChallenge(page) {
  const text = await visibleText(page)
  if (TEXT.challenge.test(text)) throw new NeedsAttention('TikTok yêu cầu xác nhận phiên. Hãy cập nhật lại phiên từ Chrome.')
  if (/\/login(\/|\?|$)/i.test(page.url())) throw new NeedsAttention('Phiên TikTok đã hết hạn. Hãy cập nhật lại phiên từ Chrome.')
}

async function imageFileInput(page) {
  const inputs = page.locator('input[type="file"]')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i)
    const accept = ((await input.getAttribute('accept')) || '').toLowerCase()
    const multiple = await input.getAttribute('multiple')
    if (/image|jpg|jpeg|png|webp/.test(accept) || (multiple !== null && !/video/.test(accept))) return input
  }
  return null
}

export async function detectPhotoCapability(page) {
  await assertNoChallenge(page)
  if (await imageFileInput(page)) return true

  const photoTab = page.getByText(TEXT.photo).first()
  if (await photoTab.isVisible().catch(() => false)) {
    await photoTab.click().catch(() => {})
    await page.waitForTimeout(1000)
    if (await imageFileInput(page)) return true
  }
  return false
}

export async function openPhotoComposer(page) {
  const configured = (process.env.TIKTOK_UPLOAD_URLS || process.env.TIKTOK_UPLOAD_URL || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const urls = [...configured,
    'https://www.tiktok.com/tiktokstudio/upload',
    'https://www.tiktok.com/upload?lang=vi-VN',
  ].filter((url, index, list) => list.indexOf(url) === index)

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(1600)
      await assertNoChallenge(page)
      if (await detectPhotoCapability(page)) return { ok: true, url: page.url() }
    } catch (err) {
      if (err instanceof NeedsAttention && !/Photo upload/.test(err.message)) throw err
    }
  }
  return { ok: false, url: page.url() }
}

async function findImageInput(page) {
  let input = await imageFileInput(page)
  if (input) return input

  const photoTab = page.getByText(TEXT.photo).first()
  if (await photoTab.isVisible().catch(() => false)) {
    await photoTab.click()
    await page.waitForTimeout(900)
    input = await imageFileInput(page)
    if (input) return input
  }
  throw new NeedsAttention('Không tìm thấy Photo upload trên TikTok Web của tài khoản/khu vực này.')
}

async function fillCaption(page, text) {
  if (!text) return
  const groups = [page.locator('textarea'), page.locator('[contenteditable="true"]'), page.locator('input')]
  for (const group of groups) {
    const n = await group.count()
    for (let i = 0; i < Math.min(n, 12); i++) {
      const el = group.nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      const placeholder = ((await el.getAttribute('placeholder')) || '').toLowerCase()
      const aria = ((await el.getAttribute('aria-label')) || '').toLowerCase()
      const role = ((await el.getAttribute('role')) || '').toLowerCase()
      if (TEXT.caption.test(`${placeholder} ${aria}`) || role === 'textbox' || group === groups[1]) {
        try {
          await el.fill(text)
          return
        } catch {
          try {
            await el.click()
            await page.keyboard.press('Control+A')
            await page.keyboard.insertText(text)
            return
          } catch {}
        }
      }
    }
  }
  throw new NeedsAttention('Không tìm thấy ô caption trên màn đăng TikTok.')
}

async function firstSoundResult(page) {
  const dialog = page.locator('[role="dialog"]').last()
  const root = await dialog.isVisible().catch(() => false) ? dialog : page.locator('body')
  const candidates = root.locator('[role="option"], [role="listitem"], button')
  const n = await candidates.count()
  for (let i = 0; i < Math.min(n, 80); i++) {
    const el = candidates.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    const txt = (await el.innerText().catch(() => '')).trim()
    if (!txt || txt.length > 220) continue
    if (/(search|tìm|close|đóng|cancel|hủy|add sound|thêm âm thanh|upload|post|đăng)/i.test(txt)) continue
    return el
  }
  return null
}

async function openSoundPicker(page) {
  const soundButton = page.getByText(TEXT.addSound).first()
  if (!(await soundButton.isVisible().catch(() => false))) return false
  await soundButton.click()
  await page.waitForTimeout(900)
  return true
}

async function applyMusic(page, mode, query) {
  if (mode === 'none') {
    const remove = page.getByText(/remove sound|no sound|không dùng âm thanh|xóa âm thanh|remove audio/i).first()
    if (await remove.isVisible().catch(() => false)) await remove.click().catch(() => {})
    return
  }

  const opened = await openSoundPicker(page)
  if (!opened) {
    // Some TikTok photo composers auto-attach a suggested sound and expose no Add Sound button.
    // In recommended mode that is acceptable; search mode must stop rather than guessing.
    if (mode === 'recommended') return
    throw new NeedsAttention('Không thấy nút chọn nhạc trên giao diện TikTok Web hiện tại.')
  }

  if (mode === 'recommended') {
    const recommendedTab = page.getByText(/recommended|for you|popular|đề xuất|dành cho bạn|phổ biến/i).first()
    if (await recommendedTab.isVisible().catch(() => false)) await recommendedTab.click().catch(() => {})
    await page.waitForTimeout(500)
    const first = await firstSoundResult(page)
    if (!first) throw new NeedsAttention('Đã mở kho nhạc nhưng không chọn được nhạc đề xuất.')
    await first.click()
    await page.waitForTimeout(500)
    return
  }

  const inputs = page.locator('input')
  const n = await inputs.count()
  let box = null
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i)
    if (!(await el.isVisible().catch(() => false))) continue
    const ph = `${await el.getAttribute('placeholder') || ''} ${await el.getAttribute('aria-label') || ''}`
    if (TEXT.search.test(ph)) { box = el; break }
  }
  if (!box) throw new NeedsAttention('Đã mở nhạc nhưng không tìm thấy ô tìm kiếm sound.')
  await box.fill(query)
  await page.waitForTimeout(1600)

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exact = page.getByText(new RegExp(escaped, 'i')).first()
  if (await exact.isVisible().catch(() => false)) {
    await exact.click()
  } else {
    const first = await firstSoundResult(page)
    if (!first) throw new NeedsAttention(`Không tìm thấy sound gần với “${query}”.`)
    await first.click()
  }
  await page.waitForTimeout(500)
}

async function applyComments(page, allowComments) {
  const text = page.getByText(/allow comments|comments|cho phép bình luận|bình luận/i).first()
  if (!(await text.isVisible().catch(() => false))) return

  const nearby = text.locator('xpath=ancestor::*[self::label or @role="switch" or @role="checkbox" or .//input[@type="checkbox"]][1]')
  let toggle = nearby.locator('input[type="checkbox"], [role="switch"], [role="checkbox"]').first()
  if (!(await toggle.count())) {
    toggle = page.locator('[role="switch"], [role="checkbox"]').filter({ hasText: /comments|bình luận/i }).first()
  }
  if (!(await toggle.count())) return

  let isOn = await toggle.isChecked().catch(() => null)
  if (isOn === null) isOn = (await toggle.getAttribute('aria-checked')) === 'true'
  if (Boolean(isOn) !== Boolean(allowComments)) await toggle.click().catch(() => {})
}

async function applyPrivacy(page, privacy) {
  const desired = privacy === 'public'
    ? /public|everyone|công khai|mọi người/i
    : privacy === 'friends'
      ? /friends|bạn bè/i
      : /private|only you|chỉ mình tôi|riêng tư/i

  const combos = page.locator('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')
  const n = await combos.count()
  for (let i = 0; i < Math.min(n, 20); i++) {
    const combo = combos.nth(i)
    if (!(await combo.isVisible().catch(() => false))) continue
    const txt = `${await combo.innerText().catch(() => '')} ${await combo.getAttribute('aria-label') || ''}`
    if (!/(who can|view|visibility|privacy|ai có thể|quyền xem|công khai|public|friends|private|bạn bè|riêng tư)/i.test(txt)) continue
    if (desired.test(txt)) return
    await combo.click().catch(() => {})
    await page.waitForTimeout(300)
    const option = page.getByText(desired).last()
    if (await option.isVisible().catch(() => false)) {
      await option.click()
      return
    }
  }

  // Some layouts render the choices as visible radios.
  const target = page.getByText(desired).last()
  if (await target.isVisible().catch(() => false)) {
    const role = (await target.getAttribute('role')) || ''
    if (/option|radio|menuitem/.test(role)) await target.click().catch(() => {})
  }
}

async function waitPostButton(page) {
  const deadline = Date.now() + 75_000
  while (Date.now() < deadline) {
    await assertNoChallenge(page)
    let button = page.getByRole('button', { name: TEXT.post }).first()
    if (!(await button.isVisible().catch(() => false))) button = page.getByText(TEXT.post).first()
    if (await button.isVisible().catch(() => false)) {
      const disabled = await button.isDisabled().catch(() => false)
      if (!disabled) return button
    }
    await page.waitForTimeout(1200)
  }
  throw new NeedsAttention('Ảnh chưa sẵn sàng hoặc nút Đăng vẫn bị khóa sau 75 giây.')
}

export async function postPhotoCarousel({ page, imagePaths, description, musicMode, musicQuery, privacyLabel, allowComments }) {
  const composer = await openPhotoComposer(page)
  if (!composer.ok) throw new NeedsAttention('Không tìm thấy Photo mode trên các giao diện upload TikTok Web hiện tại.')
  const input = await findImageInput(page)
  await input.setInputFiles(imagePaths)
  await page.waitForTimeout(Math.min(15_000, 2000 + imagePaths.length * 420))
  await assertNoChallenge(page)

  await fillCaption(page, description)
  await applyPrivacy(page, privacyLabel)
  await applyComments(page, allowComments)
  await applyMusic(page, musicMode, musicQuery)
  await assertNoChallenge(page)

  const postButton = await waitPostButton(page)
  await postButton.click()

  const deadline = Date.now() + 20_000
  let confirmed = false
  while (Date.now() < deadline) {
    await page.waitForTimeout(1200)
    await assertNoChallenge(page)
    const text = await visibleText(page)
    if (TEXT.success.test(text) || !/upload|tiktokstudio\/upload/i.test(page.url())) {
      confirmed = true
      break
    }
  }
  return { confirmed, url: page.url() }
}
