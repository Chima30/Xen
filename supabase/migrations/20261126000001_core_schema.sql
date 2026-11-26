-- XEN core schema
-- Shared intelligence tables (projects, opportunities, sources, …) are readable by
-- authenticated users and writable only by the service role (Worker / server).
-- Private tables carry user_id and are restricted to their owner via RLS.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type reward_status as enum ('confirmed', 'performance_based', 'speculative', 'unpaid', 'unverified');
create type verification_status as enum ('verified_announcement', 'partially_verified', 'unverified', 'conflicting', 'suspicious', 'expired');
create type project_stage as enum ('research', 'under_development', 'private_alpha', 'public_alpha', 'closed_beta', 'public_beta', 'testnet', 'mainnet', 'established', 'unknown');
create type capital_requirement as enum ('none', 'gas_only', 'required', 'unknown');
create type opportunity_tier as enum ('tier1', 'tier2', 'tier3');
create type application_status as enum ('discovered', 'saved', 'interested', 'applied', 'accepted', 'in_progress', 'submitted', 'under_review', 'completed', 'payment_pending', 'paid', 'rejected', 'expired', 'archived');
create type job_status as enum ('pending', 'leased', 'succeeded', 'failed', 'dead');
create type source_status as enum ('active', 'paused', 'unsupported', 'unconfigured', 'error');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country_code text default 'NG',
  timezone text not null default 'Africa/Lagos',
  skills text[] not null default '{}',
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_categories text[] not null default '{}',
  zero_capital_mode boolean not null default true,
  max_capital_usd numeric(12,2) not null default 0,
  daily_minutes_available int not null default 120 check (daily_minutes_available between 0 and 1440),
  risk_tolerance text not null default 'low' check (risk_tolerance in ('low','medium','high')),
  min_reward_usd numeric(12,2),
  score_weights jsonb not null default '{"reward_certainty":30,"credibility":20,"zero_capital":20,"reward_effort":15,"eligibility":10,"urgency":5}',
  updated_at timestamptz not null default now()
);

-- Create profile + preferences on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, skills) values (new.id,
    array['product_testing','bug_reporting','software_development','digital_art','design']);
  insert into user_preferences (user_id, preferred_categories) values (new.id,
    array['paid_beta_testing','prediction_market_testing','dex_testing','perp_testing','paid_feedback','bug_reporting','hackathon']);
  insert into notification_preferences (user_id) values (new.id);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Projects & sources (shared)
-- ---------------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  website text,
  website_domain text,
  description text,
  category text,
  ecosystems text[] not null default '{}',
  stage project_stage not null default 'unknown',
  funding jsonb,                     -- only verified funding, with source url
  socials jsonb not null default '{}',
  github_repos text[] not null default '{}',
  last_monitored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_domain_idx on projects (website_domain);
create index projects_name_trgm on projects using gin (name gin_trgm_ops);

create table source_adapters (
  id text primary key,                -- e.g. 'tavily', 'rss', 'github', 'defillama'
  name text not null,
  kind text not null check (kind in ('search','feed','api','social','platform')),
  requires_credentials text[] not null default '{}',
  supported boolean not null default true,
  notes text
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  adapter_id text not null references source_adapters(id),
  name text not null,
  config jsonb not null default '{}', -- feed url, query, repo, etc.
  project_id uuid references projects(id) on delete set null,
  priority int not null default 50,
  scan_interval_minutes int not null default 30 check (scan_interval_minutes >= 5),
  status source_status not null default 'active',
  next_scan_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int not null default 0,
  cursor jsonb,                       -- pagination / checkpoint
  created_at timestamptz not null default now(),
  unique (adapter_id, name)
);
create index sources_due_idx on sources (next_scan_at) where status = 'active';

create table project_sources (
  project_id uuid not null references projects(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  primary key (project_id, source_id)
);

create table source_health (
  id bigint generated always as identity primary key,
  source_id uuid references sources(id) on delete cascade,
  adapter_id text references source_adapters(id),
  ok boolean not null,
  items_fetched int not null default 0,
  duration_ms int,
  error text,
  checked_at timestamptz not null default now()
);
create index source_health_recent_idx on source_health (adapter_id, checked_at desc);

create table project_signals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  signal_type text not null,          -- funding, testnet_announced, waitlist, github_release, ...
  summary text not null,
  source_url text not null,
  observed_at timestamptz not null default now(),
  content_hash text not null,
  unique (project_id, content_hash)
);

-- ---------------------------------------------------------------------------
-- Announcements (raw collected content) with versioning
-- ---------------------------------------------------------------------------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  canonical_url text not null unique,
  title text,
  published_at timestamptz,
  content_hash text not null,
  excerpt text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  analysis_state text not null default 'pending' check (analysis_state in ('pending','filtered_out','analyzed','failed'))
);
create index announcements_hash_idx on announcements (content_hash);

create table announcement_versions (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references announcements(id) on delete cascade,
  content_hash text not null,
  content text not null,
  captured_at timestamptz not null default now(),
  unique (announcement_id, content_hash)
);

-- ---------------------------------------------------------------------------
-- Opportunities (shared)
-- ---------------------------------------------------------------------------
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  announcement_id uuid references announcements(id) on delete set null,
  title text not null,
  project_name text,
  category text not null,
  tier opportunity_tier not null,
  description text,
  reward_amount numeric(18,2),
  reward_amount_max numeric(18,2),
  reward_currency text,
  reward_conditions text,
  reward_status reward_status not null default 'unverified',
  capital capital_requirement not null default 'unknown',
  capital_notes text,
  estimated_minutes int,
  required_skills text[] not null default '{}',
  instructions text,
  application_url text,
  source_url text not null,
  canonical_url text not null,
  announced_at timestamptz,
  registration_opens_at timestamptz,
  deadline_at timestamptz,
  geo_restrictions text[] not null default '{}',     -- country codes / regions excluded
  geo_allowed text[] not null default '{}',          -- explicit allow-list if stated
  kyc_required boolean,
  networks text[] not null default '{}',
  difficulty text check (difficulty in ('easy','medium','hard')),
  missing_fields text[] not null default '{}',
  verification verification_status not null default 'unverified',
  verification_confidence numeric(4,3) not null default 0 check (verification_confidence between 0 and 1),
  risk_flags text[] not null default '{}',
  score int check (score between 0 and 100),
  score_breakdown jsonb,
  content_hash text not null,
  dedupe_key text not null unique,     -- canonical url + normalized title
  is_active boolean not null default true,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);
create index opportunities_score_idx on opportunities (score desc) where is_active;
create index opportunities_deadline_idx on opportunities (deadline_at) where is_active;
create index opportunities_category_idx on opportunities (category);
create index opportunities_discovered_idx on opportunities (discovered_at desc);
create index opportunities_title_trgm on opportunities using gin (title gin_trgm_ops);
create trigger opportunities_updated before update on opportunities for each row execute function set_updated_at();

create table opportunity_evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  kind text not null check (kind in ('reward','eligibility','deadline','official_link','capital','general')),
  excerpt text not null,
  source_url text not null,
  captured_at timestamptz not null default now()
);
create index opportunity_evidence_opp_idx on opportunity_evidence (opportunity_id);

create table reward_evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  classification reward_status not null,
  excerpt text,
  source_url text not null,
  is_official_source boolean not null default false,
  captured_at timestamptz not null default now()
);

create table opportunity_verifications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  status verification_status not null,
  confidence numeric(4,3) not null,
  checks jsonb not null,               -- each deterministic check + result
  risk_flags text[] not null default '{}',
  verified_at timestamptz not null default now()
);

create table opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,  -- null = default profile score
  score int not null,
  breakdown jsonb not null,
  computed_at timestamptz not null default now()
);
create unique index opportunity_scores_unique on opportunity_scores (opportunity_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Private user data
-- ---------------------------------------------------------------------------
create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  update_types text[] not null default array['tester_recruitment','testnet','incentive','registration','deadline_change','funding','launch'],
  created_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create table saved_opportunities (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  hidden boolean not null default false,   -- "not interested"
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  title text not null,
  status application_status not null default 'saved',
  notes text,
  submission_url text,
  applied_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_user_idx on applications (user_id, status);
create trigger applications_updated before update on applications for each row execute function set_updated_at();

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references applications(id) on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_user_idx on tasks (user_id, done, due_at);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  remind_at timestamptz not null,
  message text not null,
  sent_at timestamptz
);
create index reminders_due_idx on reminders (remind_at) where sent_at is null;

create table earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  category text,
  amount numeric(18,6) not null,
  currency text not null,
  amount_usd numeric(14,2),
  status text not null check (status in ('expected','pending','received','rejected','unpaid')),
  tx_hash text,
  evidence_url text,
  minutes_spent int,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index earnings_user_idx on earnings (user_id, status);

create table payment_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reported_by uuid references auth.users(id) on delete set null,
  evidence_type text not null check (evidence_type in ('verified_user_payment','official_announcement','public_evidence','community_allegation')),
  outcome text not null check (outcome in ('paid_on_time','paid_late','unpaid','partial')),
  details text,
  source_url text,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  input jsonb not null,           -- what the user provided
  report_markdown text not null,
  severity text check (severity in ('critical','high','medium','low')),
  attachments text[] not null default '{}',   -- storage paths
  status text not null default 'draft' check (status in ('draft','submitted','accepted','rejected','duplicate')),
  created_at timestamptz not null default now()
);

create table testing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  platform_url text,
  notes text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table test_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references testing_sessions(id) on delete cascade,
  platform_type text not null,
  area text not null,
  title text not null,
  steps text[] not null,
  expected text not null,
  result text check (result in ('pass','fail','blocked','not_run')) default 'not_run',
  created_at timestamptz not null default now()
);

create table tester_portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text,
  summary text,
  entries jsonb not null default '[]',
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  channel text not null check (channel in ('email','discord','telegram','x','form','other')),
  handle text,
  created_at timestamptz not null default now()
);

create table outreach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references outreach_contacts(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  offer_type text not null,
  draft text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent_by_user','replied','accepted','declined','no_response')),
  sent_at timestamptz,
  follow_up_at timestamptz,
  agreed_payment text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notifications & Telegram
-- ---------------------------------------------------------------------------
create table notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_enabled boolean not null default true,
  min_score int not null default 65,
  quiet_start time default '22:00',
  quiet_end time default '07:00',
  morning_briefing boolean not null default true,
  evening_summary boolean not null default true,
  weekly_report boolean not null default true,
  categories text[] not null default '{}'   -- empty = all
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  chat_id text,
  opportunity_id uuid references opportunities(id) on delete cascade,
  kind text not null,                 -- new_opportunity, deadline, briefing, watch_update, reminder
  dedupe_key text not null,
  payload jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed','suppressed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (dedupe_key)
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint unique,
  chat_id bigint unique,
  username text,
  link_code text unique,              -- one-time code, hashed
  link_code_expires_at timestamptz,
  linked_at timestamptz
);

create table telegram_updates (
  update_id bigint primary key,       -- idempotency for webhook deliveries
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Search, scanning, jobs, usage
-- ---------------------------------------------------------------------------
create table search_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null unique,
  tier opportunity_tier not null default 'tier1',
  enabled boolean not null default true,
  last_run_at timestamptz,
  results_last_run int,
  useful_hits int not null default 0
);

create table search_cache (
  cache_key text primary key,
  provider text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index search_cache_expiry_idx on search_cache (expires_at);

create table scan_history (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,               -- cron expression or 'manual'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}',
  error text
);

create table agent_logs (
  id bigint generated always as identity primary key,
  agent text not null,
  action text not null,
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);
create index agent_logs_recent_idx on agent_logs (created_at desc);

create table job_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}',
  idempotency_key text not null unique,
  status job_status not null default 'pending',
  priority int not null default 50,
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  leased_until timestamptz,
  leased_by text,
  last_error text,
  checkpoint jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index job_queue_ready_idx on job_queue (priority desc, run_after) where status in ('pending','leased');

create table api_usage (
  provider text not null,
  day date not null,
  requests int not null default 0,
  failures int not null default 0,
  units numeric not null default 0,    -- credits / tokens
  last_success_at timestamptz,
  last_error text,
  primary key (provider, day)
);

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor text not null,                 -- 'user', 'worker', 'telegram'
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Signup trigger (after notification_preferences exists)
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Job queue functions (atomic lease / complete / fail)
-- ---------------------------------------------------------------------------
create or replace function lease_jobs(p_worker text, p_limit int, p_lease_seconds int, p_kinds text[] default null)
returns setof job_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  update job_queue j set status = 'leased', leased_until = now() + make_interval(secs => p_lease_seconds),
         leased_by = p_worker, attempts = j.attempts + 1
  where j.id in (
    select id from job_queue
    where ((status = 'pending' and run_after <= now()) or (status = 'leased' and leased_until < now()))
      and (p_kinds is null or kind = any(p_kinds))
    order by priority desc, run_after
    limit p_limit
    for update skip locked
  )
  returning j.*;
end $$;

create or replace function fail_job(p_id uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update job_queue set
    status = case when attempts >= max_attempts then 'dead'::job_status else 'pending'::job_status end,
    last_error = left(p_error, 2000),
    leased_until = null,
    -- exponential backoff: 30s, 60s, 120s, ... capped at 1h
    run_after = now() + make_interval(secs => least(3600, 30 * power(2, greatest(attempts - 1, 0))::int)),
    finished_at = case when attempts >= max_attempts then now() else null end
  where id = p_id;
end $$;

create or replace function bump_api_usage(p_provider text, p_ok boolean, p_units numeric, p_error text default null)
returns api_usage language plpgsql security definer set search_path = public as $$
declare r api_usage;
begin
  insert into api_usage (provider, day, requests, failures, units, last_success_at, last_error)
  values (p_provider, (now() at time zone 'utc')::date, 1, case when p_ok then 0 else 1 end, p_units,
          case when p_ok then now() end, case when p_ok then null else left(p_error, 500) end)
  on conflict (provider, day) do update set
    requests = api_usage.requests + 1,
    failures = api_usage.failures + case when p_ok then 0 else 1 end,
    units = api_usage.units + p_units,
    last_success_at = case when p_ok then now() else api_usage.last_success_at end,
    last_error = case when p_ok then api_usage.last_error else left(p_error, 500) end
  returning * into r;
  return r;
end $$;

revoke execute on function lease_jobs, fail_job, bump_api_usage from public, anon, authenticated;

-- Retention: call daily from the Worker
create or replace function purge_expired_data() returns void
language sql security definer set search_path = public as $$
  delete from search_cache where expires_at < now();
  delete from telegram_updates where received_at < now() - interval '7 days';
  delete from agent_logs where created_at < now() - interval '30 days';
  delete from source_health where checked_at < now() - interval '30 days';
  delete from job_queue where status in ('succeeded') and finished_at < now() - interval '7 days';
  delete from scan_history where started_at < now() - interval '60 days';
$$;
revoke execute on function purge_expired_data from public, anon, authenticated;
