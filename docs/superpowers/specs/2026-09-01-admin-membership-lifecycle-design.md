# Admin Membership Lifecycle Design

## Goal

Make the admin onboarding workflow clearly distinguish people who are still joining the current semester, active participants, prior-semester alumni, and deliberately suspended accounts. The UI must consume the canonical database lifecycle instead of reducing every non-active membership to “Inactive.”

## Canonical model

No database schema change is required. `semester_memberships.status` remains authoritative:

- `invited`: an invitation exists, but onboarding has not started.
- `onboarding`: the participant has begun the current-semester setup.
- `active`: the participant is approved for the current semester.
- `alumni`: the participant belongs to a completed prior semester.
- `suspended`: an administrator deliberately blocked the membership.

“Ready for activation” is a derived presentation state, not a new database value. It means the membership is `onboarding` and the role-specific semester record reports `readiness_status = 'ready'` (`mentor_semesters` for mentors and `startup_semesters` for startups).

Global `profiles.status = 'pending'` remains an account-registration concern. Any such records will appear as a small “Registration requests” section within the activation workspace rather than occupying a mostly empty top-level tab.

## Admin workflow

1. An administrator creates or invites a mentor/startup. The semester membership is `invited`.
2. The participant follows the sign-in link and begins setup. The membership becomes `onboarding`.
3. Completing required onboarding sets the role-specific readiness field to `ready`. The admin UI presents this as **Ready for activation**.
4. An administrator reviews the participant and selects **Activate**, transitioning the membership to `active` through the existing authorized lifecycle endpoint.
5. Closing a semester transitions participants to `alumni`; alumni remain discoverable in historical cohort views and are never described as deactivated.
6. A deliberate administrative access block transitions a membership to `suspended`; the action is labeled **Suspend**, not Deactivate.

## Overview workspace

Rename **Pending Users** to **Needs activation**. Its badge counts current-semester memberships that are ready for activation, plus any global registration requests.

The tab contains two sections:

- **Ready for activation**: onboarding-complete mentor and startup memberships, with role, email, onboarding completion, and an Activate action.
- **Registration requests**: legacy/self-registration profiles whose global profile status is pending, preserving the existing approve/reject flow without making it the primary workflow.

When no action is needed, show a positive empty state such as “Everyone is up to date.”

## Members workspace

The selected cohort defaults to the active semester. Each member row exposes the exact presentation status:

- Invited
- Onboarding
- Ready for activation
- Active
- Alumni
- Suspended

Replace the ambiguous filter button with an accessible domino-style two-position switch:

- **All** (default): shows every member in the selected cohort.
- **Active only**: shows only `active` memberships.

The switch uses a rounded domino track with two circular halves, a clear selected half, adjacent text labels, `aria-pressed`/accessible naming, and visible keyboard focus. It must not rely on color alone.

Row actions are state-aware:

- Ready for activation → **Activate**
- Active → **Suspend**
- Suspended → **Restore** (returns to the appropriate allowed lifecycle state supported by the existing command)
- Invited/onboarding → no misleading activation action until setup is ready
- Alumni → no current-semester mutation from a historical view

## Mentor and startup directories

Directory pages continue to focus on profile and program information. Their status badges use the same shared presentation-state mapper as the Members workspace. They link administrators to the corresponding member lifecycle row instead of implementing a second activation pathway.

## Data flow and authorization

The admin read model will retain each current membership’s real `status` and join the appropriate role-specific readiness value. A shared pure function converts those canonical values into labels, colors, filter groups, and available actions.

All mutations continue through the existing server-owned admin lifecycle route and Supabase RLS/RPC authorization. The frontend will not write lifecycle fields directly, and no service-role credential will be exposed.

## Error handling

- Failed actions keep the row unchanged and show an inline error.
- Successful activation refreshes both the activation badge and Members list.
- Missing role-specific readiness data is shown as **Onboarding**, never guessed to be ready.
- Historical/all-semester views remain read-only where the existing cohort controls prohibit mutation.

## Verification

Add tests for:

- Mapping every canonical membership status to its presentation state.
- Deriving Ready for activation only from `onboarding` plus role readiness `ready`.
- All versus Active-only filtering.
- Needs-activation counts and empty states.
- State-aware action availability.
- Keyboard and accessible naming behavior for the domino switch.
- The existing authorized activation request and post-action refresh behavior.

Run the focused lifecycle/UI tests, TypeScript checks, and `npm run lint`. No database migration or generated database-type update should be produced.
