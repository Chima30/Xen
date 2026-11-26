-- Migration 0001 revoked EXECUTE on the privileged functions from PUBLIC, which also removed it
-- from service_role (it had no explicit grant). Give it back to the server only.
grant execute on function lease_jobs, fail_job, bump_api_usage, purge_expired_data to service_role;
