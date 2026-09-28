# Independent mentor bookings

User authorization: 2026-09-08 conversation explicitly requested mentor availability independent of Friday, startup requests and mandatory mentor acceptance; user asked to begin this phase after Friday implementation.

Implement integrated availability as discrete bookable start/end windows. No Friday meeting/slot reference. Mentors publish and withdraw their own future windows. Active startups in the same active semester request a window with a topic; their request stays pending until the owning mentor accepts or declines. Either party may cancel their request/booking. Admins have visibility but cannot accept on behalf of a mentor. Accepted bookings must never overlap for a mentor or startup; duplicate requests and retries are safe. Do not expose other startups' private request topics. Display timezone explicitly. Preserve terminal records for semester export.

Implementation defaults: one request occupies a window while pending/accepted; withdrawal is only allowed without a live request; no automatic email/calendar send, recurring availability, external Timeful integration or rescheduling in this increment. Cancel then request another window. Retain historical Friday sessions but direct new participant booking actions to independent booking UI.

Database records carry non-null semester_id and same-semester FKs. All access uses RLS and SECURITY INVOKER; do not use service role to bypass it. Only mentor owner may accept. Concurrency must be enforced in database, not UI alone. Only local DB work; remote project boundary remains layjdjfvxkowxidwuvbs. Generate migration only with db diff; generate types CLI. Preserve unrelated dirty work. No commit/push/release or outbound messages.

Onboarding must no longer require Friday availability for mentors or startups. Remove those grid writes without deleting historical rows. Finishing setup should explain independent booking; publishing availability is not an activation gate.
