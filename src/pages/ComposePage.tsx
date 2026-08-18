import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Music2, Send, TriangleAlert } from 'lucide-react'
import { AccountPicker } from '../components/AccountPicker'
import { PhotoUploader } from '../components/PhotoUploader'
import type { PostingDefaults, TikTokAccount, UploadItem, ZaloPreset } from '../lib/types'
import { combineDescription, normalizeHashtags, toLocalInputValue } from '../lib/utils'
import { invokeJson, supabase } from '../lib/supabase'

export function ComposePage({
  accounts,
  defaults,
  presets,
  onGoAccounts,
  onQueued,
}: {
  accounts: TikTokAccount[]
  defaults: PostingDefaults
  presets: ZaloPreset[]
  onGoAccounts: () => void
  onQueued: () => Promise<void> | void
}) {
  const [images, setImages] = useState<UploadItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [caption, setCaption] = useState(defaults.caption_template || '')
  const [hashtags, setHashtags] = useState(defaults.hashtag_text || '')
  const [ctaId, setCtaId] = useState(defaults.default_zalo_preset_id || '')
  const [musicMode, setMusicMode] = useState<PostingDefaults['default_music_mode']>(defaults.default_music_mode || 'recommended')
  const [musicQuery, setMusicQuery] = useState(defaults.default_music_query || '')
  const [privacy, setPrivacy] = useState<PostingDefaults['privacy_label']>(defaults.privacy_label || 'public')
  const [allowComments, setAllowComments] = useState(defaults.allow_comments)
  const [when, setWhen] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000)))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setCaption(defaults.caption_template || '')
    setHashtags(defaults.hashtag_text || '')
    setCtaId(defaults.default_zalo_preset_id || '')
    setMusicMode(defaults.default_music_mode || 'recommended')
    setMusicQuery(defaults.default_music_query || '')
    setPrivacy(defaults.privacy_label || 'public')
    setAllowComments(defaults.allow_comments)
  }, [defaults])

  const selectedCta = presets.find((p) => p.id === ctaId)
  const description = combineDescription(caption, normalizeHashtags(hashtags), selectedCta?.text || '')
  const readyAccounts = accounts.filter((a) => a.status === 'ready')

  async function publish() {
    setNotice(null)
    if (!images.length) return setNotice({ type: 'error', text: 'Chưa có ảnh bro.' })
    if (images.length > 35) return setNotice({ type: 'error', text: 'TikTok photo post chỉ nên để tối đa 35 ảnh.' })
    if (!selected.length) return setNotice({ type: 'error', text: 'Chọn ít nhất một tài khoản TikTok.' })
    const bad = accounts.filter((a) => selected.includes(a.id) && a.status !== 'ready')
    if (bad.length) return setNotice({ type: 'error', text: 'Có tài khoản chưa ghép phiên hoặc đang cần xác nhận lại.' })
    if (musicMode === 'search' && !musicQuery.trim()) return setNotice({ type: 'error', text: 'Nhập tên nhạc muốn tìm trên TikTok.' })
    if (description.length > 3900) return setNotice({ type: 'error', text: 'Caption + CTA + hashtag đang quá dài.' })

    setBusy(true)
    const uploadedPaths: string[] = []
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Phiên đăng nhập PostFlow đã hết hạn.')

      const batch = crypto.randomUUID()
      const assetPaths: string[] = []
      setProgress(`Đang tải ${images.length} ảnh lên cloud...`)
      for (let i = 0; i < images.length; i += 1) {
        const item = images[i]
        const ext = item.file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${userData.user.id}/${batch}/${String(i + 1).padStart(2, '0')}-${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('tiktok-assets').upload(path, item.file, {
          cacheControl: '3600',
          upsert: false,
          contentType: item.file.type,
        })
        if (error) throw error
        assetPaths.push(path)
        uploadedPaths.push(path)
      }

      setProgress(when === 'now' ? 'Đang đưa bài vào hàng đợi...' : 'Đang lưu lịch đăng...')
      await invokeJson<{ post_ids: string[] }>('queue-post', {
        account_ids: selected,
        asset_paths: assetPaths,
        description,
        privacy_label: privacy,
        allow_comments: allowComments,
        music_mode: musicMode,
        music_query: musicMode === 'search' ? musicQuery.trim() : '',
        scheduled_at: when === 'now' ? new Date().toISOString() : new Date(scheduledAt).toISOString(),
      })

      images.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      setImages([])
      setNotice({ type: 'ok', text: when === 'now' ? 'Đã xếp hàng. Runner cloud sẽ tự thao tác TikTok.' : 'Đã lưu lịch đăng.' })
      await onQueued()
    } catch (err) {
      if (uploadedPaths.length) await supabase.storage.from('tiktok-assets').remove(uploadedPaths).catch(() => undefined)
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Có lỗi xảy ra.' })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><span className="eyebrow">PHOTO POST</span><h1>Đăng ảnh</h1><p>Ném ảnh, kéo đúng thứ tự rồi để cloud bấm TikTok thay ông.</p></div>
        <div className="status-badge"><span /> Tự động hóa UI</div>
      </header>

      <div className="compose-layout">
        <section className="panel main-panel">
          <div className="panel-head"><div><span className="step-badge">1</span><strong>Ảnh carousel</strong></div><span>Thứ tự trên web = thứ tự đăng</span></div>
          <PhotoUploader items={images} onChange={setImages} />
        </section>

        <aside className="panel publish-panel">
          <div className="panel-head"><div><span className="step-badge">2</span><strong>Đăng lên</strong></div></div>

          <div className="field-block"><label>Tài khoản</label><AccountPicker accounts={readyAccounts} selected={selected} onToggle={(id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])} onGoAccounts={onGoAccounts} /></div>

          <div className="field-block"><label>Caption</label><textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Nội dung bài đăng..." /></div>
          <div className="field-block"><label>Hashtag <small>lấy từ mặc định</small></label><textarea className="hashtag-input" rows={2} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#casio #toan12" /></div>

          <div className="field-block"><label>CTA Zalo</label><select value={ctaId} onChange={(e) => setCtaId(e.target.value)}><option value="">Không chèn CTA</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{selectedCta && <div className="preview-strip">{selectedCta.text}</div>}</div>

          <div className="two-col">
            <div className="field-block"><label>Quyền xem</label><select value={privacy} onChange={(e) => setPrivacy(e.target.value as PostingDefaults['privacy_label'])}><option value="public">Công khai</option><option value="friends">Bạn bè</option><option value="private">Riêng tư</option></select></div>
            <div className="field-block"><label>Bình luận</label><select value={allowComments ? 'on' : 'off'} onChange={(e) => setAllowComments(e.target.value === 'on')}><option value="on">Cho phép</option><option value="off">Tắt</option></select></div>
          </div>

          <div className="field-block">
            <label>Nhạc TikTok</label>
            <div className="music-card">
              <div className="music-icon"><Music2 size={19} /></div>
              <div className="music-mode-grow">
                <select value={musicMode} onChange={(e) => setMusicMode(e.target.value as PostingDefaults['default_music_mode'])}>
                  <option value="recommended">Giữ nhạc TikTok đề xuất</option>
                  <option value="search">Tìm nhạc theo tên</option>
                  <option value="none">Không nhạc</option>
                </select>
              </div>
            </div>
            {musicMode === 'search' && <input value={musicQuery} onChange={(e) => setMusicQuery(e.target.value)} placeholder="Ví dụ: Tháp rơi tự do..." />}
          </div>

          <div className="schedule-tabs">
            <button type="button" className={when === 'now' ? 'active' : ''} onClick={() => setWhen('now')}><Send size={16} /> Đăng sớm nhất</button>
            <button type="button" className={when === 'schedule' ? 'active' : ''} onClick={() => setWhen('schedule')}><CalendarDays size={16} /> Hẹn giờ</button>
          </div>
          {when === 'schedule' && <div className="field-block"><label>Thời gian</label><div className="input-icon"><Clock3 size={16} /><input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div></div>}

          {notice && <div className={`notice ${notice.type}`}>{notice.type === 'ok' ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}{notice.text}</div>}
          {progress && <div className="progress-line"><span />{progress}</div>}

          <button type="button" className="primary-btn wide big" disabled={busy} onClick={publish}>{busy ? 'Đang xử lý...' : when === 'now' ? 'Xếp hàng đăng ngay' : 'Lưu lịch tự động'} <Send size={18} /></button>
        </aside>
      </div>
    </div>
  )
}
