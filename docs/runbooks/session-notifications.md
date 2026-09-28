# Session notification email

The admin **Notify** page sends immediate Friday-session notifications. It requires an active-semester administrator and sends one message per recipient selected on the page.

## Provider configuration

- Set `SEQUENZY_API_KEY` in the server environment to use Sequenzy. Use a company key with `transactional:send`; never expose it through a `NEXT_PUBLIC_` variable or commit it to the repository.
- Sequenzy messages use the verified sender `Almaworks <alerts@almaworks.sequenzymail.com>`. The sender profile is not a receiving mailbox. The Sequenzy account's default Reply-To applies unless it is changed in Sequenzy.
- If Sequenzy is not configured, the existing `RESEND_API_KEY` path remains available and uses `NOTIFY_FROM_EMAIL` when set. If neither key is configured, the page shows a dry-run preview and sends nothing.
- Restart the application after changing server environment variables. For a hosted release, configure `SEQUENZY_API_KEY` in the hosting environment and deploy the build; a local `.env.local` value does not configure hosting.

The Sequenzy API acknowledges a queued send with `emailSendId`. The admin page counts that as accepted for sending, not delivered. Check the Sequenzy email-send record for final delivery status. A network error or unreadable success response is ambiguous; inspect Sequenzy before retrying to avoid a duplicate.

## Current delivery hold

The first authorized Gmail test landed in Spam. Sequenzy recorded a delivered/opened event, but Gmail displayed `alerts@almaworks.sequenzymail1.com` as the sender although the request and sender profile used `alerts@almaworks.sequenzymail.com`. Gmail's original headers show SPF, DKIM, and DMARC passing for the actual `.sequenzymail1.com` sender. Authentication failure is not the explanation for this test; the reason for sender rewriting and spam placement remains unresolved. Local `SEQUENZY_API_KEY` was removed from `.env.local` to keep the admin page in preview mode; the ignored local key file remains available for diagnosis. Do not add the key to hosting or send participant notifications until inbox placement and the sender identity have been checked with representative recipients. A single recipient marking the message “Not spam” is not a general delivery fix.

## Verification

Use a designated administrator, test semester, and recipient inbox. Verify the admin page loads the intended sessions, a selected message reaches that inbox with the `alerts@` From address, and the Sequenzy send record shows its final status. Verify an unauthorized account cannot submit the send. Do not send to live participants for QA.

Scheduled outreach uses the separate Resend provider contract and is outside this immediate-notification path.
