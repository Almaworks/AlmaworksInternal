# Almaworks Database Revamp

**Status:** Approved
**Date:** 2026-08-31

## Goal

Replace the overlapping legacy and lifecycle schemas with one small, consistent model for semester operations and one separate semester-based outreach CRM. Existing production data must be preserved throughout the cutover.

## Vocabulary

- **Semester:** One Almaworks cohort term, such as Spring 2026 or Fall 2026.
- **Meeting:** One configured Friday program date within a semester.
- **Session:** One mentor-startup pairing in slot 1 or slot 2 of a meeting.
- **Profile:** An authenticated platform user: mentor, startup team member, or administrator.
- **Outreach contact:** A CRM person without a managed platform login.

The application and documentation must not use `meeting` for a mentor-startup pairing or an outreach call. Outreach uses `conversation`; program pairings use `session`.

## Target schema

### Program management

1. `semesters`
2. `profiles`
3. `platform_roles`
4. `semester_memberships`
5. `invitations`
6. `mentor_profiles`
7. `mentor_semesters`
8. `startup_organizations`
9. `startup_semesters`
10. `startup_team_memberships`
11. `meetings`
12. `meeting_availability`
13. `sessions`
14. `program_audit_events`

### Outreach

15. `outreach_contacts`
16. `outreach_companies`
17. `outreach_contact_companies`
18. `outreach_opportunities`
19. `outreach_activities`
20. `outreach_imports`

## Program model

`profiles` is durable authenticated identity only. Semester participation and role are authoritative in `semester_memberships`. The Members page groups memberships by profile and renders distinct semester names as tags; session rows never determine membership history.

`mentor_profiles` holds durable biography and expertise. `mentor_semesters` holds semester-specific capacity, readiness, goals, and format preferences. `startup_organizations` holds durable company identity. `startup_semesters` holds cohort-specific stage, goals, needs, and preferences. `startup_team_memberships` connects authenticated startup team members to the semester-specific startup.

`meetings` replaces `session_dates`. A meeting belongs to one semester and must be a Friday within that semester. Each meeting exposes exactly two supported slots. `meeting_availability` records a semester member's availability for a meeting slot.

`sessions` references one meeting, one mentor-semester record, one startup-semester record, and slot 1 or 2. Its semester must match every referenced record. Database constraints prevent a mentor or startup from being double-booked in a slot. `sessions.status` is the single source of truth for requested, confirmed, declined, or cancelled state.

Onboarding state is stored on `semester_memberships` as structured JSON plus completion timestamps; role-specific answers are stored in the appropriate mentor/startup semester records. This replaces the row-per-checklist-item `onboarding_progress` table.

## Outreach model

Contacts and companies are global reusable CRM records. An `outreach_opportunities` row places one contact on one semester's outreach list. There is at most one opportunity per contact and semester, with one or more target relationship types such as mentor, investor, or sponsor.

Carrying contacts forward creates fresh opportunities for the target semester. Contact details, company relationships, expertise, and durable background notes are reused. Stage starts at `not_contacted`; follow-up and snooze state is cleared. Historical activities remain attached to prior-semester opportunities and remain visible as context.

Bulk reset changes selected current-semester opportunities to `not_contacted`, clears operational follow-up state, and appends an activity recording the reset. It does not delete notes or history.

Outreach contacts do not reference `profiles`, `mentor_profiles`, or startup records. Administrative ownership and activity authors may reference `profiles` because those are Almaworks staff operating the CRM.

## Table consolidation

- `mentors` migrates into `mentor_profiles`, `semester_memberships`, and `mentor_semesters`, then is removed.
- `startups` migrates into `startup_organizations`, `startup_semesters`, and `startup_team_memberships`, then is removed.
- `session_dates` becomes `meetings`.
- `availability` and `availability_windows` become `meeting_availability`.
- `lifecycle_audit_events` becomes `program_audit_events`.
- `onboarding_progress` folds into `semester_memberships`.
- `access_requests` folds into requested semester memberships for authenticated signups.
- `invitation_delivery_attempts` folds into delivery fields on `invitations`.
- `lifecycle_configuration_templates` folds into `semesters.configuration`.
- Legacy `outreach` and `outreach_activity_log` are removed after reconciliation.
- Outreach label joins become arrays on contacts/opportunities.
- Outreach import jobs and rows become one `outreach_imports` record with bounded JSON payload and results.

## Migration strategy

The migration is expand/backfill/cutover/contract:

1. Add canonical structures, constraints, compatibility helpers, and RLS without removing live tables.
2. Backfill canonical mentor, startup, membership, meeting, session, and outreach records with reconciliation reports.
3. Switch backend commands and UI reads/writes to the canonical schema.
4. Verify row counts, foreign-key consistency, authorization, and user workflows locally and against a production snapshot.
5. Remove compatibility code and legacy tables only after all consumers have cut over.

No production table is dropped in the expansion phase.

