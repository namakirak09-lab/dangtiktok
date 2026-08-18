import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, TriangleAlert, XCircle } from 'lucide-react'
import type { PostRow } from '../lib/types'
import { formatDateTime } from '../lib/utils'
import { supabase } from '../lib/supabase'

const statusMeta: Record<PostRow['status'], { label: string; cls: string; icon: typeof Clock3 }> = {
  scheduled: { label: 'Đã lên lịch', cls: 'scheduled', icon: Clock3 },
  processing: { label: 'Đang thao tác', cls: 'processing', icon: LoaderCircle },
  submitted: { label: 'Đã bấm đăng', cls: 'processing', icon: Send },
  published: { label: 'Đã đăng', cls: 'published', icon: CheckCircle2 },
  needs_attention: { label: 'Cần xác nhận', cls: 'failed', icon: AlertTriangle },
  failed: { label: 'Lỗi', cls: 'failed', icon: TriangleAlert },
  cancelled: { label: 'Đã hủy', cls: 'cancelled', icon: XCircle },
}

export function QueuePage({ posts, refresh }: { posts: PostRow[]; refresh: () => Promise<void> }) {
  async function retry(post: PostRow) {
    if (!['failed', 'needs_attention'].includes(post.status)) return
    if (post.account?.status !== 'ready') {
      window.alert('Tài khoản này vẫn đang cần xác nhận. Ghép lại phiên TikTok trước rồi thử lại bài.')
      return
    }
    await supabase.from('posts').update({ status: 'scheduled', scheduled_at: new Date().toISOString(), failure_reason: null, diagnostics_path: null, attempt_count: 0 }).eq('id', post.id)
    await refresh()
  }

  async function cancel(post: PostRow) {
    if (post.status !== 'scheduled') return
    await supabase.from('posts').update({ status: 'cancelled' }).eq('id', post.id)
    await refresh()
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><span className="eyebrow">QUEUE</span><h1>Lịch đăng</h1><p>Runner cloud mở TikTok và thao tác UI đúng lúc đến lịch.</p></div>
        <button className="secondary-btn" onClick={refresh}><RefreshCw size={17} /> Làm mới</button>
      </header>

      <section className="panel queue-panel">
        {!posts.length ? (
          <div className="empty-state"><CalendarClock size={42} /><strong>Chưa có bài trong lịch</strong><span>Qua tab Đăng ảnh để tạo bài đầu tiên.</span></div>
        ) : (
          <div className="queue-list">
            {posts.map((post) => {
              const meta = statusMeta[post.status]
              const Icon = meta.icon
              return (
                <article className="queue-item" key={post.id}>
                  <div className="queue-cover">
                    <div className="cover-placeholder">{String(post.post_assets?.length || 0).padStart(2, '0')}</div>
                    <span>{post.post_assets?.length || 0} ảnh</span>
                  </div>
                  <div className="queue-body">
                    <div className="queue-top"><div><strong>{post.account?.nickname || post.account?.label || 'TikTok'}</strong><span>{post.account?.username ? `@${post.account.username}` : post.account?.label}</span></div><div className={`status-chip ${meta.cls}`}><Icon size={14} className={post.status === 'processing' ? 'spin' : ''} />{meta.label}</div></div>
                    <p>{post.description || 'Không có caption'}</p>
                    <div className="queue-meta"><span><Clock3 size={14} /> {formatDateTime(post.scheduled_at)}</span><span>Nhạc: {post.music_mode === 'search' ? post.music_query : post.music_mode === 'recommended' ? 'TikTok đề xuất' : 'Không nhạc'}</span><span>Lần chạy: {post.attempt_count}</span></div>
                    {post.failure_reason && <div className="error-strip">{post.failure_reason}</div>}
                  </div>
                  {post.status === 'scheduled' && <button className="link-btn danger" onClick={() => cancel(post)}>Hủy lịch</button>}
                  {(['failed', 'needs_attention'] as PostRow['status'][]).includes(post.status) && <button className="secondary-btn" onClick={() => retry(post)}>Thử lại</button>}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
