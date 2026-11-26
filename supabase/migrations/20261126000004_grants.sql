-- Explicit table privileges for the Supabase Data API roles.
-- Newer Supabase projects may not grant these automatically to tables created in SQL,
-- in which case every dashboard query fails with "permission denied".
-- Row Level Security (migration 0002) still decides which rows each role can see or change.

grant usage on schema public to anon, authenticated, service_role;

-- Server-side pipeline (service-role key; never sent to the browser).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Signed-in users: RLS policies limit them to shared intelligence and their own rows.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Signed-out visitors get no table access at all.
revoke all on all tables in schema public from anon;

-- Apply the same rules to tables added by later migrations.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public revoke all on tables from anon;
