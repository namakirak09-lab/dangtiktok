import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  Smartphone,
  Trash2,
  UserRoundPlus,
  XCircle,
} from 'lucide-react'
import type { PairingSession, TikTokAccount } from '../lib/types'
import { invokeJson, supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'

const STARTING_TIMEOUT_SEC = 180 // 3 minutes

export function AccountsPage({ accounts, refresh }: { accounts: TikTokAccount[]; refresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [pairing, setPairing] = useState<Record<string, PairingSession>>({})
  const [now, setNow] = useState(Date.now())

  async function loadPairing() {
    const { data } = await supabase
      .from('pairing_sessions')
      .select('*')
      .in('status', ['starting', 'ready', 'finishing', 'failed'])
      .order('created_at', { ascending: false })
      .limit(30)

    const map: Record<string, PairingSession> = {}
    for (const row of (data || []) as PairingSession[]) {
      if (!map[row.account_id]) {
        map[row.account_id] = row
      }
    }
    setPairing(map)
  }

  useEffect(() => {
    loadPairing()
    const timer = window.setInterval(async () => {
      setNow(Date.now())
      await loadPairing()
      await refresh()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [])

  async function addAccount() {
    const label = newLabel.trim()
    if (!label) return setError('Đặt tên để phân biệt tài khoản, ví dụ: Casio 01.')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { data, error: insertError } = await supabase
      .from('tiktok_accounts')
      .insert({ owner_id: userData.user.id, label })
      .select('*')
      .single()
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
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được phiên.')
    } finally {
      setBusyId('')
    }
  }

  async function cancelPair(session: PairingSession) {
    setBusyId(session.account_id)
    try {
      await invokeJson('pairing-control', { pairing_id: session.id, action: 'cancel' })
      await loadPairing()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không hủy được phiên.')
    } finally {
      setBusyId('')
    }
  }

  async function dismissFailedPair(accountId: string, sessionId: string) {
    await supabase.from('pairing_sessions').update({ status: 'expired' }).eq('id', sessionId)
    await supabase.from('tiktok_accounts').update({ status: 'unpaired' }).eq('id', accountId)
    await loadPairing()
    await refresh()
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
        <div>
          <span className="eyebrow">ACCOUNTS</span>
          <h1>Tài khoản TikTok</h1>
          <p>Ghép tài khoản 1 lần — sau đó hệ thống tự động đăng ảnh theo lịch đã đặt.</p>
        </div>
      </header>
      {error && <div className="notice error page-notice">{error}</div>}

      <section className="panel quick-add-account">
        <div>
          <strong>Thêm tài khoản TikTok</strong>
          <span>Đăng nhập qua cửa sổ bảo mật một lần duy nhất.</span>
        </div>
        <div className="quick-add-row">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Tên tài khoản (Ví dụ: Casio 01)"
          />
          <button className="primary-btn" onClick={addAccount} disabled={!!busyId}>
            <UserRoundPlus size={18} /> Thêm & ghép phiên
          </button>
        </div>
      </section>

      <div className="account-grid-page">
        {accounts.map((account) => {
          const pairSession = pairing[account.id]
          const isReady = account.status === 'ready'
          const needsAttention = account.status === 'needs_attention'

          let isTimeout = false
          let elapsedSec = 0
          if (pairSession?.created_at) {
            elapsedSec = Math.floor((now - new Date(pairSession.created_at).getTime()) / 1000)
            if (pairSession.status === 'starting' && elapsedSec > STARTING_TIMEOUT_SEC) {
              isTimeout = true
            }
          }

          const hasActivePair =
            pairSession && ['starting', 'ready', 'finishing'].includes(pairSession.status) && !isTimeout

          return (
            <article className="panel account-card" key={account.id}>
              <div className="account-main">
                {account.avatar_url ? (
                  <img className="account-avatar" src={account.avatar_url} alt="" />
                ) : (
                  <div className="account-avatar fallback">
                    <Smartphone size={24} />
                  </div>
                )}
                <div>
                  <strong>{account.nickname || account.label}</strong>
                  <span>{account.username ? `@${account.username}` : account.label}</span>
                  <div className={`connected-line ${needsAttention ? 'attention' : ''}`}>
                    {isReady ? (
                      <>
                        <CheckCircle2 size={14} /> Sẵn sàng tự đăng
                      </>
                    ) : needsAttention ? (
                      <>
                        <AlertTriangle size={14} /> Cần xác nhận lại
                      </>
                    ) : hasActivePair ? (
                      <>
                        <LoaderCircle size={14} className="spin" /> Đang ghép phiên
                      </>
                    ) : (
                      <>
                        <LoaderCircle size={14} /> Chưa ghép phiên
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="account-stats">
                <div>
                  <span>Kiểu chạy</span>
                  <strong>{account.driver === 'web_ui' ? 'TikTok Web UI' : 'Android UI'}</strong>
                </div>
                <div>
                  <span>Kiểm tra gần nhất</span>
                  <strong>{account.last_health_at ? formatDateTime(account.last_health_at) : 'Chưa có'}</strong>
                </div>
              </div>

              {account.attention_reason && (
                <div className="error-strip">
                  <AlertTriangle size={15} /> {account.attention_reason}
                </div>
              )}

              {/* Pairing Panel */}
              {pairSession && (
                <div className="pair-box">
                  {/* Starting State */}
                  {pairSession.status === 'starting' && !isTimeout && (
                    <div>
                      <div className="progress-line">
                        <span />
                        Đang dựng cửa sổ TikTok trên cloud ({elapsedSec}s)...
                      </div>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="link-btn danger"
                          disabled={busyId === account.id}
                          onClick={() => cancelPair(pairSession)}
                        >
                          <XCircle size={14} /> Hủy ghép
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Starting Timeout */}
                  {pairSession.status === 'starting' && isTimeout && (
                    <div className="error-strip" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                      <div>
                        <strong>Quá thời gian (Timeout 3 phút).</strong> Runner cloud chưa hoàn tất khởi tạo.
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: '4px 10px', fontSize: '13px' }}
                          onClick={() => pair(account.id)}
                        >
                          <RefreshCw size={13} /> Thử lại
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => dismissFailedPair(account.id, pairSession.id)}
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ready State */}
                  {pairSession.status === 'ready' && pairSession.live_url && (
                    <>
                      <a className="primary-btn wide" href={pairSession.live_url} target="_blank" rel="noreferrer">
                        <ExternalLink size={17} /> Mở TikTok để đăng nhập
                      </a>
                      {pairSession.view_password && (
                        <div className="pair-password">
                          Mật khẩu cửa sổ: <code>{pairSession.view_password}</code>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <button
                          className="secondary-btn"
                          style={{ flex: 1 }}
                          disabled={busyId === account.id}
                          onClick={() => finishPair(pairSession)}
                        >
                          <CheckCircle2 size={17} /> Đã đăng nhập xong — lưu phiên
                        </button>
                        <button
                          type="button"
                          className="icon-danger"
                          title="Hủy phiên ghép"
                          disabled={busyId === account.id}
                          onClick={() => cancelPair(pairSession)}
                        >
                          <XCircle size={17} />
                        </button>
                      </div>
                    </>
                  )}

                  {/* Finishing State */}
                  {pairSession.status === 'finishing' && (
                    <div className="progress-line">
                      <span />
                      Đang mã hóa lưu phiên và kiểm tra chế độ ảnh...
                    </div>
                  )}

                  {/* Failed State */}
                  {pairSession.status === 'failed' && (
                    <div className="error-strip" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                      <div>
                        <strong>Ghép thất bại:</strong> {pairSession.error || 'Runner gặp sự cố.'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: '4px 10px', fontSize: '13px' }}
                          onClick={() => pair(account.id)}
                        >
                          <RefreshCw size={13} /> Thử lại
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => dismissFailedPair(account.id, pairSession.id)}
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="card-actions">
                <button
                  className="secondary-btn"
                  disabled={busyId === account.id || hasActivePair}
                  onClick={() => pair(account.id)}
                >
                  <RefreshCw size={16} className={busyId === account.id ? 'spin' : ''} />{' '}
                  {isReady ? 'Ghép lại phiên' : 'Ghép phiên'}
                </button>
                <button
                  className="icon-danger"
                  disabled={busyId === account.id}
                  onClick={() => remove(account.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          )
        })}

        {!accounts.length && (
          <div className="panel add-account-card static">
            <div className="big-add">
              <Link2 size={26} />
            </div>
            <strong>Chưa có tài khoản</strong>
            <span>Thêm tài khoản ở ô phía trên. Mỗi nick chỉ cần ghép phiên ban đầu một lần.</span>
          </div>
        )}
      </div>
    </div>
  )
}
