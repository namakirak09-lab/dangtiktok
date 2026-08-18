import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Link2, LoaderCircle, RefreshCw, Smartphone, Trash2, UserRoundPlus } from 'lucide-react'
import type { PairingSession, TikTokAccount } from '../lib/types'
import { invokeJson, supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'

export function AccountsPage({ accounts, refresh }: { accounts: TikTokAccount[]; refresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [pairing, setPairing] = useState<Record<string, PairingSession>>({})

  async function loadPairing() {
    const { data } = await supabase.from('pairing_sessions').select('*').in('status', ['starting', 'ready', 'finishing']).order('created_at', { ascending: false })
    const map: Record<string, PairingSession> = {}
    for (const row of (data || []) as PairingSession[]) if (!map[row.account_id]) map[row.account_id] = row
    setPairing(map)
  }

  useEffect(() => {
    loadPairing()
    const timer = window.setInterval(async () => { await loadPairing(); await refresh() }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  async function addAccount() {
    const label = newLabel.trim()
    if (!label) return setError('Đặt tên để phân biệt tài khoản, ví dụ: Casio 01.')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { data, error: insertError } = await supabase.from('tiktok_accounts').insert({ owner_id: userData.user.id, label }).select('*').single()
    if (insertError) return setError(insertError.message)
    setNewLabel('')
    await refresh()
    await pair(data.id)
  }

  async function pair(id: string) {
    setBusyId(id)
    setError('')
    try {
      await invokeJson('start-pairing', { account_id: id })
      await loadPairing()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khởi động được phiên ghép TikTok.')
    } finally {
      setBusyId('')
    }
  }

  async function finishPair(session: PairingSession) {
    setBusyId(session.account_id)
    try {
      await invokeJson('pairing-control', { pairing_id: session.id, action: 'finish' })
      await loadPairing()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được phiên.')
    } finally {
      setBusyId('')
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Xóa tài khoản này và phiên đăng nhập đã lưu?')) return
    setBusyId(id)
    try {
      const { error: e } = await supabase.from('tiktok_accounts').delete().eq('id', id)
      if (e) throw e
      await refresh()
      await loadPairing()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được tài khoản.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><span className="eyebrow">ACCOUNTS</span><h1>Tài khoản TikTok</h1><p>Ghép một lần bằng cửa sổ TikTok thật; sau đó cloud dùng lại phiên đã mã hóa.</p></div>
      </header>
      {error && <div className="notice error page-notice">{error}</div>}

      <section className="panel quick-add-account">
        <div><strong>Thêm tài khoản</strong><span>Không cần TikTok Developer App.</span></div>
        <div className="quick-add-row"><input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ví dụ: Casio 01" /><button className="primary-btn" onClick={addAccount}><UserRoundPlus size={18} /> Thêm & ghép phiên</button></div>
      </section>

      <div className="account-grid-page">
        {accounts.map((account) => {
          const pairSession = pairing[account.id]
          const isReady = account.status === 'ready'
          const needsAttention = account.status === 'needs_attention'
          return (
            <article className="panel account-card" key={account.id}>
              <div className="account-main">
                {account.avatar_url ? <img className="account-avatar" src={account.avatar_url} alt="" /> : <div className="account-avatar fallback"><Smartphone size={24} /></div>}
                <div><strong>{account.nickname || account.label}</strong><span>{account.username ? `@${account.username}` : account.label}</span>
                  <div className={`connected-line ${needsAttention ? 'attention' : ''}`}>{isReady ? <><CheckCircle2 size={14} /> Sẵn sàng tự đăng</> : needsAttention ? <><AlertTriangle size={14} /> Cần xác nhận lại</> : <><LoaderCircle size={14} /> Chưa ghép phiên</>}</div>
                </div>
              </div>

              <div className="account-stats">
                <div><span>Kiểu chạy</span><strong>{account.driver === 'web_ui' ? 'TikTok Web UI' : 'Android UI'}</strong></div>
                <div><span>Kiểm tra gần nhất</span><strong>{account.last_health_at ? formatDateTime(account.last_health_at) : 'Chưa có'}</strong></div>
              </div>

              {account.attention_reason && <div className="error-strip">{account.attention_reason}</div>}

              {pairSession && (
                <div className="pair-box">
                  {pairSession.status === 'starting' && <div className="progress-line"><span />Đang dựng cửa sổ TikTok trên cloud...</div>}
                  {pairSession.live_url && <>
                    <a className="primary-btn wide" href={pairSession.live_url} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Mở TikTok để đăng nhập</a>
                    {pairSession.view_password && <div className="pair-password">Mật khẩu cửa sổ: <code>{pairSession.view_password}</code></div>}
                    <button className="secondary-btn wide" disabled={busyId === account.id} onClick={() => finishPair(pairSession)}><CheckCircle2 size={17} /> Đã đăng nhập xong — lưu phiên</button>
                  </>}
                </div>
              )}

              <div className="card-actions">
                <button className="secondary-btn" disabled={busyId === account.id || !!pairSession} onClick={() => pair(account.id)}><RefreshCw size={16} className={busyId === account.id ? 'spin' : ''} /> {isReady ? 'Ghép lại phiên' : 'Ghép phiên'}</button>
                <button className="icon-danger" disabled={busyId === account.id} onClick={() => remove(account.id)}><Trash2 size={17} /></button>
              </div>
            </article>
          )
        })}

        {!accounts.length && <div className="panel add-account-card static"><div className="big-add"><Link2 size={26} /></div><strong>Chưa có tài khoản</strong><span>Thêm tài khoản ở ô phía trên. Mỗi nick chỉ cần ghép phiên ban đầu một lần.</span></div>}
      </div>

      <section className="panel info-panel"><strong>Không lách xác minh</strong><p>Nếu TikTok hiện CAPTCHA, 2FA hoặc yêu cầu xác nhận tuổi, PostFlow không vượt qua nó. Cửa sổ ghép phiên sẽ để ông tự xác nhận một lần; sau đó hệ thống lưu session mã hóa. Nếu TikTok bắt lại sau này, job chuyển sang “Cần xác nhận” thay vì đăng sai.</p></section>
    </div>
  )
}
