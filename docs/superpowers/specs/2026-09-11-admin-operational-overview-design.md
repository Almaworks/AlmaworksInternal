# Admin Operational Overview Design

## Goal

Make the admin Overview an operational signal board and make access, member, and startup management independent sidebar modules.

## Design

`/dashboard/admin` is the Overview and displays only currently actionable program signals: mentorship participation, identified mentorship needs, session health, and links to work queues. It does not display completed onboarding or launch-sequence progress.

`/dashboard/admin/access`, `/dashboard/admin/members`, and `/dashboard/admin/startups` render the existing management workspaces as distinct routes. Regular admins see program signals and the member/startup modules. Super admins additionally see a compact access queue for pending registrations and members ready for activation. The access route remains capability-gated by the existing server/client authorization.

The admin sidebar becomes the sole primary navigation for these modules. Legacy `?tab=` links retain a deterministic route mapping so existing deep links do not lose their target.

## Constraints

- Preserve Supabase RLS and existing authorization behavior.
- No schema, migration, remote Supabase, or deployment work.
- Keep TypeScript strict; do not introduce `any`.
- Preserve existing management controls and their focused tests.
