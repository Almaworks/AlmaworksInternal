# ADR 004 — Semester anchor pattern

**Date:** [fill in]
**Status:** Accepted

## Problem
Almaworks runs a new cohort every semester. Previously all data was wiped between semesters.
We need to preserve historical data (for mentor directory cross-semester search) while keeping
each semester's operations clearly separated.

## Decision
Every table that contains semester-specific data has a `semester_id uuid references semesters(id)`.
The `semesters` table has an `is_active boolean` column — exactly one semester is active at a time.

## Rules
- When querying "current" data, always filter by `semesters.is_active = true`
- When querying the mentor directory, allow filtering by any semester or "all time"
- When starting a new semester: insert a new row in `semesters`, set `is_active = true`,
  set the previous semester's `is_active = false`
- Do NOT delete old data — historical records are valuable for the mentor directory and AI gap analysis

## Tables with semester_id

Semester-scoped program tables are `semester_memberships`, `invitations`, `mentor_semesters`,
`startup_semesters`, `startup_team_memberships`, `meetings`, `meeting_availability`, `sessions`,
`program_audit_events`, `outreach_opportunities`, `outreach_activities`, and `outreach_imports`.
Global identity and durable-record exceptions are documented in
`docs/architecture/identity-membership.md`.

## Consequences
- Mentor directory can show mentors from previous semesters — startups can discover anyone
- AI gap analysis can compare current cohort needs against all historical mentor expertise
- Admin can switch semesters cleanly without data loss
- Every new table added to the schema must include semester_id
