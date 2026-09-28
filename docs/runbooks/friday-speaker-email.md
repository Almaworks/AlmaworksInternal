# Friday speaker email delivery

## Current scope

Saving a new or materially changed Friday speaker resolves active, approved startup members in that semester, creates one delivery ledger row per recipient, and submits the message to Sequenzy when configured. The email includes speaker name, topic, biography, Friday date, program and speaker-session times, and an exact link into the participant Friday Program view. Repeating an unchanged save does not submit mail. The admin can select **Notify startups** on a saved speaker to process a preexisting assignment or queued mail; a processed provider response is not sent again.

This release slice does not send Friday group assignments, booking confirmations, 24-hour reminders, or admin outreach digests. The ledger is not a scheduled worker: a queued row is submitted on the next explicit **Notify startups** action once configuration is available. Provider `accepted` means Sequenzy accepted the request; recipient delivery is a separate check.

## Configuration and release order

1. Confirm the target is exactly Supabase project `layjdjfvxkowxidwuvbs` and inspect hosted migration state. Apply the three generated migrations `20260926220127_notification_delivery.sql`, `20260926221127_notification_delivery_guard.sql`, and `20260926221945_notification_delivery_email_normalization.sql` only after release authorization and review. Hosted history includes prior releases under different timestamps; use an exact three-file deployment, never a broad push of every local-only migration.
2. Set server-only `SEQUENZY_API_KEY` in the application deployment. Set `NOTIFICATION_APP_ORIGIN` to the public HTTPS origin; `CALENDAR_APP_ORIGIN` is used as a fallback. Never use a `NEXT_PUBLIC_` key for Sequenzy.
3. Release the application code after schema readiness. The sender remains `Almaworks <alerts@almaworks.sequenzymail.com>` in `src/notifications/sequenzy.ts`.
4. Use a designated test semester and active startup test accounts. Save a test speaker or select **Notify startups** on a designated existing assignment. Confirm the UI reports provider acceptance, compare ledger recipient/status/provider IDs with Sequenzy, inspect the test inbox or spam folder, and open the exact Friday link after sign-in. Verify another semester cannot see it.
5. If the speaker was assigned before this release, saving it unchanged will not announce it; use **Notify startups** once. Do not use real participant addresses as a QA fixture without explicit authorization.

## Delivery states

| State | Meaning | Operator action |
| --- | --- | --- |
| `queued` | No provider request has been made because configuration was unavailable. | Fix configuration, then use **Notify startups** for the current speaker. |
| `submitting` | The server claimed the row; completion was not recorded yet. | Inspect Sequenzy before any retry. Do not submit automatically. |
| `accepted` | Sequenzy returned a send ID. | Check provider delivery and recipient inbox separately. |
| `rejected` | Sequenzy explicitly rejected the request. | Correct the provider issue; inspect the record before any new attempt. |
| `unknown` | A timeout or unreadable response may already have submitted mail. | Reconcile against the Sequenzy dashboard using the time and recipient. Never blindly retry. |
| `suppressed` | The recipient address changed before a queued send. | Do not send the stale row. |

The admin UI reports a saved speaker separately from email status. The ledger is visible only through semester-admin RLS. Recipient identity is immutable after insert, and insert policy validates active startup membership, approved profile, current email, and saved speaker.

## Local verification

The isolated scratch Supabase baseline had no public/private diff. All three migrations were generated with `supabase db diff` and copied without editing. Focused mocked provider and Friday route tests, TypeScript, scoped ESLint, migration-safety and build passed on 2026-09-26. Authenticated role-specific browser QA and a live Sequenzy test send remain pending; neither is implied by local checks.
