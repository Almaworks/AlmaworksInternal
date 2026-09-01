# Startup Mentor Needs and Session RSVP

**Status:** Approved product direction; awaiting written-spec review
**Date:** 2026-09-01

## Goal

Give startups a durable, easy-to-find place to maintain semester-specific Mentor Needs, show participants every upcoming and past session, and collect a separate RSVP from the assigned mentor and each startup team member. Admins should be able to see expected attendance before a session without treating a missing response as a decline.

## Chosen experience

The startup home page gets a compact Mentor Needs summary card showing the primary need, optional secondary need, and an incomplete-state prompt. Its **Edit needs** action opens a dedicated **Mentor Needs** module in the startup dashboard. The module reuses the existing structured form and API for primary need, secondary need, no-preference, and context. Mentor Needs remain scoped to the active semester.

The home page continues to emphasize the next session but also shows the next few upcoming sessions and a **View all sessions** action. The existing Sessions module becomes the complete chronological source for upcoming and past sessions rather than exposing only the nearest upcoming session.

Every upcoming session displays the signed-in participant's RSVP as one of:

- **Attending**
- **Not attending**
- **No response** (derived when no RSVP row exists)

Participants may change their response until the session begins. After that cutoff, the response and its last-update time are read-only. Past sessions remain visible but cannot be changed.

## Alternatives considered

1. **Hybrid summary plus dedicated modules — chosen.** Mentor Needs stay visible on Home without turning Home into a long form, while Sessions remains the natural place for attendance history and RSVP management.
2. **Put the complete Mentor Needs and RSVP interfaces on Home.** This is initially discoverable but makes the dashboard crowded and scales poorly as the semester accumulates sessions.
3. **Create one combined Participation module.** This groups semester tasks but makes Mentor Needs and session attendance less predictable to find.

## RSVP data model

Add a program-scoped `session_rsvps` table with:

- `id uuid primary key`
- `semester_id uuid not null references semesters(id)`
- `session_id uuid not null references sessions(id)`
- `semester_membership_id uuid not null references semester_memberships(id)`
- `response text not null` constrained to `attending` or `not_attending`
- `responded_at timestamptz not null`
- `updated_at timestamptz not null`
- a unique constraint on `(session_id, semester_membership_id)`

The table stores affirmative responses only; **No response** is the absence of a row. Database constraints or an authorized database function must verify that the RSVP semester matches both referenced records and that the membership is eligible for that exact session:

- the assigned mentor's `mentor_semesters.semester_membership_id`, or
- a startup membership connected to the session's `startup_semester_id` through `startup_team_memberships`.

The session start instant is derived from its meeting date and numeric slot start time using the semester's configured timezone, with `America/New_York` as the documented fallback. Writes at or after that instant are rejected server-side and by the database authorization boundary.

## Authorization and visibility

Row Level Security remains authoritative. The browser never receives a service-role credential and no route bypasses RLS.

- A participant may insert or update only the RSVP tied to their own active/onboarding semester membership.
- Startup members may read responses and participant names for teammates assigned to their startup's session, plus the assigned mentor's response.
- The assigned mentor may read the startup attendee list for that session.
- An authorized semester admin may read all responses, names, counts, and update times for sessions they manage.
- Participants unrelated to the session cannot read or write its RSVP rows.
- Participants cannot change the referenced session, semester, or membership when updating a response.

The write path uses an authenticated, semester-scoped API/RPC contract that accepts only `sessionId` and `response`. It resolves the caller's canonical profile and eligible membership server-side, performs an idempotent upsert, and returns the canonical response. A missing response is not silently converted into `not_attending`.

## Participant interface

### Startup

- Home: Mentor Needs summary, next few upcoming sessions, per-session RSVP control, and links to the full modules.
- Mentor Needs: complete structured semester form using the existing `MentorNeedsForm` behavior.
- Sessions: all upcoming sessions followed by past sessions; each upcoming row exposes the caller's RSVP and aggregate counts permitted by the visibility model.

### Mentor

- Home and Sessions: the same RSVP control for the assigned mentor.
- Session details: startup attendee names and response states, without exposing unrelated memberships.

The View As preview uses fictional RSVP and attendee data. Preview actions update only local demo state and never call the RSVP API.

## Admin interface

Each session in the admin schedule displays counts for attending, not attending, and no response. Opening attendance details shows participant names, roles, current responses, and last-update times. Existing `sessions.startup_absent` remains a post-session operational fact and is not used as a substitute for pre-session RSVP data.

## Loading and error behavior

RSVP changes use an optimistic control only after the request has been accepted for submission. While saving, that session's control is disabled. A rejected cutoff, authorization failure, or network error restores the prior response and shows an inline message. Failure to load RSVP data does not hide the underlying session; the session remains visible with an attendance-unavailable message.

Mentor Needs retains its existing load/save messaging. The Home summary links to the full form if the record is missing or cannot be loaded.

## Migration and delivery

Schema changes follow the repository workflow: modify the local database, generate the migration with `supabase db diff`, regenerate `src/db/types.ts`, and verify migration safety. The new table must include non-null `semester_id`, explicit grants, RLS, ownership predicates, and tests proving cross-startup and cross-semester isolation.

Delivery order:

1. Add and verify the RSVP schema, constraints, RLS, and generated types.
2. Add the participant RSVP repository/API and domain projection.
3. Mount the Mentor Needs module and Home summary.
4. Expand participant Home and Sessions views with RSVP controls and attendee visibility.
5. Add admin attendance counts and detail view.
6. Add fictional RSVP behavior to Admin View As previews.

## Verification

Automated coverage must include:

- Mentor Needs load/save access for an eligible startup and denial for unrelated profiles.
- RSVP eligibility for the assigned mentor and every startup team member.
- denial across sessions, startups, and semesters.
- idempotent response changes and independent responses from multiple team members.
- `No response` counts derived from eligible memberships without creating rows.
- write rejection at and after session start.
- participant projections for multiple upcoming and past sessions.
- admin totals and participant-visible attendee lists.
- preview mode performing no persistent writes.

Browser QA must cover desktop and narrow layouts for Startup Home, Mentor Needs, Sessions, RSVP save/error/locked states, mentor attendee visibility, and admin attendance details.

## Non-goals

This phase does not send calendar invitations, email or SMS RSVP reminders, allow guests outside active semester memberships, replace post-session absence tracking, or infer attendance from calendar providers.
