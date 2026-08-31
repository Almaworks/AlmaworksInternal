---
title: Mentor Assignment Schedule Operations
status: active
updated: 2026-08-31
---

# Mentor assignment schedule operations

## Entry points and scope

Administrators can open the weekly assignment workspace from the dashboard **Schedule** navigation item, the **Schedule** tab on Overview, or **Assign mentors** in the Mentor Directory. All three entry points use `/dashboard/admin/schedule` and the same schedule component and client state.

The Mentor Directory entry is shown only to administrators. Startup users keep the existing **Request session** workflow; the assignment picker does not replace or alter startup requests.

Before scheduling, confirm that the intended semester is active and its Friday session dates are correct. The workspace reads the active semester and does not make cross-semester assignments.

## Assign a mentor to an empty startup slot

1. Open **Schedule** and locate the startup, Friday, and time slot.
2. Select an empty, linked startup cell. The assignment drawer shows the canonical organization, primary and secondary Mentor Needs, preferred expertise, selected date and slot, topic, and meeting format.
3. Review ranked candidates. Search by mentor name or filter by expertise without changing the server-provided rank order. Changing the meeting format reloads ranking, availability, capacity, and conflict context for that format.
4. Review every availability, capacity, expertise, format, recency, and conflict explanation. A mentor already occupying the selected slot is a hard conflict and cannot be selected. The second slot also respects the API's selected-startup exclusion metadata.
5. For a candidate that requires an override, explicitly acknowledge the override and enter a specific operational reason. The assignment cannot be submitted until all required override types are acknowledged with a non-empty reason.
6. Add or confirm the topic and supported format, then submit once. The browser commits only through the atomic assignment API; it must not insert sessions directly or invoke the database RPC.
7. Confirm the success feedback and the refreshed occupied cell before moving to another assignment.

## Override audit expectations

Overrides are exceptions, not a way around hard conflicts. The commit records the exact override types required by the candidate response, the operator's non-empty reason, and ranking context including rank, score, reasons, explanations, ranking eligibility, search, and expertise filter. The server also owns actor identity and semester authorization.

Use a reason that explains the verified exception, for example who confirmed alternate availability or why an approved capacity exception is safe. Do not enter generic text such as “approved.” Review override records during schedule QA and investigate mismatches between the recorded context and the final session.

## Canonical, unlinked, and historical columns

Active `startup_semesters` are the canonical schedule columns. Their organization name is the displayed startup identity. An active startup team membership/profile may provide the explicit compatibility bridge to an active legacy startup in the same semester.

- **Linked canonical column:** empty cells can open the enriched assignment picker.
- **Unlinked canonical column:** remains visible but disabled. Link an active startup team member/profile to a same-semester active legacy startup before assigning; do not silently omit the organization or create a browser-side workaround.
- **Historical-only column:** preserves an occupied legacy session that is not represented by the current canonical cohort. It is display/compatibility context and cannot create a new enriched assignment.

Resolve unlinked columns as roster/data operations before scheduling. Never substitute a similarly named legacy startup as an inferred bridge.

## Retry and refresh handling

Each click of **Assign** starts a new submit attempt and the current client creates a fresh idempotency UUID for it. The client does not retain that key for a later manual resubmit and does not automatically replay an ambiguous transport failure. If the browser loses the response or the network outcome is unclear, do not immediately click **Assign** again: first refresh or verify the slot through an authorized server/admin surface. Resubmit only after confirming that no assignment was committed; that manual resubmit will use a new key. Any changed mentor, slot, format, topic, override set, reason, or ranking context is also a new payload and must use a new key.

After a successful commit, the UI reloads schedule data. If that refresh fails, the assignment remains saved and the current schedule stays on screen. The UI reports **assignment saved, refresh failed** rather than claiming the grid is current. Use the provided refresh action before making a potentially conflicting follow-up assignment. If refresh continues to fail, verify the session through an authorized server/admin surface and investigate the read error; do not resubmit the assignment as a repair.

Stable API validation, authorization, stale mapping, occupied-slot, and idempotency errors appear inline in the drawer. Correct the indicated data or selection and submit a new attempt.

## Compatibility boundaries

The enriched picker owns empty, startup-bound cells only. It never replaces an existing session because the approved atomic API has no replace/update transaction.

- Selecting an **occupied cell** continues to open the legacy edit surface. Treat this as compatibility editing, not a ranked reassignment. Do not route an occupied-cell replacement around the atomic API.
- **Add substitute session** remains the clearly labeled compatibility workflow for a startup-absent or internal free-text substitute, because no real `startupSemesterId` exists for the atomic assignment API.
- New startup-bound assignments must use the enriched picker. Do not insert into `sessions` or call an RPC directly from the browser to bypass eligibility, conflict, override, or idempotency checks.

## Operational QA checklist

Before publishing a weekly schedule, exercise one representative state for: empty linked cell, ranked filters, format reload, second-slot exclusion, unavailable/override candidate, hard conflict, unlinked canonical column, historical occupied column, substitute workflow, successful commit, ambiguous-response verification, idempotency error handling, and saved-but-refresh-failed recovery. Check the drawer and schedule at desktop and narrow viewport widths, including keyboard focus, Escape/overlay close, return focus, and disabled-control semantics.

Local and remote verification must target only Supabase project `layjdjfvxkowxidwuvbs`. Do not apply migrations or perform remote operations unless the target is independently verified and the operation is separately authorized.
