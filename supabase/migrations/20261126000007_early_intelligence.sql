-- Phase 5: early intelligence — project signals with evidence, announcement change
-- detection, project watch sources and watchlist notifications.

-- Project signals carry the verbatim evidence they were derived from.
alter table project_signals add column announcement_id uuid references announcements(id) on delete set null;
alter table project_signals add column evidence_excerpt text;
alter table project_signals add column details jsonb not null default '{}';
create index project_signals_recent_idx on project_signals (project_id, observed_at desc);
create index project_signals_type_idx on project_signals (signal_type, observed_at desc);

-- Announcements link to the project they are about (set after analysis).
create index announcements_project_idx on announcements (project_id) where project_id is not null;

-- What changed between two stored versions of the same announcement.
create table announcement_changes (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  from_hash text not null,
  to_hash text not null,
  added_lines text[] not null default '{}',
  removed_lines text[] not null default '{}',
  deadline_changed boolean not null default false,
  reward_changed boolean not null default false,
  dates_before text[] not null default '{}',
  dates_after text[] not null default '{}',
  amounts_before text[] not null default '{}',
  amounts_after text[] not null default '{}',
  significant boolean not null default false,
  detected_at timestamptz not null default now(),
  unique (announcement_id, from_hash, to_hash)
);
create index announcement_changes_recent_idx on announcement_changes (detected_at desc);
create index announcement_changes_project_idx on announcement_changes (project_id, detected_at desc);

-- Watchlist bookkeeping.
alter table watchlists add column notes text;
alter table watchlists add column last_notified_at timestamptz;

-- Single official pages (blog index, announcements page, docs changelog) watched for changes.
insert into source_adapters (id, name, kind, requires_credentials, supported, notes) values
  ('page', 'Official page monitor', 'feed', '{}', true,
   'Fetches one public page on the project''s own domain and compares it with the previous snapshot.')
on conflict (id) do nothing;

-- RLS + grants (same pattern as migrations 0002 and 0004).
alter table announcement_changes enable row level security;
create policy announcement_changes_read on announcement_changes for select to authenticated using (true);
grant select on announcement_changes to authenticated;
grant all on announcement_changes to service_role;
