import { Check, UserRoundPlus } from 'lucide-react'
import type { TikTokAccount } from '../lib/types'
import { cn } from '../lib/utils'

export function AccountPicker({ accounts, selected, onToggle, onGoAccounts }: {
  accounts: TikTokAccount[]
  selected: string[]
  onToggle: (id: string) => void
  onGoAccounts: () => void
}) {
  if (!accounts.length) {
    return (
      <button className="empty-account" type="button" onClick={onGoAccounts}>
        <UserRoundPlus size={22} />
        <div><strong>Ghép TikTok trước</strong><span>Không cần Developer API.</span></div>
      </button>
    )
  }

  return (
    <div className="account-picker">
      {accounts.map((account) => {
        const active = selected.includes(account.id)
        return (
          <button type="button" key={account.id} className={cn('account-chip', active && 'selected')} onClick={() => onToggle(account.id)}>
            {account.avatar_url ? <img src={account.avatar_url} alt="" /> : <div className="avatar-fallback">{(account.nickname || account.label || 'T')[0]}</div>}
            <div className="account-chip-text">
              <strong>{account.nickname || account.label}</strong>
              <span>{account.username ? `@${account.username}` : 'Phiên UI đã lưu'}</span>
            </div>
            <div className="chip-check">{active && <Check size={15} />}</div>
          </button>
        )
      })}
    </div>
  )
}
