import type { ReactNode } from 'react'
import { CalendarClock, Images, Settings, Users, Sparkles } from 'lucide-react'
import type { TabKey } from '../lib/types'
import { cn } from '../lib/utils'

const tabs: Array<{ key: TabKey; label: string; icon: typeof Images }> = [
  { key: 'compose', label: 'Đăng ảnh', icon: Images },
  { key: 'queue', label: 'Lịch đăng', icon: CalendarClock },
  { key: 'accounts', label: 'Tài khoản', icon: Users },
  { key: 'settings', label: 'Cài đặt', icon: Settings },
]

export function AppShell({
  active,
  onChange,
  children,
  onSignOut,
}: {
  active: TabKey
  onChange: (tab: TabKey) => void
  children: ReactNode
  onSignOut: () => void
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div>
            <strong>PostFlow</strong>
            <span>photo scheduler</span>
          </div>
        </div>

        <nav className="side-nav">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} className={cn('nav-btn', active === key && 'active')} onClick={() => onChange(key)}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="serverless-pill">● Cloud 24/7</div>
          <button className="link-btn" onClick={onSignOut}>Đăng xuất</button>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} className={cn('bottom-btn', active === key && 'active')} onClick={() => onChange(key)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
