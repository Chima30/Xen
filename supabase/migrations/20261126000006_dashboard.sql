-- Phase 4 dashboard support: owner role and saved discovery filters.

-- Owner role: the owner may manage shared sources from the dashboard (done server-side
-- with the service role after this check). Users can edit their profile but never their role.
alter table profiles add column role text not null default 'member' check (role in ('owner', 'member'));
update profiles set role = 'owner'
  where id = (select id from auth.users order by created_at asc limit 1);

revoke update on profiles from authenticated;
grant update (display_name, country_code, timezone, skills, bio, updated_at) on profiles to authenticated;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner')
$$;
revoke execute on function is_owner from public, anon;
grant execute on function is_owner to authenticated, service_role;

-- Saved filters for the Discover pages (the query string of the filter form).
create table saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  path text not null default '/discover' check (path like '/discover%'),
  query text not null check (char_length(query) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table saved_filters enable row level security;
create policy saved_filters_owner on saved_filters for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on saved_filters to authenticated;
grant all on saved_filters to service_role;
