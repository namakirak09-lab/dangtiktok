import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { ComposePage } from './pages/ComposePage'
import { QueuePage } from './pages/QueuePage'
import { AccountsPage } from './pages/AccountsPage'
import { SettingsPage } from './pages/SettingsPage'
import { supabase } from './lib/supabase'
import type { PostRow, PostingDefaults, TabKey, TikTokAccount, ZaloPreset } from './lib/types'

const FALLBACK_DEFAULTS: PostingDefaults = {
  caption_template: '',
  hashtag_text: '#casio #toan12',
  privacy_label: 'public',
  allow_comments: true,
  default_music_mode: 'recommended',
  default_music_query: '',
  default_zalo_preset_id: null,
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('compose')
  const [accounts, setAccounts] = useState<TikTokAccount[]>([])
  const [defaults, setDefaults] = useState<PostingDefaults>(FALLBACK_DEFAULTS)
  const [presets, setPresets] = useState<ZaloPreset[]>([])
  const [posts, setPosts] = useState<PostRow[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session?.user) return
    const [accountsRes, defaultsRes, presetsRes, postsRes] = await Promise.all([
      supabase.from('tiktok_accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('posting_defaults').select('*').maybeSingle(),
      supabase.from('zalo_presets').select('*').order('created_at', { ascending: true }),
      supabase.from('posts').select('*, account:tiktok_accounts(*), post_assets(*)').order('scheduled_at', { ascending: false }).limit(100),
    ])

    if (!accountsRes.error) setAccounts((accountsRes.data || []) as TikTokAccount[])
    if (!defaultsRes.error && defaultsRes.data) setDefaults(defaultsRes.data as PostingDefaults)
    else setDefaults(FALLBACK_DEFAULTS)
    if (!presetsRes.error) setPresets((presetsRes.data || []) as ZaloPreset[])
    if (!postsRes.error) {
      const rows = (postsRes.data || []).map((row: any) => ({
        ...row,
        post_assets: [...(row.post_assets || [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
      }))
      setPosts(rows as PostRow[])
    }
  }, [session?.user])

  useEffect(() => {
    if (session) refresh()
  }, [session, refresh])

  if (loading) return <div className="boot-screen"><div className="boot-dot" />PostFlow</div>
  if (!session) return <LoginPage />

  return (
    <AppShell active={tab} onChange={setTab} onSignOut={() => supabase.auth.signOut()}>
      {tab === 'compose' && <ComposePage accounts={accounts} defaults={defaults} presets={presets} onGoAccounts={() => setTab('accounts')} onQueued={async () => { await refresh(); setTab('queue') }} />}
      {tab === 'queue' && <QueuePage posts={posts} refresh={refresh} />}
      {tab === 'accounts' && <AccountsPage accounts={accounts} refresh={refresh} />}
      {tab === 'settings' && <SettingsPage defaults={defaults} presets={presets} refresh={refresh} />}
    </AppShell>
  )
}
