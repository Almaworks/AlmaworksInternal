# Admin request amplification and latency

Goal: remove measured redundant remote work, preserve authorization and current management actions, and document verification limits.

Evidence: the shared admin page requests attendance for each confirmed session although its only consumer is a disabled schedule block. Hosted query statistics show 12,892 session-by-ID lookups and 15,756 permission RPCs. Overview resolves profile photos it never displays. Friday Program imports the same loader. Cohort options issue one permission RPC per semester.

1. Add regression checks rejecting retired schedule requests and unrelated Friday Program loads; run them before changing the implementation. Remove the disabled schedule, its modals/state/mutations, and its attendance fan-out from `app/dashboard/admin/page.tsx`.
2. Add `src/dashboard/admin-overview.ts` with RLS-backed, semester-scoped summary reads, test totals, empty state, query projection and failures using the real Supabase client with a recording transport. Replace Overview's mentor/photo/startup/session directory loads with this projection. Keep management reads only on their routes.
3. Give Friday Program a dedicated entry point that resolves its semester and loads its panel without the management/cohort/attendance machinery.
4. Audit auth and cohort server waterfalls independently; implement demonstrated safe reductions with authorization and failure-path regression coverage. Do not cache server authorization across requests.
5. Add bounded, identity-scoped client read reuse only where invalidation can be enforced; test concurrent deduplication, expiry, account separation and mutation invalidation. Never persist private responses to browser storage.
6. Run focused suites, lint, TypeScript/build checks and inspect task diffs. Compare deterministic query budgets and available local timings; authenticated desktop/narrow browser QA remains required and must be reported BLOCKED if no browser is exposed.

Preserve the existing dirty tree. Only remote project `layjdjfvxkowxidwuvbs` is allowed. Any necessary DDL must be generated with `supabase db diff`, reviewed and applied only to that project. No speculative indexes or destructive cleanup. Record findings and exact validation in `outputs/` and task-specific project memory.
