# Friday program and weekly startup groups

## Approved product direction

Source: project-owner conversation on 2026-09-08; implementation explicitly requested after the outline and weekly grouping refinement.

Friday programming lasts 120 minutes: 15 minutes of startup standups, 45 minutes with a speaker, 30 minutes with Group A meeting Les and Group B meeting Eric Chan, then 30 minutes with the groups swapping. Randomize startup companies into two balanced groups independently for each meeting. Mentors, startups, and admins can view the saved assignments for their semester.

## First implementation increment

Store a Friday program alongside an existing semester meeting, without rewriting historical sessions. Store the company's semester identifier with each assignment. Generation is an explicit semester-admin action and persists its result atomically; repeated requests return the existing assignment, and page reads never generate or reshuffle it. An odd roster produces groups whose sizes differ by one. Empty eligible rosters produce an actionable error, not a misleading published program. Eligibility uses existing active startup membership conventions.

Show the agenda and both groups to authorized semester participants and admins. Provide clear unpublished, loading, failure, and empty states. Keep a startup's members together. Display times relative to the meeting start unless an authoritative start time exists. Les and Eric Chan are agenda facilitator labels, not inferred account identities or new authorization grants.

Program and assignment records must carry non-null semester foreign keys. Use existing RLS authorization patterns for semester reads and admin generation. A generation transaction must prevent concurrent duplicate or partial publication. Participant reads must not expose other semesters. Use stable records suitable for later semester export.

## Scope boundaries

This increment does not send emails or calendar invitations, deploy remotely, or replace historical booking/attendance behavior. Existing pending user changes must remain intact. No bulk generation, automatic rebalancing after roster edits, or regeneration is introduced without a separate product rule.

The larger accepted direction remains: independent mentor meetings requested by startups require mentor acceptance; Outreach must support premade emails and scheduled sending; semester information must be easily exportable to Notion. Those are subsequent increments. Scheduling provider, sender configuration, and Notion destination are still open.

## Acceptance checks

- Exactly one assignment per eligible startup company and balanced groups for even/odd rosters.
- Independent weekly generation, saved assignments stable across reads/retries.
- Atomic generation; cross-semester references and unauthorized generation rejected.
- Mentor/startup/admin reads permitted only within authorized scope.
- UI shows 15/45/30/30 agenda and the correct swapped facilitator order.
- Admin can generate; participants can view; previews perform no real writes.
- Existing sessions remain readable; schema absence produces a useful failure.
- Generated migration reviewed and tested locally; desktop/mobile visual verification attempted through the built-in Browser.
