# Mentor Assignment from the Weekly Schedule

## Goal

Keep the fixed Friday schedule as the primary admin workflow while replacing slot dropdowns with a ranked, searchable mentor picker that uses startup needs and scheduling context.

## Approved workflow

The Overview → Schedule grid remains the canonical schedule. Each startup has two fixed Friday slots: 3:30–4:15 and 4:15–5:00. Clicking an empty or editable slot opens an assignment surface with the startup's primary/secondary Mentor Needs, context, and the selected date/time.

The assignment surface shows a scrollable ranked list of eligible mentors. Ranking uses exact primary-need matches first, then secondary/expertise matches, slot availability, recent meetings with the startup, current assignment load, and format fit. Admins can filter by expertise, search by mentor name, and switch to an internal startup-team substitute. The second slot excludes the first-slot mentor by default.

Assignments commit atomically, enforce semester and slot boundaries server-side, and record the actor, selected mentor, ranking context, and any override reason. Existing startup/session history remains visible in Schedule; the Members table shows semester tags only.

## Data and authorization

New scheduling behavior should use semester-scoped lifecycle identities (`semester_memberships`, `mentor_profiles`, `mentor_semesters`, `startup_semesters`, and availability data). The browser must not write assignment records directly. A server-authorized RPC or equivalent transaction must validate the target semester, active memberships, slot conflicts, and idempotency before creating or updating a session.

## Manual overrides

Admins may search for a specific mentor or assign a team substitute. Overrides for expertise, recent-match, availability, or capacity require a reason and are written to the assignment audit trail. Cross-semester or malformed assignments cannot be overridden.

## Non-goals

This phase does not change the Friday cadence, add automatic calendar invites, make an LLM authoritative, or remove the existing mentor directory. The ranking engine is deterministic; any future AI explanation is advisory only.

## Verification

Tests must cover ranking order, recent-meeting penalties, slot conflicts, second-slot exclusion, search/filter behavior, manual override requirements, semester authorization, idempotency, and atomic rollback. Browser QA must cover the weekly grid, picker, unavailable mentor state, substitute flow, and successful assignment.
