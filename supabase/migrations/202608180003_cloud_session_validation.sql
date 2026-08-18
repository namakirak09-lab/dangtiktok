alter table public.runner_jobs
  add column if not exists account_id uuid references public.tiktok_accounts(id) on delete cascade;

alter table public.runner_jobs drop constraint if exists runner_jobs_kind_check;
alter table public.runner_jobs
  add constraint runner_jobs_kind_check check (kind in ('queue','session_check'));

-- Replace the old global lock with one queue lock plus one validation lock per account.
drop index if exists public.runner_jobs_one_active_idx;
create unique index if not exists runner_jobs_one_active_queue_idx
  on public.runner_jobs(kind)
  where kind = 'queue' and status in ('dispatching','running');
create unique index if not exists runner_jobs_one_active_session_check_idx
  on public.runner_jobs(account_id)
  where kind = 'session_check' and status in ('dispatching','running');

create index if not exists runner_jobs_account_idx on public.runner_jobs(account_id, created_at desc);

-- Encrypted persistent Chrome profiles. No authenticated policies: service-role runner only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('browser-profiles','browser-profiles',false,157286400,array['application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
