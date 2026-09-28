# Startup calendar booking UX

## Goal

Replace the startup appointment-tile wall with a time-first weekly calendar. A startup selects a time, picks from mentors available at that time, writes a topic, and submits the existing booking request.

## Interaction

- Show the next seven local calendar days in the semester timezone, with 15-minute selectable availability cells and a compact hourly grid.
- A cell is selectable when one or more mentors are free. Selecting it opens a modal containing only the mentors free in that exact 15-minute interval.
- Rank modal mentors by the count of case-insensitive matches between the startup's saved `mentorship_needs` and each mentor's `expertise_tags`; preserve name order for ties. Show a concise matching explanation only when there is a match.
- A mentor-name search above the calendar preserves all availability but makes that mentor's cells visually prominent. Clearing it restores the neutral presentation.
- The modal contains a name search, mentor selection, topic field, submit action, Escape/close/backdrop handling, focus return, and request failure feedback. Existing database/RLS validation remains authoritative.

## Data and scope

The booking workspace response adds the startup's needs and mentor expertise tags needed for deterministic display ranking. The server loads them through the existing RLS client and exposes only data already appropriate for a participating startup's booking view. This is an application projection change only: no schema, migration, or remote operation is required.

## Validation

Unit-test time-cell aggregation, week bounds, highlighting, availability filtering, and ranking. Add a source-level UI contract for calendar/search/dialog/request wiring, then run focused booking tests, lint, typecheck where possible, and authenticated desktop/narrow browser QA when a Browser surface is available.
