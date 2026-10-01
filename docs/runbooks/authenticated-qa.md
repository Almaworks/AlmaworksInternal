# Authenticated browser QA

## Login setup

Use email/password for repeatable browser QA. Normal sign-in offers password or Google; new users request access and verify an emailed signup code before administrator approval. Password recovery remains a separate email-reset flow. See `outputs/password-first-auth-2026-09-26.md` for current release and verification limitations.

1. The account owner signs in normally, opens `/account/password`, and sets a password. Existing accounts keep their identity and memberships. This uses Supabase Auth, not a test-only session or RLS bypass.
2. The user provides existing credentials for the intended QA account and identifies the app URL/environment. Never record passwords, cookies, tokens, or credential-bearing screenshots in repository files, reports, or memory. The user must enter and submit new credentials themselves when using the browser tool.
3. Open `/` in the built-in Browser, enter Email and Password, and select Sign in. Verify the destination, actual role, active semester, and expected organization before testing. Use separate real admin, mentor, and startup accounts; admin View as is only a preview and does not prove participant authorization.
4. If no password exists, Google login is a fallback. Let the user complete any MFA or account verification required by Google. A login blocker is a blocked check, never a pass.

Only operate on Supabase project `layjdjfvxkowxidwuvbs` (`https://layjdjfvxkowxidwuvbs.supabase.co`). Verify the target before remote operations. Hosted email-provider/password settings and actual credentials must be verified; local configuration alone is not evidence that hosted sign-in works.

## Hosted-schema preflight

Before opening the browser, verify that the app target is the allowlisted Supabase project and compare the hosted schema with the features under test. Check every required table, column, function/RPC, policy, and the applied migration state; record the migration identifiers or a concrete blocker. Do not infer hosted readiness from local migration files, generated database types, mock data, or healthy unit/integration tests. For example, bookings require the hosted booking-window, request, and claim tables; Friday programs require the hosted program and assignment tables.

If any required schema object or migration is absent, mark only the affected feature `BLOCKED`, report the exact missing object and next deployment action, and stop that feature's browser workflow. Healthy mock tests cannot cover an absent production schema because they exercise local fixtures or mocks rather than the hosted database, RLS, and migration history. QA findings do not authorize deployment: never deploy migrations or application code from QA without explicit release authorization.

## Required scenarios

Use a user-designated test semester and disposable fixtures. Obtain explicit authorization before sending email/calendar invitations or affecting real participants. Do not treat QA authorization as permission to send messages. Mark affected steps blocked if fixtures or authorization are missing.

| Feature | Required browser evidence |
| --- | --- |
| Login | Correct credentials reach the expected role; incorrect credentials show a recoverable error; reload retains the session; logout denies protected access. |
| Bookings | Appropriate participant can see actual availability, create a booking with authorized fixtures, and see it after reload. Confirm the corresponding admin/mentor view and test unavailable/conflicting slots. Verify an unauthorized account cannot access another participant's private booking. |
| Friday programs | Admin can load, create/edit a fixture program, assign groups, and reload the saved result. Participant view shows the correct semester/group and cannot perform admin actions. |
| Retired Resources and Export modules | Admin navigation has no Resources or Export entry. Their former pages and the semester-export API are unavailable; Outreach templates remain accessible. |

For every changed workflow exercise its primary action, validation/error state, reload/persistence, and relevant permission boundary. Inspect desktop and narrow/mobile layouts. Preview pages, mocked tests, compilation, and HTTP 200 responses do not establish that a real workflow works.

## Completion gate and report

Record `PASS`, `FAIL`, or `BLOCKED` per scenario with URL, environment/build identity, role (no credentials), semester fixture identifier, exact steps, expected and actual results, and sanitized evidence. Include downloaded-artifact inspection for any remaining download workflows and reload evidence for mutations. Store disposable evidence under `work/` and final sanitized reports under `outputs/`.

If Browser inventory is empty, login is unavailable, migrations are missing, or live data requests fail, report the specific blocker and the next required action. Fix in-scope failures and repeat the affected scenario. Code may be described as implemented with QA pending, but the feature must not be called working, verified, or complete until all required scenarios pass. Unit tests/lint/build results must be reported separately from live browser results.
