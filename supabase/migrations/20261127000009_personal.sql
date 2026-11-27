-- Phase 7: personal management (applications, tasks, earnings, payment reliability).
-- Extends tables from 0001; owner-only RLS from 0002 still applies. Safe to run more than once.

-- Applications: your own deadline, where you applied, and evidence links.
alter table applications add column if not exists project_name text;
alter table applications add column if not exists link text;
alter table applications add column if not exists deadline_at timestamptz;
alter table applications add column if not exists evidence_urls text[] not null default '{}';
alter table applications alter column status set default 'saved';

-- Tasks: effort, priority, an optional opportunity, and when it was finished.
alter table tasks add column if not exists opportunity_id uuid references opportunities(id) on delete set null;
alter table tasks add column if not exists minutes_estimate int check (minutes_estimate between 1 and 1440);
alter table tasks add column if not exists priority text not null default 'medium' check (priority in ('high', 'medium', 'low'));
alter table tasks add column if not exists completed_at timestamptz;

-- Earnings: what it was for, when payment is expected, notes.
alter table earnings add column if not exists title text;
alter table earnings add column if not exists opportunity_id uuid references opportunities(id) on delete set null;
alter table earnings add column if not exists project_name text;
alter table earnings add column if not exists expected_at timestamptz;
alter table earnings add column if not exists notes text;
alter table earnings add column if not exists updated_at timestamptz not null default now();
create or replace trigger earnings_updated before update on earnings for each row execute function set_updated_at();

-- Payment history: link your own payment records to the earning they came from, and allow
-- "paid" when no expected date was set to judge timeliness.
alter table payment_history add column if not exists earning_id uuid unique references earnings(id) on delete cascade;
alter table payment_history drop constraint if exists payment_history_outcome_check;
alter table payment_history add constraint payment_history_outcome_check check (outcome in ('paid_on_time', 'paid_late', 'paid', 'unpaid', 'partial'));
create index if not exists payment_history_project_idx on payment_history (project_id, created_at desc);
