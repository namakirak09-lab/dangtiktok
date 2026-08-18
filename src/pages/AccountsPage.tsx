import { useRef, useState } from 'react'
import { CheckCircle2, FileUp, RefreshCw, Smartphone, Trash2, UserRoundPlus } from 'lucide-react'
import type { TikTokAccount } from '../lib/types'
import { invokeJson, supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'

type SessionExport = {
  version?: number
  storageState?: {
    cookies?: unknown[]
    origins?: unknown[]
  }
  sessionStorage?: Array<{ origin: string; values: Array<{ name: string; value: string }> }>
  clientProfile?: Record<string, unknown>
}

export function AccountsPage({ accounts, refresh }: { accounts: TikTokAccount[]; refresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  async function addAccount() {
    const label = newLabel.trim()
    if (!label) return setError('Đặt tên để phân biệt tài khoản, ví dụ: Casio 01.')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { error: insertError } = await supabase.from('tiktok_accounts').insert({ owner_id: userData.user.id, label }).select('*').single()
    if (insertError) return setError(insertError.message)
    setNewLabel('')
    setError('')
    setNotice('Đã thêm tài khoản. Nhập file phiên TikTok từ Chrome để hoàn tất.')
    await refresh()
  }

  async function importSession(accountId: string, file?: File) {
    if (!file) return
    setBusyId(accountId)
    setError('')
    setNotice('')
    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as SessionExport
      if (parsed?.version !== 2) {
        throw new Error('File phiên này là bản cũ. Hãy tải lại tiện ích ghép phiên từ PostFlow và xuất file v2 mới.')
      }
      if (!parsed?.storageState || !Array.isArray(parsed.storageState.cookies)) {
        throw new Error('File phiên không đúng định dạng PostFlow.')
      }
      await invokeJson('import-session', {
        account_id: accountId,
        session_state: parsed.storageState,
        session_storage: parsed.sessionStorage || [],
        client_profile: parsed.clientProfile || {},
      })
      setNotice('Đã nhập phiên. Đang kiểm tra trực tiếp trên cloud...')
      await refresh()
      await invokeJson('validate-session', { account_id: accountId })

      const deadline = Date.now() + 180_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000))
        const { data, error: pollError } = await supabase
          .from('tiktok_accounts')
          .select('status,attention_reason,last_health_at')
          .eq('id', accountId)
          .single()
        if (pollError) throw pollError
        if (data.status === 'ready') {
          setNotice('Phiên đã được cloud kiểm tra thành công. Tài khoản sẵn sàng tự đăng.')
          await refresh()
          return
        }
        if (data.status === 'needs_attention' || data.status === 'unpaired') {
          throw new Error(data.attention_reason || 'Cloud không dùng được phiên vừa nhập. Xuất lại bằng tiện ích mới rồi thử lại.')
        }
      }
      await supabase.from('tiktok_accounts').update({
        status: 'needs_attention',
        attention_reason: 'Cloud kiểm tra phiên quá 3 phút chưa hoàn tất. Kiểm tra GitHub Actions rồi thử nhập lại phiên.',
      }).eq('id', accountId)
      await refresh()
      throw new Error('Cloud kiểm tra phiên quá 3 phút chưa hoàn tất. Không để trạng thái quay vô hạn; hãy kiểm tra GitHub Actions rồi thử lại.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không nhập được phiên TikTok.')
    } finally {
      setBusyId('')
      const input = fileInputs.current[accountId]
      if (input) input.value = ''
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Xóa tài khoản này và phiên đăng nhập đã lưu?')) return
    setBusyId(id)
    try {
      const { error: e } = await supabase.from('tiktok_accounts').delete().eq('id', id)
      if (e) throw e
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được tài khoản.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><span className="eyebrow">ACCOUNTS</span><h1>Tài khoản TikTok</h1><p>Đăng nhập TikTok bằng Chrome bình thường trên laptop, xuất phiên một lần rồi PostFlow dùng lại cho queue cloud.</p></div>
      </header>
      {error && <div className="notice error page-notice">{error}</div>}
      {notice && <div className="notice ok page-notice">{notice}</div>}

      <section className="panel quick-add-account">
        <div><strong>Thêm tài khoản</strong><span>Mỗi tài khoản chỉ cần ghép phiên ban đầu một lần.</span></div>
        <div className="quick-add-row"><input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ví dụ: Casio 01" /><button className="primary-btn" onClick={addAccount}><UserRoundPlus size={18} /> Thêm tài khoản</button></div>
      </section>

      <section className="panel session-bridge-card">
        <div>
          <strong>Ghép phiên bằng Chrome thật</strong>
          <span>Không đăng nhập TikTok trong máy cloud nữa. Tải tiện ích, đăng nhập TikTok trên Chrome của ông rồi xuất file phiên.</span>
        </div>
        <a className="secondary-btn" href="/postflow-session-bridge-v2.zip" download>Tải tiện ích ghép phiên v2</a>
      </section>

      <div className="account-grid-page">
        {accounts.map((account) => {
          const isReady = account.status === 'ready'
          const isValidating = account.status === 'pairing'
          const needsAttention = account.status === 'needs_attention'
          return (
            <article className="panel account-card" key={account.id}>
              <div className="account-main">
                {account.avatar_url ? <img className="account-avatar" src={account.avatar_url} alt="" /> : <div className="account-avatar fallback"><Smartphone size={24} /></div>}
                <div><strong>{account.nickname || account.label}</strong><span>{account.username ? `@${account.username}` : account.label}</span>
                  <div className={`connected-line ${needsAttention ? 'attention' : ''}`}>{isReady ? <><CheckCircle2 size={14} /> Sẵn sàng tự đăng</> : isValidating ? <><RefreshCw size={14} className="spin" /> Đang kiểm tra cloud</> : needsAttention ? <>Cần cập nhật phiên</> : <>Chưa ghép phiên</>}</div>
                </div>
              </div>

              <div className="account-stats">
                <div><span>Kiểu chạy</span><strong>{account.driver === 'web_ui' ? 'TikTok Web UI' : 'Android UI'}</strong></div>
                <div><span>Kiểm tra gần nhất</span><strong>{account.last_health_at ? formatDateTime(account.last_health_at) : 'Chưa có'}</strong></div>
              </div>

              {account.attention_reason && <div className="error-strip">{account.attention_reason}</div>}

              <input
                ref={(el) => { fileInputs.current[account.id] = el }}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => importSession(account.id, e.target.files?.[0])}
              />

              <div className="card-actions">
                <button className="secondary-btn" disabled={busyId === account.id || isValidating} onClick={() => fileInputs.current[account.id]?.click()}>
                  {busyId === account.id || isValidating ? <RefreshCw size={16} className="spin" /> : <FileUp size={16} />} {isValidating ? 'Đang kiểm tra' : isReady ? 'Cập nhật phiên' : 'Nhập phiên Chrome'}
                </button>
                <button className="icon-danger" disabled={busyId === account.id} onClick={() => remove(account.id)}><Trash2 size={17} /></button>
              </div>
            </article>
          )
        })}

        {!accounts.length && <div className="panel add-account-card static"><div className="big-add"><FileUp size={26} /></div><strong>Chưa có tài khoản</strong><span>Thêm tài khoản ở ô phía trên, sau đó nhập file phiên Chrome.</span></div>}
      </div>
    </div>
  )
}
