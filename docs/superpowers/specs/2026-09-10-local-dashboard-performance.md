# Local Dashboard Performance Design

## Goal

Make local dashboard navigation consistently responsive by removing development-time compiler stalls, reducing repeated authorization round trips, and avoiding data loads for unopened participant modules.

## Confirmed evidence

- `package.json` runs `next dev --webpack`. `dev-server.log` attributes individual dashboard navigations 5–30 seconds to compile time and records Webpack cache-write failures plus repeated full Fast Refresh reloads.
- `proxy.ts` calls `loadCanonicalAccess` on every dashboard request. That helper currently performs profile, platform-role, and membership lookups serially; participant routing then performs one to three additional onboarding lookups. The same log attributes 0.2–10.5 seconds of dashboard navigation to `proxy.ts`.
- `app/api/participant-dashboard/route.ts` builds the full profile, network, startup directory, photo URL, and notification snapshot before returning the participant shell. `ParticipantDashboard` only needs subsets of that snapshot for several tabs. Bookings and Friday Program independently request their data on mount.

## Design

### Development server

Change the normal `dev` command to `next dev`, which uses Turbopack in Next 16. Keep the existing `next.config.ts` Turbopack root configuration. The existing Webpack-only watch-ignore customization remains available only to explicit Webpack callers; the normal local workflow must no longer force Webpack or depend on its broken cache state.

### Authorization routing

Refactor `loadCanonicalAccess` so that it performs the dependent profile lookup first, then requests platform roles and semester memberships concurrently. Preserve the exact selected fields, RLS-backed Supabase client, status checks, role selection, and redirect logic. No browser-side authorization cache or privileged client is introduced.

For participant routes, preserve the onboarding guard but make its independent membership/readiness work concurrent where the resolved membership provides enough information. Admin routes retain their existing server-layout authorization boundary.

### Participant dashboard data lifecycle

The traced lifecycle shows that `ParticipantDashboard` already retains its initial snapshot in React state while its local tabs switch. Bookings and Friday Program only mount on their own tabs, so their first request is intentionally module-scoped. Do not add another snapshot cache or speculative prefetch: it would not improve the observed route latency and could introduce stale or duplicate authenticated requests.

Revisit endpoint splitting only after a fresh authenticated browser trace shows that either module's own API request, rather than the development compiler or route proxy, is the remaining latency source.

## Error handling and correctness

- Failed prefetches are ignored; the module retains its existing visible loading/error behavior when opened.
- Navigation continues to be protected by server-side Supabase/RLS access checks; no role or onboarding decision is trusted from local storage or an unverified JWT payload.
- A profile save invalidates the local participant snapshot before its existing refresh, so stale profile data cannot persist.

## Verification

- Add source-level tests that prevent reintroducing Webpack as the default dev command and assert concurrent authorization lookup construction.
- Add participant-dashboard unit tests for cache reuse/invalidation and prefetch de-duplication through extracted pure helpers.
- Run focused tests, lint the changed files, and run a production build in an isolated build directory.
- Browser QA remains required for the participant flow, but it is currently blocked because this session has no browser surface or authenticated role-specific credentials.
