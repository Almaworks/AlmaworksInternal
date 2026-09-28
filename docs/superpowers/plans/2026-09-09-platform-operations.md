# Almaworks platform and operations completion checklist

User source: meeting notes supplied in this conversation on local 2026-09-08, with explicit discretion to keep iterating and use cost-aware supervisor/specialist execution. This expands the ongoing outreach email task; it does not cancel it. No goal token budget was requested. Active goal tracks the complete list.

## Acceptance and status

| Item | Acceptance evidence required | Current state |
| --- | --- | --- |
| Mentor dashboard / all startups | Authorized mentor can browse all active cohort startup companies and associated visible people; no private notes leakage | Prior implementation exists; fresh audit assigned |
| Startup dashboard | Relevant mentor discovery, Friday groups, independent bookings and next actions work | Prior implementation exists; fresh audit assigned |
| Admin View as | Admin can choose supported participant preview, exit it, and avoid changing identity or participant data | Confirmed mobile selector omission fixed; 7/7 focused tests. Desktop transition helpers pass; actual authenticated browser verification still pending. |
| Semesters only for Super Admin | Regular admins see no Semesters module/navigation and cannot call lifecycle APIs; Super Admin retains access | Source audit confirms regular-admin navigation omission and Super Admin route/API gates; focused regression retained. Authenticated browser verification pending. |
| Zoom / Google Meet breakout access | Mentor/startup dashboards provide correct authenticated meeting links; automate provider operations only where supported and configured; distinguish a join link from real breakout-room automation | Needs capability research and implementation |
| Automated notifications via Resend | Real queued/provider delivery flow and truthful status; automated triggers use appropriate role/semester scope | Outreach templates/native Resend scheduling implemented and independently reviewed locally; general notifications, activity/cadence and newsletters remain. |
| Startup/member/mentor photos | Upload, replace/remove, display and access work for all requested identities; generated deployable migration | Mentor/startup person photos exist. Confirmed gaps: pure-admin personal photo eligibility/UI and startup company-logo upload. Existing photo migration is being regenerated; no release yet. |
| Weekly mentor availability | Publish availability by actual dates/week; startup requests require mentor acceptance | Independent booking implemented locally; verify usability and weekly grouping |
| Newsletters in notifications | Staff can compose/preview a newsletter and explicitly send/schedule to authorized selected recipients with delivery history | Not implemented |
| Session Q&A | Participants can submit and view appropriately scoped session questions; admin/mentor response workflow clear | Not implemented |
| Friday format | 15m startup standup +45m speaker +30m Eric/Les +30m swap; weekly saved random groups visible to all roles | Implemented locally; earlier independent review pending |
| Two meetings outside Fridays | Show each startup its outside-Friday meeting target/progress, based on accepted bookings, with clear period | New requirement; default to two per program week as an adjustable program target, not an enforced booking limit |
| Timeful / integrated availability | Workable availability integration consistent with prior user allowance for an integrated scheduler; avoid fabricated external API support | Native integrated booking exists; external capability check pending |
| Notion session notes | Session notes have durable semester/session scope and usable Notion export/integration | Not implemented |
| Export Outreach | Full authorized semester outreach data can be exported including contacts, opportunities, activities/templates/delivery records | API/catalog/ZIP and admin UI implemented in progress; specialist review resolving completeness/pagination; fictional desktop/mobile UI passed. |
| Semester-wide Notion tracking/export | Comprehensive authorized semester bundle/import or configured Notion sync; include new workflow records and clear omissions | Export implementation in progress, with CSV/Markdown/JSON archive and explicit omissions; new workflow records must be added in subsequent phases. |
| Reduce friction | Clear role navigation/next actions, useful defaults, plain-language labels, working mobile and error states across changed flows | Continuous review, not a one-time cosmetic checkbox |

## Execution sequence

1. Finish existing outreach email feature, resolve provider retry/concurrency review, validate generated migration and UI.
2. Fix View as and verify role dashboards and Super Admin module boundary.
3. Consolidate photos, weekly availability and two-meeting progress, session Q&A/notes.
4. Extend verified email delivery to notifications/newsletters and authorized automatic triggers.
5. Implement Outreach and semester Notion exports; add configured direct integration where the connected account and destination are verifiable.
6. Research video provider capabilities, implement supported meeting links/room management with truthful fallback for unavailable automation.
7. Final integrated review, application/database/build checks and Browser walkthrough. Report any actual external-account/configuration/release dependencies explicitly.

## Standing boundaries and routing

Preserve the shared dirty tree and project location. No blanket commits or release operations. Only Supabase project layjdjfvxkowxidwuvbs is allowed remotely; verify before each operation. Never test by sending real emails without explicit test-recipient authorization. Generated migrations only; no RLS bypass. Use existing user-requested localhost service; register any task-owned temporary service before starting and stop only that service afterward.

Use current cost-aware-model-router skill: coordinator owns integration/verification; Terra/medium for bounded ordinary UI/code work, Sol/medium-high for authorization, data integrity, delivery and independent high-risk review, Luna for mechanical work when a fresh worker slot is available and worthwhile. Current actual workers retain Sol/high backend, Sol/medium reviewer, Terra/medium dashboard audit. A requested new Sol/medium UI finisher could not start because of the agent-thread limit; coordinator took that scoped work rather than claiming an unperformed model switch.
