# Participant Session Cutover Design

## Status

Approved in conversation on 2026-09-10.

## Goal

Replace the participant-facing legacy mentorship-session and RSVP experience with the independent availability and booking workspace, while retaining the Friday Program as a separate participant module.

## Scope

### Participant dashboard

- Add an **Availability** destination for mentors and a **Bookings** destination for startups. Both render the existing `MentorBookingWorkspace` for the active semester.
- Add a **Friday Program** destination that renders the existing `FridayProgramPanel`.
- Remove the `Sessions` destination, its session cards, RSVP controls, session-history sections, and session-derived notifications from the participant dashboard.
- Update the home dashboard to direct a mentor to Availability and a startup to Bookings instead of displaying legacy session cards.

### Participant dashboard contract

- Remove the `sessions` field and all session-derived view types from the participant dashboard domain model, server snapshot, and API response.
- Remove the participant dashboard API's `sessions` and meeting-slot queries, attendee lookup, and RSVP projection.
- Retain participant notification read persistence for activation notifications. Notifications no longer have a `session` kind or a `sessions` destination.

### Explicitly retained

- The Friday Program and its standups, speaker session, company groups, and participant group visibility.
- The independent `mentor_booking_windows` and booking-request workflow, including mentor publication, startup requests, mentor response, and administrator read-only access.
- Stored legacy `sessions`, RSVP records, and administrator/history views. No database table, historical row, migration, remote data, or admin route is deleted in this cutover.

## Architecture

`ParticipantDashboard` becomes the participant navigation shell for four distinct concerns: Home, Availability/Bookings, Friday Program, and account/network features. The availability module is the existing independent booking workspace; it continues to fetch its own scoped data from `/api/mentor-booking`. The Friday Program remains independently loaded by `/api/friday-program` and has no dependency on historical mentorship sessions.

The participant dashboard API becomes a profile, active-membership, network, startup-directory, and activation-notification endpoint. It no longer reads `sessions`, `meetings` for mentorship slot resolution, or RSVP data. Existing administrator and history services remain outside this contract.

## Error Handling

- `MentorBookingWorkspace` retains its existing loading, semester-scope mismatch, and booking-operation errors.
- `FridayProgramPanel` retains its existing loading, empty-program, and retry states.
- Participant dashboard loading and activation-notification read failures retain their existing error handling.

## Validation

- Domain tests prove a dashboard no longer accepts or emits session data or session notifications.
- API loader tests prove the participant dashboard route no longer queries legacy sessions or RSVP-related data.
- UI-source tests prove Availability/Bookings and Friday Program destinations are present, and the legacy Sessions/RSVP surface is absent.
- Run the focused dashboard and mentor-booking tests, then the linter and TypeScript check.

## Non-goals

- No provider-calendar integration, recurring availability storage, email, invitations, or external scheduling sync.
- No change to Friday Program data, generation, or group-assignment behavior.
- No destructive schema or remote operation.
