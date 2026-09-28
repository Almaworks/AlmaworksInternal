# Outreach email templates and scheduling

## Accepted scope
User requested premade outreach emails with optional scheduled sending, then explicitly asked to begin implementing the next phase. This architectural increment extends the existing outreach CRM. Existing Friday and independent booking changes remain intact. Semester Notion export is a separate following phase.

## Implementation design
Reuse the existing Resend provider with native scheduling (up to 30 days), avoiding a second scheduler and background credentials. Semester administrators are the existing outreach staff authority. Do not introduce a new auth role. Reusable semester templates plus supplied editable starter templates feed a single-contact composer. Contact recipients are resolved server-side from the selected semester opportunity; arbitrary recipient addresses are not accepted. Display recipient, subject, body, sender, schedule and timezone before the explicit send/schedule action. Editing a template never changes messages already submitted.

Store immutable message content/recipient/sender snapshots with semester and opportunity identity, creator, creation/attempt times, idempotency identity, provider ID and delivery status. All reads and commands use authenticated RLS. Reject new sends for archived contacts/opportunities, silenced opportunities and inactive semesters. Existing history remains visible to authorized semester admins. Provider-owned schedules continue independently once accepted; cancellation is explicit, including before administrative archival/suspension where appropriate. Do not imply local record changes automatically revoke a provider schedule.

Distinguish provider acceptance from delivery. Ambiguous network/provider outcomes must not produce blind duplicate sends. Retain stable idempotency across retries; refuse uncertain resubmission outside the provider's 24-hour dedupe window. Cancel only when provider confirms, refresh provider status on explicit action, and report uncertainty accurately. No background worker or webhook deployment is required for this increment; refresh is explicit. Missing sender/provider configuration disables sends honestly rather than claiming success.

Templates use plain text and a fixed supported placeholder set; render with safe substitutions and reject unknown placeholders. Support one recipient per command, no bulk automation or attachments. Admin can create/update/archive reusable templates and cancel scheduled emails; UI offers starter copy, preview, status history and retry/recheck affordances appropriate to state. Follow existing navy/sky outreach styling and accessible desktop/mobile layout.

## Constraints and validation
No remote operations, deployment, real sends, commit or push. Only allowed remote project is layjdjfvxkowxidwuvbs. Local tests use fake provider adapters. Preserve unrelated dirty work (96 entries at phase start). Deliverable migrations must be unchanged output from supabase db diff; types generated only. Root captured exact local pre-email schema bytes in work/outreach-email/pre-email-schema.sql before changes.

Test permissions/semester isolation, snapshots, validation/timezones, missing configuration, success versus accepted state, cancellation, duplicate requests, conflicting idempotency payloads, provider errors and ambiguous results. Run authenticated local database tests, application suite, build/source lint, migration replay and independent review, then fictional built-in Browser desktop/mobile interactions. Live provider delivery and real-account end-to-end testing remain release checks.

## Sources
- Existing provider: app/api/admin/notify/route.ts.
- https://resend.com/docs/dashboard/emails/schedule-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/api-reference/emails/retrieve-email
- https://resend.com/docs/api-reference/emails/cancel-email

## Provider receipt integrity
Ruling after independent design review: use a server-only signing key to sign immutable message snapshots and provider receipts, binding record IDs, semester, snapshot digest and version. The API verifies these signatures before provider operations and before reporting delivery status. Signature material is never returned to browsers. SQL RLS remains the access boundary and guards snapshot immutability. The database does not possess the signing key: an authorized admin may damage its own receipt row through direct API access, but cannot forge a provider-trusted receipt in the application. This is not a claim of database-verifiable or tamper-proof email delivery. Retain verification keys during rotation so outstanding schedules remain manageable.
