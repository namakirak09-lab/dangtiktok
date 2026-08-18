import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import type { PostingDefaults, ZaloPreset } from '../lib/types'
import { normalizeHashtags } from '../lib/utils'
import { supabase } from '../lib/supabase'

export function SettingsPage({ defaults, presets, refresh }: { defaults: PostingDefaults; presets: ZaloPreset[]; refresh: () => Promise<void> }) {
  const [form, setForm] = useState(defaults)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => setForm(defaults), [defaults])

  async function saveDefaults() {
    setMessage('')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const payload = {
      owner_id: userData.user.id,
      caption_template: form.caption_template,
      hashtag_text: normalizeHashtags(form.hashtag_text),
      privacy_label: form.privacy_label,
      allow_comments: form.allow_comments,
      default_music_mode: form.default_music_mode,
      default_music_query: form.default_music_query,
      default_zalo_preset_id: form.default_zalo_preset_id || null,
    }
    const { error } = await supabase.from('posting_defaults').upsert(payload, { onConflict: 'owner_id' })
    if (error) return setMessage(error.message)
    setMessage('Đã lưu mặc định.')
    await refresh()
  }

  async function addPreset() {
    if (!name.trim() || !text.trim()) return
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { error } = await supabase.from('zalo_presets').insert({ owner_id: userData.user.id, name: name.trim(), text: text.trim() })
    if (!error) { setName(''); setText(''); await refresh() }
  }

  async function removePreset(id: string) {
    await supabase.from('zalo_presets').delete().eq('id', id)
    if (form.default_zalo_preset_id === id) setForm({ ...form, default_zalo_preset_id: null })
    await refresh()
  }

  return (
    <div className="page-wrap">
      <header className="page-header"><div><span className="eyebrow">DEFAULTS</span><h1>Cài đặt mặc định</h1><p>Thiết lập một lần; lần sau chỉ thả ảnh và bấm đăng.</p></div><button className="primary-btn" onClick={saveDefaults}><Save size={17} /> Lưu</button></header>

      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="section-title"><strong>Caption, hashtag & nhạc</strong><span>Tự điền khi tạo bài mới</span></div>
          <label>Caption mặc định<textarea rows={5} value={form.caption_template} onChange={(e) => setForm({ ...form, caption_template: e.target.value })} /></label>
          <label>Hashtag mặc định<textarea rows={3} value={form.hashtag_text} onChange={(e) => setForm({ ...form, hashtag_text: e.target.value })} placeholder="#casio #toan12 #onthidaihoc" /></label>
          <div className="two-col">
            <label>Quyền xem mặc định<select value={form.privacy_label} onChange={(e) => setForm({ ...form, privacy_label: e.target.value as PostingDefaults['privacy_label'] })}><option value="public">Công khai</option><option value="friends">Bạn bè</option><option value="private">Riêng tư</option></select></label>
            <label>CTA mặc định<select value={form.default_zalo_preset_id || ''} onChange={(e) => setForm({ ...form, default_zalo_preset_id: e.target.value || null })}><option value="">Không có</option>{presets.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          </div>
          <label>Nhạc mặc định<select value={form.default_music_mode} onChange={(e) => setForm({ ...form, default_music_mode: e.target.value as PostingDefaults['default_music_mode'] })}><option value="recommended">Giữ nhạc TikTok đề xuất</option><option value="search">Tìm theo tên</option><option value="none">Không nhạc</option></select></label>
          {form.default_music_mode === 'search' && <label>Tên nhạc mặc định<input value={form.default_music_query} onChange={(e) => setForm({ ...form, default_music_query: e.target.value })} placeholder="Tên sound / bài hát" /></label>}
          <label className="setting-toggle"><div><strong>Cho phép bình luận</strong><span>Runner sẽ giữ/bật tùy chọn này trên màn đăng nếu TikTok hiển thị.</span></div><button type="button" className={`toggle ${form.allow_comments ? 'on' : ''}`} onClick={() => setForm({ ...form, allow_comments: !form.allow_comments })}><i /></button></label>
          {message && <div className="form-message ok-text">{message}</div>}
        </section>

        <section className="panel settings-card">
          <div className="section-title"><strong>CTA Zalo</strong><span>Tạo nhiều preset để chia traffic</span></div>
          <div className="preset-list">
            {presets.map((preset) => <div className="preset-item" key={preset.id}><div><strong>{preset.name}</strong><span>{preset.text}</span></div><button className="icon-danger" onClick={() => removePreset(preset.id)}><Trash2 size={16} /></button></div>)}
            {!presets.length && <div className="mini-empty">Chưa có preset Zalo.</div>}
          </div>
          <div className="preset-form"><label>Tên preset<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zalo tư vấn 1" /></label><label>Nội dung CTA<textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tài liệu/trao đổi: Zalo 09xx..." /></label><button className="secondary-btn" onClick={addPreset}><Plus size={17} /> Thêm preset</button></div>
        </section>
      </div>
    </div>
  )
}
