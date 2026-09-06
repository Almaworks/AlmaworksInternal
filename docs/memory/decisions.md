---
title: Project Decisions
status: active
updated: 2026-09-06
---

# Decisions

## 2026-09-06 — Use repository Markdown for project memory

- Status: confirmed. Source: initial memory setup, 2026-09-06.
- Decision: Keep durable session memory in this repository under `docs/memory/`.
- Rationale: Markdown is reviewable, versionable, portable, and visible alongside the project documentation without introducing runtime state, hooks, or external services.
- Scope: This records project context only; it does not replace product or architecture decisions.
- Follow-up: Defer system architecture to the existing notes in [[architecture]] and [[adr/005-reusable-identities-and-semester-memberships]].

## 2026-09-06 — Admin-assigned sessions use RSVP coverage

- Status: confirmed. Source: product direction from the project owner, 2026-09-06; implementation in `src/sessions/attendance.ts`.
- Decision: Admin assignment creates the authoritative confirmed session. Mentor and startup participants RSVP; startup availability is covered by any attending team member and unavailable only when every team member cannot attend.
- Resolution: a mentor who cannot attend while startup coverage exists requires mentor replacement. A present mentor with an unavailable startup requires a fill-in or an admin-marked absence. Pending RSVPs do not imply cancellation.
- Scope: legacy mentor request confirmation/decline is retired in favor of the participant Sessions RSVP view. The persisted RSVP value remains `not_attending` while product copy says “Can’t attend.”

## 2026-09-06-active-cohort-network

- Status: confirmed product direction from the user, 2026-09-06.
- Participant Network uses active mentor and startup memberships in the current cohort; a global mentor profile or historical participation does not establish eligibility. Startup viewers also see cohort startup peers as individual people.
- Network cards display stored email and available LinkedIn/website links. Source: `app/api/participant-dashboard/route.ts`, `src/dashboard/participant-network.ts`, and `app/dashboard/participant/ParticipantDashboard.tsx`.
- This supersedes older cross-semester mentor-directory descriptions for participant Network. Historical session access remains separate from network discovery.

## 2026-09-06-concrete-session-formats

- Confirmed user-approved behavior: Either means the mentor accepts Online or In Person; a meeting itself must choose one concrete format.
- Incompatible mentors are hidden; Either and exact-format mentors are equally compatible. Slot preferences take precedence over the semester-level preference.
- Source: src/assignments/server.ts, src/assignments/ranking.ts, src/sessions/meeting-format.ts, and docs/runbooks/mentor-assignment-schedule.md. Historical hybrid session values remain readable and require explicit choice when edited.

## 2026-09-06-super-admin-semesters

- Confirmed user decision: only platform Super Admins may view the Semesters module, create drafts, replace draft calendars, or activate semester transitions. Regular admins retain operational scheduling and membership access.
- Super Admin is a distinct platform badge, separate from semester role; cohort admins may read that badge for members in managed semesters, without grant/revoke privileges.
- Sources: `docs/architecture/identity-membership.md`, `src/auth/admin-route.ts`, and migration `20260906224257_restrict_semester_lifecycle_to_super_admin.sql` (deployed and verified).

## Concurrent task notes

When adding a decision for concurrent work, use the task ID in the heading, update only that task's section, and reread this file immediately before writing.
