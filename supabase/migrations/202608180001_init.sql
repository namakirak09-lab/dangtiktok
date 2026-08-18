create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.tiktok_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  username text,
  nickname text,
  avatar_url text,
  status text not null default 'unpaired' check (status in ('unpaired','pairing','ready','needs_attention','disabled')),
  driver text not null default 'web_ui' check (driver in ('web_ui','android_ui')),
  capabilities jsonb not null default '{}'::jsonb,
  attention_reason text,
  last_health_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sensitive UI session state: service-role only. It contains encrypted browser cookies/storage.
create table if not exists public.ui_sessions (
  account_id uuid primary key references public.tiktok_accounts(id) on delete cascade,
  encrypted_storage_state text not null,
  session_version integer not null default 1,
  last_ok_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.tiktok_accounts(id) on delete cascade,
  status text not null default 'starting' check (status in ('starting','ready','finishing','complete','failed','expired')),
  live_url text,
  view_password text,
  finish_requested_at timestamptz,
  expires_at timestamptz not null default (now() + interval '25 minutes'),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zalo_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  text text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posting_defaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  caption_template text not null default '',
  hashtag_text text not null default '#casio #toan12',
  privacy_label text not null default 'public' check (privacy_label in ('public','friends','private')),
  allow_comments boolean not null default true,
  default_music_mode text not null default 'recommended' check (default_music_mode in ('recommended','search','none')),
  default_music_query text not null default '',
  default_zalo_preset_id uuid references public.zalo_presets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.tiktok_accounts(id) on delete cascade,
  description text not null default '',
  privacy_label text not null default 'public' check (privacy_label in ('public','friends','private')),
  allow_comments boolean not null default true,
  music_mode text not null default 'recommended' check (music_mode in ('recommended','search','none')),
  music_query text not null default '',
  scheduled_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled','processing','submitted','published','needs_attention','failed','cancelled')),
  failure_reason text,
  diagnostics_path text,
  attempt_count integer not null default 0,
  runner_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.runner_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'queue' check (kind in ('queue')),
  status text not null default 'dispatching' check (status in ('dispatching','running','complete','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one queue runner may be active at a time. This prevents duplicate browser jobs.
create unique index if not exists runner_jobs_one_active_idx
  on public.runner_jobs(kind)
  where status in ('dispatching','running');

create table if not exists public.post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique(post_id, sort_order)
);

create index if not exists posts_due_idx on public.posts(status, scheduled_at);
create index if not exists tiktok_accounts_owner_idx on public.tiktok_accounts(owner_id);
create index if not exists pairing_owner_idx on public.pairing_sessions(owner_id, created_at desc);
create index if not exists post_assets_post_idx on public.post_assets(post_id, sort_order);

create trigger trg_tiktok_accounts_updated before update on public.tiktok_accounts for each row execute function public.set_updated_at();
create trigger trg_ui_sessions_updated before update on public.ui_sessions for each row execute function public.set_updated_at();
create trigger trg_pairing_sessions_updated before update on public.pairing_sessions for each row execute function public.set_updated_at();
create trigger trg_zalo_presets_updated before update on public.zalo_presets for each row execute function public.set_updated_at();
create trigger trg_posting_defaults_updated before update on public.posting_defaults for each row execute function public.set_updated_at();
create trigger trg_posts_updated before update on public.posts for each row execute function public.set_updated_at();
create trigger trg_runner_jobs_updated before update on public.runner_jobs for each row execute function public.set_updated_at();

alter table public.tiktok_accounts enable row level security;
alter table public.ui_sessions enable row level security;
alter table public.pairing_sessions enable row level security;
alter table public.zalo_presets enable row level security;
alter table public.posting_defaults enable row level security;
alter table public.posts enable row level security;
alter table public.post_assets enable row level security;
alter table public.runner_jobs enable row level security;

create policy "accounts_select_own" on public.tiktok_accounts for select to authenticated using (owner_id = auth.uid());
create policy "accounts_insert_own" on public.tiktok_accounts for insert to authenticated with check (owner_id = auth.uid());
create policy "accounts_update_own" on public.tiktok_accounts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "accounts_delete_own" on public.tiktok_accounts for delete to authenticated using (owner_id = auth.uid());

-- ui_sessions intentionally has no authenticated policies. Only service role can read/write session cookies.

create policy "pairing_select_own" on public.pairing_sessions for select to authenticated using (owner_id = auth.uid());

create policy "zalo_select_own" on public.zalo_presets for select to authenticated using (owner_id = auth.uid());
create policy "zalo_insert_own" on public.zalo_presets for insert to authenticated with check (owner_id = auth.uid());
create policy "zalo_update_own" on public.zalo_presets for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "zalo_delete_own" on public.zalo_presets for delete to authenticated using (owner_id = auth.uid());

create policy "defaults_select_own" on public.posting_defaults for select to authenticated using (owner_id = auth.uid());
create policy "defaults_insert_own" on public.posting_defaults for insert to authenticated with check (owner_id = auth.uid());
create policy "defaults_update_own" on public.posting_defaults for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "posts_select_own" on public.posts for select to authenticated using (owner_id = auth.uid());
create policy "posts_update_own" on public.posts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "assets_select_own" on public.post_assets for select to authenticated using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tiktok-assets','tiktok-assets',false,20971520,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('runner-diagnostics','runner-diagnostics',false,10485760,array['image/png','text/html','application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_insert_own_tiktok_assets" on storage.objects for insert to authenticated
with check (bucket_id='tiktok-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage_delete_own_tiktok_assets" on storage.objects for delete to authenticated
using (bucket_id='tiktok-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- runner_jobs and runner-diagnostics are service-role only.
-- runner-diagnostics can include TikTok page screenshots.
