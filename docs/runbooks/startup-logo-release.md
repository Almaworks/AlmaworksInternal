# Startup logo release

Target only `layjdjfvxkowxidwuvbs` (`https://layjdjfvxkowxidwuvbs.supabase.co`). This runbook prepares a release; it does not authorize deployment.

## Package and order

1. Apply the generated `startup_logo_profile` migration, then the generated `startup_logo_storage` migration. Review the pending list before applying; do not release unrelated pending work with this feature.
2. Provision the private `startup-profile-logos` bucket using the narrow configuration below. Bucket records are data and are not produced by a schema diff.
3. Deploy the application changes and perform real startup-session QA following `authenticated-qa.md`.

After explicit release authorization, run from the repository root with Supabase CLI credentials for the allowlisted project:

```powershell
npx --yes supabase@2.119.0 db push --project-ref layjdjfvxkowxidwuvbs --skip-vault --dry-run
# Continue only when the pending migrations are exactly the reviewed release set.
npx --yes supabase@2.119.0 db push --project-ref layjdjfvxkowxidwuvbs --skip-vault
npx --yes supabase@2.119.0 seed buckets --linked --project-ref layjdjfvxkowxidwuvbs --workdir scripts/startup-logo-storage
```

The separate storage configuration contains only `startup-profile-logos`, with private visibility, a 4 MiB limit, and JPEG/PNG/WebP MIME types. Do not run a broad bucket seed as a substitute: existing `startup-logos` objects and public URLs are legacy assets and must remain intact.

## Release checks

- Confirm both migration versions are recorded, the three managed-logo policies exist on `storage.objects`, and the bucket has the exact restrictions above.
- Through real authenticated startup sessions: upload, reload, replace, reload, remove, reload; verify a teammate sees the shared change.
- Confirm another startup cannot upload/delete the first startup's logo or change its logo path; suspended/inactive memberships cannot manage logos.
- Check startup directory/profile images and legacy URL fallback. Verify unauthenticated API requests return 401 and invalid/oversized images are rejected.

If application rollout fails, roll back the application and retain the additive schema/private bucket. Do not delete uploaded objects, revert the legacy bucket's visibility, or drop authorization guards as a rollback shortcut.

Generation uses `supabase db diff`; migration SQL must remain generator output. CLI 2.115.0 omitted these policies with pg-delta, while its legacy shadow replay hit an existing pg_net extension conflict. See the implementation report for the verified generator and replay results.

Hosted release on 2026-10-02 used the verified Supabase connector because the bulk push detected historical hosted versions absent from this repository. Do not repair or erase that history to force a push. The two generated SQL bodies were applied individually and their local filenames aligned to hosted versions `20261002041604` and `20261002041612`, without editing the SQL. The scoped bucket seed command above then created the private bucket successfully.

References: [Supabase diff engines](https://supabase.com/docs/guides/local-development/diff-engines), [bucket seeding](https://supabase.com/docs/reference/cli/supabase-seed-buckets).
