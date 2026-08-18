import { corsHeaders } from '../_shared/cors.ts'
import { requireUser, serviceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const body = await req.json()
    const accountIds = Array.isArray(body.account_ids) ? body.account_ids : []
    const assetPaths = Array.isArray(body.asset_paths) ? body.asset_paths : []
    if (!accountIds.length) throw new Error('Chưa chọn tài khoản.')
    if (!assetPaths.length || assetPaths.length > 35) throw new Error('Số ảnh không hợp lệ.')
    if (!['public','friends','private'].includes(body.privacy_label)) throw new Error('Quyền xem không hợp lệ.')
    if (!['recommended','search','none'].includes(body.music_mode)) throw new Error('Chế độ nhạc không hợp lệ.')
    if (body.music_mode === 'search' && !String(body.music_query || '').trim()) throw new Error('Thiếu tên nhạc.')

    const db = serviceClient()
    const { data: accounts, error: accountError } = await db
      .from('tiktok_accounts')
      .select('id,status')
      .eq('owner_id', user.id)
      .in('id', accountIds)
    if (accountError) throw accountError
    if ((accounts || []).length !== accountIds.length) throw new Error('Có tài khoản không thuộc user này.')
    if ((accounts || []).some((a) => a.status !== 'ready')) throw new Error('Có tài khoản chưa sẵn sàng.')
    if (assetPaths.some((p) => !String(p).startsWith(`${user.id}/`))) throw new Error('Asset path không hợp lệ.')

    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : new Date()
    if (Number.isNaN(scheduledAt.getTime())) throw new Error('Thời gian không hợp lệ.')

    const postIds: string[] = []
    for (const accountId of accountIds) {
      const { data: post, error: postError } = await db.from('posts').insert({
        owner_id: user.id,
        account_id: accountId,
        description: String(body.description || ''),
        privacy_label: body.privacy_label,
        allow_comments: Boolean(body.allow_comments),
        music_mode: body.music_mode,
        music_query: body.music_mode === 'search' ? String(body.music_query || '').trim() : '',
        scheduled_at: scheduledAt.toISOString(),
        status: 'scheduled',
      }).select('id').single()
      if (postError) throw postError
      postIds.push(post.id)
      const rows = assetPaths.map((storagePath: string, sortOrder: number) => ({
        post_id: post.id,
        owner_id: user.id,
        storage_path: storagePath,
        sort_order: sortOrder,
      }))
      const { error: assetsError } = await db.from('post_assets').insert(rows)
      if (assetsError) throw assetsError
    }

    let dispatchRequested = false
    if (scheduledAt.getTime() <= Date.now() + 60_000) {
      const dispatchSecret = Deno.env.get('DISPATCH_SECRET')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      if (dispatchSecret && supabaseUrl) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-runner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-postflow-dispatch-secret': dispatchSecret },
            body: '{}',
          })
          dispatchRequested = response.ok
        } catch {
          // The post is already durable in the queue; the minute cron will retry dispatch.
        }
      }
    }

    return Response.json({ post_ids: postIds, dispatch_requested: dispatchRequested }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message === 'UNAUTHORIZED' ? 'Phiên đăng nhập hết hạn.' : message }, { status: message === 'UNAUTHORIZED' ? 401 : 400, headers: corsHeaders })
  }
})
