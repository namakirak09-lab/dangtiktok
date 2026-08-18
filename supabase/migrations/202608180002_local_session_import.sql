alter table public.ui_sessions
  add column if not exists client_profile jsonb not null default '{}'::jsonb;
