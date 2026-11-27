-- Phase 6: XEN Lab (testing tools) and outreach workspace.
-- Extends the tables created in 0001; all stay owner-only via the RLS policies from 0002.
-- Safe to run more than once.

-- Bug reports: keep the structured report, where it was filed, and what it was for.
alter table bug_reports add column if not exists platform_url text;
alter table bug_reports add column if not exists report jsonb;
alter table bug_reports add column if not exists submitted_url text;
alter table bug_reports add column if not exists opportunity_id uuid references opportunities(id) on delete set null;
alter table bug_reports add column if not exists updated_at timestamptz not null default now();
create or replace trigger bug_reports_updated before update on bug_reports for each row execute function set_updated_at();
create index if not exists bug_reports_user_idx on bug_reports (user_id, created_at desc);

-- Test plans: a testing session is the plan; its cases carry priority and order.
alter table testing_sessions add column if not exists title text;
alter table testing_sessions add column if not exists platform_type text;
alter table test_cases add column if not exists priority text check (priority in ('high', 'medium', 'low')) default 'medium';
alter table test_cases add column if not exists preconditions text;
alter table test_cases add column if not exists notes text;
alter table test_cases add column if not exists position int not null default 0;
create index if not exists test_cases_session_idx on test_cases (session_id, position);

-- Product feedback drafts.
create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  project_name text,
  category text not null,
  observations text not null,
  headline text,
  body text,
  suggestions text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'acknowledged')),
  created_at timestamptz not null default now()
);
alter table feedback_items enable row level security;
drop policy if exists feedback_items_owner on feedback_items;
create policy feedback_items_owner on feedback_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on feedback_items to authenticated;
grant all on feedback_items to service_role;

-- Outreach: channel, message type, subject and the reply, per message.
alter table outreach_messages add column if not exists channel text check (channel in ('email', 'discord', 'telegram', 'x', 'form', 'other'));
alter table outreach_messages add column if not exists kind text not null default 'first_contact' check (kind in ('first_contact', 'application_response', 'follow_up'));
alter table outreach_messages add column if not exists subject text;
alter table outreach_messages add column if not exists response text;
alter table outreach_messages add column if not exists project_name text;
create index if not exists outreach_messages_user_idx on outreach_messages (user_id, created_at desc);
