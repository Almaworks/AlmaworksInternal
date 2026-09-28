# Complete Calendar integration

User authorized autonomous implementation and release, with final review on return.

1. Integrated owner calendar: preserve existing settings; add weekly navigation, busy/working/bookable/accepted/reserved layers, timezone and semester boundaries. Owner-only busy RPC returns timestamps, never event titles or another user's busy metadata. Generate and replay schema changes through isolated Supabase diff. Browser desktop/mobile QA.
2. Background sync: establish the available deployment target, run existing ordinary-Auth/RLS worker outside browser lifecycle, persist secure scheduler configuration, verify actual completed sync. Never substitute a browser poll for background execution.
3. End-to-end QA: real connected mentor, disposable in-semester test windows/holds where authorized, conflict rejection, accepted hold and cancellation cleanup, reload, disconnected/error states and startup boundaries. Restore fixtures; existing Google events remain untouched. Report unavailable credentials or OAuth actions requiring user intervention precisely.
4. Performance/release: replace repeated slot authorization queries with reviewed set-based projection preserving every filter, test role parity and timings. Run tests/lint/types/build. Deploy only allowed Supabase project and established application target, verify live release. Preserve all unrelated dirty files; no blanket commit.

Work is kept in the current repository because the existing uncommitted feature is the required base. UI worker owns integrated display; coordinator owns endpoint/schema/scheduler/release. Use narrowly scoped tests and actual Browser verification. No secrets in reports or memory.
