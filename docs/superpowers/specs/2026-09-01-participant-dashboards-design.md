# Participant Dashboards Design

## Goal

Replace the legacy mentor and startup forms with a compact, role-aware workspace that supports onboarding, current-semester discovery, private session history, derived notifications, and self-service profile/account updates.

## Data and authorization contract

- `semester_memberships` is the only source of participant role and semester access.
- Only the active semester is selected for participant dashboards. Alumni and prior-semester records are never included.
- Session rows are limited by existing RLS and then mapped only when the signed-in mentor owns the `mentor_semester_id` or the signed-in startup team owns the `startup_semester_id`.
- Directory cards use canonical `mentor_profiles`, `startup_semesters`, and `startup_organizations` data exposed by current RLS. Sign-in email, team membership records, admin notes, matching rationale, and availability are not directory fields.
- All server reads use the caller's bearer token and the anon-key Supabase client. The service role is never used.
- No schema, migration, RLS, or generated database type changes are part of this feature.

## Account creation and activation

Real and test accounts follow one path. An administrator creates or invites an account and assigns its semester membership and role. After authentication:

- no matching active-semester membership: show an activation-pending state;
- `invited` or `onboarding`: show the dashboard shell and onboarding checklist;
- `active`: show the complete participant workspace;
- `alumni` or `suspended`: do not expose an earlier semester through the participant dashboard.

Participants may update records that existing RLS already owns: their safe profile fields, mentor profile/semester fields, startup semester fields, and meeting availability. Membership activation remains administrator-controlled. Finishing participant-owned setup therefore produces a ready-for-activation state, not a browser-side membership promotion.

## Information architecture

Mentor and startup workspaces share persistent tabs:

1. Home: activation progress, next session, derived notifications, and network preview.
2. Network: mentor users browse active-semester startups; startup users browse active-semester mentors.
3. Sessions: upcoming and earlier meetings from the active semester belonging to the participant or startup team.
4. Notifications: deterministic notices derived from membership readiness, profile completeness, and owned sessions. There is no persistent read/unread state because the canonical schema has no notification table.
5. Profile: edit RLS-authorized public/semester fields and separately request a Supabase Auth sign-in email change.

## UI behavior

- Preserve the approved compact mockup's navy shell, persistent desktop rail, mobile bottom tabs, content cards, role-specific language, responsive layout, and privacy messaging.
- Production pages contain no fixture data or mockup banners.
- Empty, loading, authorization, and retry states are explicit.
- Search is local over the already scoped directory response.
- Email changes use `supabase.auth.updateUser`, display confirmation requirements, and do not overwrite `profiles.email` directly.

## Verification

- Unit tests cover membership selection, participant ownership, active-semester filtering, derived notifications, activation steps, and safe profile payloads.
- API handlers are tested through dependency-injected application functions without bypassing RLS.
- TypeScript, lint, full tests, and production build must pass.
- Desktop and narrow viewport visual checks cover mentor and startup states when browser tooling and authentication fixtures are available.
