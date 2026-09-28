-- Persistent background delivery; secrets are provisioned separately in Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
