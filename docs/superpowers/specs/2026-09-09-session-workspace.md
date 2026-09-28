# Session questions, notes and meeting access

## User scope

The expanded operations checklist asks for session Q&A, durable Notion notes, and video access from mentor/startup dashboards. This increment gives each existing Friday meeting, independent accepted booking, and legacy session a shared workspace. It preserves the already accepted Friday format and mentor-acceptance rule.

## Design to implement

Use one semester-scoped context table with exactly one same-semester foreign key to a Friday meeting, independent booking request, or legacy session. Resolve authorization from that source record. Friday context reads are cohort-visible; independent/legacy context reads are limited to their participants and authorized semester admins. Never use the broad Friday rule for a booking context. Questions, responses and notes inherit context visibility through RLS and immutable context/author identities. No service-role bypass.

Participants can submit a question and edit their own unanswered question. Assigned mentors and semester admins can answer. Shared notes are clearly labelled as visible to session participants (or the cohort for Friday meetings); omit a misleading private-note toggle in this increment. Admins can manage inappropriate questions with an explicit archived state, preserving history for authorized export. Store author and edit timestamps. Concurrent edits use expected updated-at checks. Read-only historical contexts remain exportable after a semester closes; new writes require current eligible membership/session state.

Show a single Questions & notes entry from Friday/booking/session views. The workspace shows its title, date, audience and current meeting link, then questions and shared notes. Include meaningful empty/error/pending states and a fictional desktop/mobile preview. Add the data to the semester export catalog with the same RLS boundaries; exports must include saved shared notes and question answers.

Meeting links must be validated HTTPS Zoom/Google Meet URLs, without credentials. Independent meeting participants see their accepted booking link; Friday groups see the correct Les/Eric link for each rotation. Admins manage Friday room links; assigned mentors manage their accepted booking link. Do not imply that saving links creates provider breakout rooms. Provider-created links require separately configured OAuth/provider credentials; investigate supported APIs before adding automatic creation. A visible fallback for missing links should explain who can add one.

## Validation

Test cross-semester/source-reference mismatches, unrelated participant reads/writes, withdrawn/cancelled booking writes, author/context forgery, answer authority, concurrent updates and URL validation at both API and database boundaries. Generate migrations with db diff and replay them unchanged. Export tests must include questions/answers/notes and exclude private data from unrelated contexts. Browser QA verifies narrow/mobile layouts and role actions using fictional records; authenticated provider/account checks remain distinct.
