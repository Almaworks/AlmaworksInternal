## Project: AlmaworksInternal — Current Goals (2026-11-02)

CRITICAL SAFETY CONSTRAINT: ALL database operations MUST use ONLY
project_id: layjdjfvxkowxidwuvbs (AlmaworksInternal). NEVER touch any other project.

This checklist reflects code on the current branch through `0dd958f` (2026-10-15), not a new deployment audit. See [PROGRESS.md](PROGRESS.md) for dated milestones. Checked items are implemented; unchecked items need verification or future scoping.

OUTREACH AND EMAIL
- [x] Semester-scoped contact/company/team/queue views, ownership, activity history, import review, pipeline management, and carry-forward
- [x] Email templates, preview, Resend send/schedule/history/recheck/cancel flows
- [x] Separate opt-in personal Gmail connection and single-recipient send implementation
- [ ] Verify real provider delivery, persisted history, uncertain-send recovery, and staff/semester authorization in the target environment
- [ ] Scope Gmail reply sync, bulk sends, or automated follow-ups separately; they are not current shipped capabilities

MEMBERS, MENTORS, AND STARTUPS
- [x] Semester membership lifecycle, roster import/readiness, tracked invitations, access requests, and login-account controls
- [x] Emailed setup codes, individual onboarding requirements, and recovery/contact paths
- [x] Mentor/startup dashboards, profiles, shared expertise tags, startup mentor needs, cohort network, and startup directory
- [x] Profile photo controls and shared startup logo management
- [x] Super Admin gates for semester lifecycle and platform access operations
- [ ] Verify invited/returning/pending/suspended users with real role-specific sessions, including teammate onboarding and logo persistence/access boundaries
- [ ] Confirm whether short semester tags and table-header sorting remain product requirements before scheduling follow-up work

BOOKINGS, CALENDAR, AND PROGRAM SCHEDULE
- [x] Real-week mentor booking availability, startup requests, mentor responses, accepted occupancy, cancellations, and history
- [x] Date-specific mentor availability editing with explicit copies; Google Calendar connection, busy import, sync and hold handling
- [x] Session RSVP and persistent participant notification read state
- [x] Semester schedule and Friday program speaker/cancellation management with editable week labels
- [ ] Verify current-week navigation, availability save/reload, overlap handling, request/response persistence, and permission failures
- [ ] Verify live Google consent, freshness, actual holds, disconnect cleanup, reconnect/account-switch behavior, and background worker outcomes
- [ ] Confirm current duplicate/conflict protections in authenticated QA before proposing any new distinct-session schema work

RESOURCES AND LEGACY FLOWS
- [x] Retired Resources and Export; email templates live in Outreach email
- [x] Redirected mentor inbox to Bookings; retired legacy assignment candidate/commit APIs return HTTP 410
- [ ] Keep navigation and future documentation aligned with these replacements

AI MATCHING AND GAP ANALYSIS — FUTURE SCOPE
- [ ] Define independently verifiable requirements for mentor-startup ranking and recruiting gaps
- [ ] Implement LLM-backed functionality through `src/ai/` only; this directory currently contains instructions, not a working AI engine
- [ ] Define safe fallback behavior and authorization/semester boundaries before rollout

VERIFICATION AND RELEASE PRIORITIES
1. Follow [authenticated QA](docs/runbooks/authenticated-qa.md): real admin/mentor/startup sessions, primary actions, persistence after reload, errors, and authorization boundaries. Report PASS/FAIL/BLOCKED per scenario.
2. Reconcile the actual frontend release with [Calendar](docs/runbooks/google-calendar-release.md), [Outreach email](docs/runbooks/outreach-email.md), [personal Gmail](docs/runbooks/personal-gmail-outreach.md), and [startup-logo](docs/runbooks/startup-logo-release.md) runbooks. Historical backend deployment notes do not certify the whole application.
3. Run relevant automated checks with installed dependencies and require zero test regressions before implementation commits. Passing tests alone do not replace authenticated QA.
4. Preserve RLS and the allowlisted project boundary; program-scoped tables require non-null semester_id. Review any future schema work separately.
5. Deploy only when explicitly requested, to a named target, with recorded release evidence. This documentation refresh does not deploy anything.
