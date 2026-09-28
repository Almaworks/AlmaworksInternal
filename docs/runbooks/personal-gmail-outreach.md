# Personal Gmail outreach activation

This is separate from Sequenzy and Google Calendar. Gmail sending is opt-in per admin.

Follow `authenticated-qa.md`; local tests alone do not establish a working mailbox connection.

## Configuration

Apply the reviewed `20260927041504_personal_gmail_sending.sql` migration only to the repository's allowed Supabase project after release authorization. Verify RLS, the composite opportunity foreign key, the unresolved-send index, and `reserve_personal_gmail` ownership (`calendar_sql_internal`, NOLOGIN/NOBYPASSRLS).

Set these **server-only** variables:

```text
OUTREACH_GMAIL_ENABLED=false
OUTREACH_GMAIL_APP_ORIGIN=http://localhost:3000
OUTREACH_GMAIL_CLIENT_ID=<Google OAuth web client ID>
OUTREACH_GMAIL_CLIENT_SECRET=<Google OAuth web client secret>
OUTREACH_GMAIL_ENCRYPTION_KEY=<independent base64-encoded 32-byte key>
```

The existing `CALENDAR_WORKER_EMAIL` / `CALENDAR_WORKER_PASSWORD` ordinary authenticated integration identity must be enabled in its private registry. This reuses server storage authorization, not Calendar tokens. Never substitute a service-role key.

Enable Gmail API in Google Cloud. Register `<OUTREACH_GMAIL_APP_ORIGIN>/api/admin/outreach/gmail/callback`. Request only `openid`, `email`, and `https://www.googleapis.com/auth/gmail.send`. Google testing-mode access, consent and verification requirements must be satisfied for the intended admins. Turn the feature flag on only after deployment and Google configuration. Each admin completes their own consent.

## Expected workflow

Open an outreach contact you own → select/edit a template → review recipient and preview → **Send from my Gmail**. If disconnected, connect first; the contact/draft returns after successful authorization. Sender cannot be typed or impersonated. Missing contact data/variables block sending.

Confirmed send: history says **Sent through Gmail** and links to its Gmail thread. No delivery, open, or reply acknowledgement is inferred. Existing pipeline stages are not automatically advanced in this increment.

Uncertain send: no automatic retry. Check the connected mailbox's Sent folder, wait for any active request to finish, then explicitly mark it reviewed. Review does not send an email or claim delivery. The database blocks additional unresolved requests across browser tabs. A crash after reservation is intentionally treated as uncertain.

Disconnect removes Almaworks' credential and invalidates unused OAuth attempts; Calendar remains connected. To revoke Google's entire app grant, the account owner can use Google account permissions, understanding that the shared OAuth client may also cover Calendar.

## Recovery and QA

- Missing schema / disabled configuration: keep sending disabled; apply only the reviewed release package.
- Google consent fails: check exact callback origin, Gmail API enablement, consent audience/test users and all requested scopes. Reconnect; never print access/refresh tokens.
- Expired/revoked grant: reconnect the affected admin mailbox; do not affect other admins.
- Uncertain result or result-storage failure: inspect Gmail Sent. Never “fix” it by deleting reservations or blindly generating a new send request.
- Test with explicitly authorized recipient/contact fixtures; inspect Gmail Sent and actual receipt and reload saved history. Also verify a mentor/startup and another semester admin cannot use these endpoints, and another admin cannot send through this mailbox.

Future work: reply sync requires additional Gmail permission and a separate review; bulk sends and follow-up automation should reuse the single-recipient safety rules rather than bypass them.
