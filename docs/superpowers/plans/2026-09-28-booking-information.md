# Booking information delivery plan

User approved six information improvements. Local implementation; hosted migration release requires explicit approval after review.

1. Shared meeting details: lazy-loaded RLS-backed location/link, contacts, startup context, and editable shared details. No invented video links. Validate HTTP(S), semester access and concurrent saves.
2. Context at decision time: meeting-details expansion available beside pending requests, profiles linked to existing directories.
3. Preserve declined, canceled and expired pending requests in history; atomic reason/alternative with decline/cancel, next-action copy.
4. Separate admin Friday-session counts from mentorship-request counts and correct navigation (bounded Terra worker).
5. Weekly participation summary from current booking records and program roster, timezone/semester boundaries; admin sees exceptions; startup sees own status only.
6. Past-meeting outcomes reported per user, optional shared feedback; never infer attendance from elapsed time. Separate scoped Sol worker owns new schema/API, generated migration/types and RLS tests.

Validate focused unit/API/database checks, TypeScript/lint once, and real role-specific browser checks when schema is available. Preserve all unrelated edits. No emails or calendar changes for QA without explicit authorization.
