# Startup company logo design

Date: 2026-09-14
Status: Approved design, pending implementation plan

## Goal

Let an authenticated startup participant upload, replace, or remove the shared company logo from the existing **Startup Profile** module. The logo belongs to the startup organization, not to an individual founder, and appears anywhere the product presents that startup's organization image. Also make the **Stage** select use the full width available to its form field.

## Existing context

- `startup_organizations.logo_url` is an optional public URL and remains a rollout fallback.
- Personal participant images use a private `profile-photos` bucket, validated server-side image processing, versioned object paths, conditional database updates, and short-lived signed display URLs.
- The Startup Profile endpoint already resolves the signed-in participant's active startup membership and team assignment without accepting an organization identifier from the browser.
- Startup Profile organization updates already use RLS and narrow column grants.

## Recommended architecture

Add a nullable organization-level storage reference, `startup_organizations.logo_path`, rather than storing signed URLs or overloading a founder's `profiles.photo_path`. Store processed files in a new private `startup-logos` bucket under a versioned path shaped as `<organization-id>/<uuid>.<extension>`.

Create a focused startup-logo service and Supabase repository alongside the personal-photo implementation. Reuse the same accepted MIME types, 4 MiB input limit, decoded pixel limit, metadata stripping, and maximum 1024 x 1024 output dimensions. Upload each replacement to a new object path, conditionally change `logo_path` from the previously read value, and delete the old object only after the database update succeeds. Cleanup failure may leave an unreferenced private object but must never erase the currently selected logo.

Expose a dedicated authenticated `/api/startup-logo` route for upload and removal. The route derives the caller's profile from the session and the active organization from canonical semester membership plus startup-team assignment. It never accepts an organization ID or storage path from the client. Preview mode exposes no actionable file control.

## Authorization and RLS

- Keep the bucket private.
- Allow reads only when the related startup organization is visible through existing cohort RLS.
- Allow inserts and deletes only when the path's first segment is the organization the caller can manage as an active or onboarding assigned startup member. Existing authorized semester admins may also use the underlying organization-level policy for future admin tooling, but this participant endpoint remains self-service for the caller's assigned startup.
- Grant authenticated users only the narrow `logo_path` update capability required by the existing startup-organization update policy.
- Use both `USING` and `WITH CHECK` for organization updates. Do not use service-role bypasses or client-supplied authorization claims.
- Storage objects are changed only through the Storage API; SQL defines policies but does not insert, update, or delete object rows directly.

## Data flow

1. The participant dashboard loads `logo_path` with `logo_url` as a compatibility fallback and resolves a one-hour signed URL for the private object.
2. Startup Profile renders the shared logo control using the organization name for its initials fallback.
3. A valid file is posted as multipart form data to `/api/startup-logo`.
4. The server resolves the caller's active startup organization, processes the image, uploads a new versioned object, and conditionally persists the new path.
5. The response returns a fresh signed URL. The dashboard updates immediately and a reload obtains another signed URL from the stored path.
6. Removal conditionally clears `logo_path`, best-effort deletes the prior object, and falls back to `logo_url` when present or organization initials otherwise.

Concurrent replace/remove operations use compare-and-swap database updates so a slower request cannot silently overwrite a newer selection. Failed uploads or failed database updates retain the previous logo.

## Interface changes

Place the company-logo control near the top of **About your startup**, before the form fields. Label it **Company logo** and explain that it is shared across the startup team. Support JPEG, PNG, and WebP up to 4 MiB, with upload/replace/remove actions, busy state, success feedback, and accessible error messages.

Style `.formGrid select` with the same width, box sizing, border, background, padding, typography, focus treatment, and responsive behavior as text inputs. This directly fixes the narrow native Stage control without changing the two-column desktop form or the existing narrow layout.

## Schema and migration workflow

Update the declarative schema and bucket configuration first. Generate the migration with `supabase db diff`; never hand-edit a migration. Regenerate `src/db/types.ts` after the local schema change. Review the generated migration for the new column, path constraint, grants, and Storage policies. Bucket configuration remains explicit in `supabase/config.toml` because bucket provisioning is not fully represented by schema diff output.

Before any remote action, verify the project reference is exactly `layjdjfvxkowxidwuvbs`. Deployment and production bucket creation are outside this implementation unless separately authorized.

## Test and QA strategy

Follow test-driven development:

- Domain tests for validation, processing, versioned paths, conditional replacement, rollback cleanup, remove, and concurrency outcomes.
- Repository and route tests proving the organization is derived from the authenticated assigned membership, with denial for unrelated, inactive, or unassigned profiles.
- Schema contract/database tests for the new column constraint, narrow grant, organization RLS, and Storage read/write isolation.
- Dashboard tests for signed logo projection, `logo_url` fallback, reload persistence, and initials fallback.
- UI tests for preview isolation, upload/replace/remove feedback, and full-width Stage styling.

Run focused tests first, then scoped lint, TypeScript checks, `git diff --check`, and broader tests proportional to the resulting change. Authenticated QA must cover startup upload, replace, remove, reload/persistence, another team member seeing the shared logo, an unrelated account being denied, error states, desktop layout, and a narrow viewport. Report each scenario as PASS, FAIL, or BLOCKED.

## Out of scope

- Editing a founder's personal profile photo from Startup Profile.
- Public or anonymous access to private startup-logo objects.
- Bulk migration of existing `logo_url` images into Storage.
- Admin logo-management UI, export archives containing binary assets, deployment, or remote data changes.

## Current Supabase references

- Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Private buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Standard uploads and versioned replacement guidance: https://supabase.com/docs/guides/storage/uploads/standard-uploads
- Storage schema safety: https://supabase.com/docs/guides/storage/schema/design
