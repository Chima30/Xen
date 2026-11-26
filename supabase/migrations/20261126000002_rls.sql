-- Row Level Security
-- Service role bypasses RLS. No anon access anywhere.

do $$
declare t text;
begin
  -- Enable RLS on every table in public
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Shared intelligence: read-only for signed-in users
do $$
declare t text;
begin
  foreach t in array array['projects','project_signals','project_sources','sources','source_adapters','source_health',
    'announcements','announcement_versions','opportunities','opportunity_evidence','opportunity_verifications',
    'reward_evidence','search_queries','scan_history','agent_logs','api_usage','payment_history'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;

-- Owner-only tables keyed by user_id
do $$
declare t text;
begin
  foreach t in array array['user_preferences','watchlists','saved_opportunities','applications','tasks','reminders',
    'earnings','bug_reports','testing_sessions','test_cases','tester_portfolios','outreach_contacts',
    'outreach_messages','notification_preferences','notifications'] loop
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
  end loop;
end $$;

create policy profiles_owner on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Per-user scores: own rows + default (null user) rows
create policy opportunity_scores_read on public.opportunity_scores for select to authenticated
  using (user_id is null or user_id = auth.uid());

-- Telegram link: user may read own row; linking is done server-side only
create policy telegram_accounts_read on public.telegram_accounts for select to authenticated
  using (user_id = auth.uid());

-- Users may report payment evidence about a project (always as themselves, never "verified")
create policy payment_history_insert on public.payment_history for insert to authenticated
  with check (reported_by = auth.uid() and evidence_type = 'community_allegation');

-- Audit logs: users see their own entries
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (actor_user_id = auth.uid());

-- job_queue, search_cache, system_settings, telegram_updates: service role only (no policies).

-- Storage bucket for testing evidence: private, path prefix = user id
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

create policy evidence_owner_rw on storage.objects for all to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
