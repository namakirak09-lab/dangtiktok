-- POSTFLOW SCHEDULER (run once in Supabase SQL Editor after Edge Functions are deployed)
-- Replace the two placeholders. Antigravity should fill these from deployment output/secrets.
-- This cron is light: it only asks the Edge Function whether a post is due.
-- The expensive browser runner is dispatched ONLY when there is work.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Remove older copy if re-running setup.
select cron.unschedule(jobid)
from cron.job
where jobname = 'postflow-dispatch-due';

select cron.schedule(
  'postflow-dispatch-due',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/dispatch-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-postflow-dispatch-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
