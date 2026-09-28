# Personal profile photos

Founders and mentors manage their personal photo from **Profile**. A photo is optional; the application shows initials when none is available. This is a person-level photo shared across semesters, separate from a startup logo.

## Behavior

- Upload or replace a JPEG, PNG, or WebP image up to 4 MiB. This leaves room for multipart overhead below [Vercel's 4.5 MB function request limit](https://vercel.com/docs/functions/limitations).
- Remove a photo to return to initials.
- The upload is saved independently of the other profile fields.
- Display the photo in the participant sidebar, Profile, network/discovery cards, startup people, and mentor directory/profile views.
- Admin role previews disable photo changes and do not upload to a real account.

## Access and storage

The `profile-photos` bucket is private. Upload and deletion use the authenticated user's Supabase client. Storage policies restrict changes to the owner's photo, while photo reads follow visibility of the corresponding profile under existing RLS. The global profile stores the storage reference; signed image URLs are issued for display rather than persisted in the database.

The global identity exemption is documented in [identity and membership architecture](architecture/identity-membership.md).

Uploads are decoded and re-encoded before storage, stripping embedded metadata and resizing to fit within 1024 × 1024 pixels without enlarging smaller images. Images above 50 million input pixels are rejected. Replacement uses a new object path and a conditional profile update to preserve the currently saved photo if the operation fails or another update wins. Storage cleanup is best effort: a failed cleanup can leave an unreferenced private object. When an initial upload overlaps removal of an already-empty photo reference, the later successful upload can become the current photo.

Signed display URLs last one hour. Reloading the dashboard obtains fresh URLs. Previously issued URLs remain usable until expiry, subject to object removal; revoking profile visibility does not instantly revoke an already-issued URL.

## Release

Release is blocked on packaging the database migration. `supabase db diff` attempts either omitted Storage policies, failed on baseline foreign-key ordering, or emitted unrelated grants and an invalid policy expression. No incomplete migration should be released. The tested intended SQL is available as a [review artifact](../outputs/profile-photos-migration.sql), pending an explicit exception to the repository's generated-migrations-only rule. It is not an installed migration.

Production deployment is a separate action. Before release, verify that the Supabase target is exactly `layjdjfvxkowxidwuvbs` (`https://layjdjfvxkowxidwuvbs.supabase.co`). Apply the approved, packaged profile-photo migration and configure the private bucket before releasing application code that reads the new column. Do not use a different project or a public bucket.

The bucket definition is in `supabase/config.toml`; bucket rows are not captured by schema diff migrations. In the allowed project's Storage settings, create or verify the `profile-photos` bucket with public access **off**, a 4 MiB (`4194304` byte) file-size limit, and only `image/jpeg`, `image/png`, and `image/webp` allowed. The migration must supply the object policies; do not add permissive dashboard-generated policies.

Verify with two authorized participant accounts: upload, reload, view from the other account, replace, and remove. Verify that an unrelated account cannot modify or read photos outside its existing profile visibility. Inspect desktop and narrow layouts, invalid files, upload failure, and initials fallback.

Reverting the frontend does not require deleting stored photos. Preserve the additive schema and storage objects unless a separate data-removal action is explicitly authorized.
