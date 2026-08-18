export type TabKey = 'compose' | 'queue' | 'accounts' | 'settings'

export type TikTokAccount = {
  id: string
  owner_id: string
  label: string
  username: string | null
  nickname: string | null
  avatar_url: string | null
  status: 'unpaired' | 'pairing' | 'ready' | 'needs_attention' | 'disabled'
  driver: 'web_ui' | 'android_ui'
  capabilities: Record<string, boolean | string | number | null>
  attention_reason: string | null
  last_health_at: string | null
  created_at: string
  updated_at: string
}

export type PostingDefaults = {
  id?: string
  owner_id?: string
  caption_template: string
  hashtag_text: string
  privacy_label: 'public' | 'friends' | 'private'
  allow_comments: boolean
  default_music_mode: 'recommended' | 'search' | 'none'
  default_music_query: string
  default_zalo_preset_id: string | null
}

export type ZaloPreset = {
  id: string
  owner_id: string
  name: string
  text: string
  is_default: boolean
  created_at: string
}

export type PairingSession = {
  id: string
  owner_id: string
  account_id: string
  status: 'starting' | 'ready' | 'finishing' | 'complete' | 'failed' | 'expired'
  live_url: string | null
  view_password: string | null
  finish_requested_at: string | null
  expires_at: string
  error: string | null
  created_at: string
  updated_at: string
}

export type PostRow = {
  id: string
  owner_id: string
  account_id: string
  description: string
  privacy_label: 'public' | 'friends' | 'private'
  allow_comments: boolean
  music_mode: 'recommended' | 'search' | 'none'
  music_query: string
  scheduled_at: string
  status: 'scheduled' | 'processing' | 'submitted' | 'published' | 'needs_attention' | 'failed' | 'cancelled'
  failure_reason: string | null
  diagnostics_path: string | null
  attempt_count: number
  created_at: string
  updated_at: string
  account?: TikTokAccount
  post_assets?: PostAsset[]
}

export type PostAsset = {
  id: string
  post_id: string
  storage_path: string
  sort_order: number
  created_at: string
}

export type UploadItem = {
  id: string
  file: File
  previewUrl: string
}
