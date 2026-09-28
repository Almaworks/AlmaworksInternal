# Outreach email rollout and operation

This runbook describes the local outreach-email increment. It is not a record of deployment. Product scope: `docs/superpowers/specs/2026-09-08-outreach-email.md`; implementation and verification ledger: `docs/superpowers/plans/2026-09-08-outreach-email.md`.

## Configuration

Use the existing Resend account and a verified sender domain. Configure server-only environment variables in the application host:

- `RESEND_API_KEY`: a key allowed to send, retrieve and cancel email records. A send-only key cannot support all history actions.
- `OUTREACH_EMAIL_FROM_EMAIL`: the verified sender address/display name for outreach. If omitted, the existing `NOTIFY_FROM_EMAIL` setting is used. There is no invented fallback sender.
- `OUTREACH_EMAIL_SIGNING_KEY_ID`: a stable non-secret identifier for the current signing key.
- `OUTREACH_EMAIL_SIGNING_KEY`: a separately generated cryptographically random secret, at least 32 random bytes. Keep it server-only, outside repository files and browser environment variables.
- `OUTREACH_EMAIL_PREVIOUS_SIGNING_KEYS`: optional JSON object mapping prior key identifiers to their original secrets during rotation. Retain keys needed to verify existing snapshots and outstanding scheduled emails. Do not change a key's secret while keeping its identifier.

Configure secrets through the hosting platform; do not paste them into project memory, logs or conversation notes. Sending remains unavailable until the required configuration exists. Local automated tests use injected fictional providers and never submit live mail.

## User flow

Open Outreach and select a semester. Use Email templates and delivery to maintain reusable plain-text templates and inspect semester history. Open a contact's workspace to compose one email. Verify recipient, sender, subject and body before choosing the explicit send or schedule action. Scheduling supports future instants up to 30 days ahead; the date field uses the browser's timezone and the summary shows the chosen instant.

Provider acceptance is not delivery confirmation. Use Recheck to retrieve the latest provider result. An unknown submission result retains its original delivery identity; Retry safely uses its unchanged saved snapshot within the supported dedupe period. After that period, reconcile with the provider before any new send. Never create a new message solely to work around an unknown result.

Scheduled emails are owned by Resend after acceptance. Archiving/silencing a contact or changing a semester does not cancel a provider schedule. Cancel outstanding emails explicitly when plans change; do not assume cancellation succeeded until the provider confirms it. Recheck uncertain cancellation outcomes.

## Rollout checks

1. Review the final generated migrations and their complete prerequisite chain, including separately pending Friday/booking changes. Never deploy `work/` snapshots, scratch baselines or rejected diffs.
2. Apply database and application changes only through an explicitly authorized rollout to Supabase project `layjdjfvxkowxidwuvbs` and the associated frontend host.
3. Configure the server settings above and verify real authenticated staff/participant access. Confirm that staff can use only their authorized semesters and that mentors/startups cannot access outreach email records.
4. With separate authorization and a designated test recipient, verify immediate delivery, scheduled delivery, cancellation and recheck. Mock-provider tests do not establish real sender-domain/key validity or recipient delivery.
5. Confirm status/history and retry behavior after a page reload. Keep old verification keys available for existing messages when rotating secrets.

## Integrity boundary

All database access uses authenticated RLS. The server verifies signatures over immutable snapshots and append-only provider receipts before trusting status or initiating provider operations. This prevents a modified database receipt from becoming an application-trusted provider ID. The database does not hold the signing secret: authorized semester staff can potentially corrupt their own records through direct data access, so this is not a claim of tamper-proof database history. Signature verification must not be bypassed to repair such records.

## Provider references

[Scheduling](https://resend.com/docs/dashboard/emails/schedule-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [retrieval](https://resend.com/docs/api-reference/emails/retrieve-email), [cancellation](https://resend.com/docs/api-reference/emails/cancel-email).
