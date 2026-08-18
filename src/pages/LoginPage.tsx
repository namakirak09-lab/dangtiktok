import { useState } from 'react'
import { ArrowRight, Images, ShieldCheck, Smartphone } from 'lucide-react'
import { isConfigured, supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) {
      setMessage('Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Đã tạo tài khoản. Nếu Supabase bật xác nhận email, kiểm tra hộp thư rồi đăng nhập.')
        setMode('login')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-brand"><span>PF</span><strong>PostFlow</strong></div>
        <h1>Ném ảnh vào.<br />Xếp đúng thứ tự.<br /><em>Web lo phần còn lại.</em></h1>
        <p>Photo carousel TikTok, lịch đăng nhiều tài khoản và preset caption/hashtag — chạy trên cloud, không cần treo máy.</p>
        <div className="feature-pills">
          <span><Images size={17} /> Photo carousel</span>
          <span><Smartphone size={17} /> Laptop + Android</span>
          <span><ShieldCheck size={17} /> Không lưu token ở trình duyệt</span>
        </div>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div>
          <span className="eyebrow">POSTFLOW</span>
          <h2>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h2>
          <p>Giao diện quản lý riêng của ông.</p>
        </div>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
        <label>Mật khẩu<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" /></label>
        {message && <div className="form-message">{message}</div>}
        <button className="primary-btn wide" type="submit" disabled={busy}>{busy ? 'Đang xử lý...' : (mode === 'login' ? 'Vào PostFlow' : 'Tạo tài khoản')} <ArrowRight size={18} /></button>
        <button type="button" className="text-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </form>
    </div>
  )
}
