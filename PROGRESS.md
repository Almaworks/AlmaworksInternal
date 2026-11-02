# Sprint Progress

## Status Assessment — 2026-11-02

Reviewed the current branch through `0dd958f` (2026-10-15), using dated Git history, `app/`, `src/`, `components/`, `lib/`, and `docs/`. Checked items below mean implemented in this checkout, not a fresh production or authenticated QA certification. There are no later commits on this branch as of this review.

### Implemented Since the June Sprint

- [x] Outreach: semester-scoped People, Companies, Team, and Queue workspaces; contact details, ownership, activity history, pipeline stages, import review, bulk updates, and carry-forward (`app/dashboard/admin/outreach/`).
- [x] Outreach email: reusable templates, compose/preview, immediate and scheduled Resend sends, history, recheck, cancellation, and safe retry handling (`src/outreach-email/`, `components/outreach-email/`). Personal Gmail OAuth and single-recipient sending are implemented separately; activation and real-mailbox QA remain release checks.
- [x] Members and cohorts: reusable identities, semester memberships, roster import/readiness, invitation/access-request workflows, activation/closure operations, and retained-history login controls. Semester lifecycle management is restricted to Super Admins.
- [x] Participant dashboards: mentor/startup profiles, shared expertise picker, startup mentor needs, active-cohort network/contact cards, startup directory, session RSVP, and persistent notification read state (`app/dashboard/participant/`, `src/dashboard/`).
- [x] Bookings: real calendar-week navigation, available mentor times, startup requests, mentor responses, accepted occupancy, cancellation/history, and booking context (`components/mentor-booking/`, `src/mentor-booking/`). The old mentor inbox redirects to `/dashboard/bookings`.
- [x] Calendar: Google OAuth, busy-time import, availability controls, sync/hold workers, connection/disconnect status, and date-specific mentor editing with explicit copies (`src/calendar/`, `components/calendar/`).
- [x] Program operations: semester schedule and Friday program management, speaker/cancellation workflows, editable week labels, and notification/reminder infrastructure.
- [x] Profile media: participant photo controls and shared startup logo upload/replace/remove with private storage and legacy-image fallback.

### Recent Merged / Committed Milestones

Dates below are commit dates from `git log`; they do not establish deployment dates.

| Date | Commit | Change |
| --- | --- | --- |
| 2026-09-06 | `473caa3` | Program administration and participant workflows, following cohort lifecycle/read-state work |
| 2026-09-14 | `a18b5e7` | Real-week mentor booking calendar |
| 2026-09-15 | `e66b536` | Availability drag responsiveness fix |
| 2026-09-28 | `74d9416` | Integrated onboarding, calendar, outreach, and program updates |
| 2026-09-29 | `73bbae7`, `1fc7517` | Member invitation delivery and protection against email-link previews |
| 2026-09-29 | `11284cb` | Public privacy policy and terms of service |
| 2026-10-01 | `3c4f9d3`, `6345297` | Retired Resources/Export modules; explained Google verification warning |
| 2026-10-02 | `3c370fe`, `bf53e3e`, `958ba02` | Shared startup logos, Friday week labels, missing-login provisioning |
| 2026-10-08–09 | `727010d`, `c5df6ab`, `4f447b3`, `4fb0268` | Emailed setup codes, access/verification separation, individual onboarding, login recovery |
| 2026-10-12 | `3cef575` | Corrected onboarding expertise storage keys |
| 2026-10-15 | `0dd958f` | Date-specific mentor availability with explicit copies |

### Superseded June Plans

- Resources/template-email work moved to Outreach email; Resources and Export were retired. Do not recreate those modules from the old checklist.
- A separate mentor inbox/calendar page is no longer the next deliverable: Bookings and Calendar settings provide the current workflows.
- The old admin assignment candidate/commit endpoints return HTTP 410 (`src/assignments/retired.ts`); do not describe the former assignment wizard as the current booking flow.
- A standalone duplicate-session migration and short semester-tag sorting are not verified deliverables in this review. Confirm current requirements and existing protections before proposing changes.

### Still Remaining / Verification in Progress

- [ ] Run role-specific authenticated QA for onboarding, outreach sending, bookings, calendar connect/disconnect, profile media, and semester permissions. Follow `docs/runbooks/authenticated-qa.md`; reload/persistence, error cases, and authorization boundaries are required.
- [ ] Confirm the intended frontend release and integration configuration. Calendar's release runbook records a Supabase worker/Cron deployment on 2026-09-19, but its frontend checkpoint is local. The startup-logo runbook records a hosted backend/storage release on 2026-10-02. Neither proves today's entire frontend is deployed.
- [ ] Activate/verify personal Gmail only against its release checklist; reply sync, bulk sending, and automated follow-ups remain future work (`docs/runbooks/personal-gmail-outreach.md`).
- [ ] Treat AI matching and recruiting gap analysis as future goals: `src/ai/` contains guidance only, not the documented matching/gap-analysis implementations.

## NEXT SESSION

1. Name the target environment and run authenticated role-specific QA for the latest onboarding and date-specific availability changes.
2. Reconcile integration release status against the Calendar, Gmail, Outreach email, and startup-logo runbooks; record actual results rather than inferring delivery from commits.
3. Resolve confirmed defects one feature at a time. Define acceptance criteria before starting AI matching or revisiting June-only requirements.
