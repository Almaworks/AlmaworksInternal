# Availability calendar release latency — 2026-09-15

User confirms the local freeze is resolved. Isolated production release build passes; hosted authenticated browser QA pending. No deployment or remote database operation.

## Cause and fix

`PerDayCalendar` paints cells directly during a drag and flushes the selection into workspace state on pointer release. The workspace then synchronously ran `buildCalendarSelectionBatch` in a memo depending on that selection. This expanded recurring quarter-hour blocks into dated windows for the full semester, despite the batch publisher and preview no longer being rendered. Each endpoint conversion scanned 57 timezone offset candidates, repeatedly constructing `Intl.DateTimeFormat` objects. This was CPU work on the frontend render path, not an awaited save request.

Removed the unused preview computation, publisher handler, retired publisher/planner components, and their state. Selection still flushes on release; the explicit Save weekly availability action still converts selections into recurring weekday ranges and submits `replace_weekly_availability`. Calendar styling, reservations, accepted-meeting overlays, APIs, and database permissions were not changed.

## Measured evidence

Run `node --experimental-strip-types outputs/availability-release-benchmark.mjs` to reproduce the old expansion independently. Synthetic fixture: seven days, 9–10 AM, September 1–December 31, 2026, America/New_York, no existing windows.

- Old unused computation: **14,943.5862 ms**, 488 dated windows, **56,623 formatter constructions**.
- Remaining selection snapshot: **0.0653933 ms mean**, 1,000 iterations.
- These are Node CPU measurements, not browser input-to-paint measurements or a guarantee of end-to-end latency.

## Automated verification

- PASS: regression test executes the real workspace and real selection utilities with a controlled React lifecycle. Consecutive add/remove/clear state updates retain their selections and avoid semester expansion. The formatter-budget assertion failed before the fix and passes after it. Editing makes no API request.
- Booking/UI suite: **78/78 PASS** in both shared workspace and isolated release copy. Updated the stale navigation assertion to check each participant role supports either its shared or role-dashboard booking destination; no layout changes included.
- Historical whole-workspace TypeScript check: FAIL with six diagnostics outside changed files: startup-profile HTTP status typing, admin module union typing, two availability-overview fixtures, two profile-photo Buffer/Blob fixtures. No diagnostic in the changed component or regression test.
- Scoped diff whitespace check: PASS.
- Scoped ESLint: PASS, exit 0, no errors/warnings. Final regression/painter/hydration slice: PASS 7/7.

## Browser QA scenarios

| Scenario | Status | Evidence / next step |
| --- | --- | --- |
| Consecutive drag/select/unselect, including rapid release and re-drag | BLOCKED | Browser inventory returned `apps: [], browsers: []`; measure input-to-paint with a real mentor session on the local changed build. |
| Explicit save, reload, and persistence | BLOCKED | No authenticated browser/fixture available. Use a designated disposable mentor fixture. |
| Error handling and role/permission boundaries | BLOCKED | Requires real mentor/startup sessions and authorized fixtures. |
| Desktop and narrow viewport layout | BLOCKED | No browser surface. |

Follow `docs/runbooks/authenticated-qa.md`, verify the allowlisted project and hosted schema before authenticated QA, and record build identity, role, fixture semester, and sanitized observations. Deployment requires separate release authorization.

Engineering bootstrap refused the existing `.engineering` directory without its installer manifest. TEAM.md and SESSION.md are absent; no overwrite attempted. Implementation stayed in the current coordinator. An independent Sol/medium reviewer found no blocking issues; no coordinator model switch occurred.

## Release verification and cleanup

Exported the committed HEAD to a temporary project-local copy, overlaid only the changed component and two tests, reused installed dependencies through a junction, and passed environment variables through a child process without copying credentials. `next build` completed successfully: compilation, TypeScript, page-data collection, and 79/79 static pages. The isolated booking/UI suite passed 78/78. This establishes production build compatibility of the scoped source changes, not hosted authenticated behavior. No new environment variables, API changes, or migration are needed.

The full dirty-worktree production bundle also compiled successfully, then failed at the unrelated uncommitted startup-profile 404 status typing. Those edits were preserved. Full source lint passes with 0 errors and 2 existing unrelated image warnings using `npm run lint -- --ignore-pattern '.tmp/**' --ignore-pattern 'work/**' --ignore-pattern 'outputs/**'`; default lint included a pre-existing binary generated artifact. Scoped lint has no errors/warnings.

Restored only task-generated tsconfig changes after comparison with its unchanged pre-task version. Removed temporary verification build copies after tests; retained logs under work. The benchmark is a finished reproducible artifact under outputs. No background services started by this task. User authorized commit; no push or deployment performed.
