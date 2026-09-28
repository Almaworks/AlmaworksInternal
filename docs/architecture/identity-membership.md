---
title: Identity and Semester Membership Architecture
status: approved
updated: 2026-08-17
---

# Identity and semester membership

Almaworks separates a person's durable identity from their participation in a particular semester. An authenticated account survives across cohorts; access, onboarding, availability, and operating status are semester-scoped.

## Global records

These records intentionally do not carry `semester_id` because they are durable identity, authorization, configuration, or delivery infrastructure:

- `profiles`: name, contact details, avatar, and authentication linkage
- `platform_roles`: super-admin authorization only
- `startups`: durable company identity and description
- `mentor_profiles`: durable mentor biography and expertise
- `expertise_tags` and `expertise_tag_aliases`: the global, user-extensible shared expertise vocabulary and its search aliases
- `mentor_expertise_tags`: durable connections between a mentor and that global vocabulary
- configuration templates: versioned defaults used when a semester is created
- delivery outbox: system email attempts keyed to an invitation or notification
- `member_deletion_operations`: global system-delivery state for personal deletion; temporary cleanup identifiers are cleared at completion and access is restricted to authenticated RPCs
- `outreach_contacts`, `outreach_companies`, and `outreach_contact_companies`: durable CRM identity and organization records
- `outreach_relationship_labels`: global CRM label configuration; active outreach administrators may read the catalog and attach labels within semesters they manage, while only platform super administrators may create, rename, or delete label definitions
- `google_calendar_connections`: one optional provider identity per durable person, with owner-only safe account/status metadata; encrypted credentials live separately in the private schema. Disconnect stops new work, queues bounded owned-hold cleanup, then removes this app's credentials without revoking project-wide Google grants; personal deletion removes credentials immediately. The private credential row's disconnect lease fields are global integration lifecycle state, not semester participation. Incomplete provider cleanup is recorded as an owner-visible warning.
- `google_calendar_credentials`: private encrypted authentication material keyed to that global connection; only the registered Calendar worker and narrowly scoped internal SQL functions can access it
- `calendar_worker_identities`: private global authorization registry for dedicated ordinary authenticated worker accounts; the registry, not editable JWT metadata, determines worker access

No program participation is inferred from a global record.

## Semester-scoped records

Every program-scoped table has a non-null foreign key to `semesters`:

- `semester_memberships`: a person's role and lifecycle state for a cohort
- `startup_semesters`: a startup's cohort-specific goals, preferences, and state
- `startup_mentor_need_tags`: a startup's ordered mentor needs for one cohort
- `startup_team_memberships`: people authorized to manage a startup in a cohort
- `mentor_semesters`: a mentor's cohort-specific participation and preferences
- invitations, access requests, onboarding progress, availability, notifications, and audit events
- `mentor_calendar_settings`, `mentor_calendar_overrides`, and `mentor_calendar_manual_slots`: optional cohort-specific scheduling mode, timezone, dated exceptions, and manual availability
- `google_calendar_oauth_transactions`: expiring, one-use connection setup bound to a person and semester
- `google_calendar_busy_snapshots`, `google_calendar_busy_intervals`, and `google_calendar_sync_jobs`: private, cohort-scoped coverage, free/busy intervals, and leased refresh work
- `google_calendar_hold_jobs`: durable desired state and leased delivery status for each accepted booking and connected party within a semester

## Authority

User-supplied authentication metadata is never authoritative for role or status. Database authorization derives from server-created membership and platform-role rows. The browser may edit safe profile fields only; role, membership, and semester lifecycle changes go through server-owned commands protected by RLS and database constraints. Only platform super administrators may create semester drafts, replace a draft semester's meeting plan, or activate a semester transition. Active semester administrators may still manage members, scheduling, sessions, and outreach within the semesters they administer.

## Lifecycle

### Personal Gmail outreach integration (2026-09-27)

`outreach_gmail_accounts` is a global identity/integration configuration table and is exempt from `semester_id`: an admin connects one personal mailbox across semesters. OAuth attempts and send records retain non-null semester foreign keys. Only the existing registry-authorized ordinary server integration identity can read encrypted tokens or write Gmail records; this uses RLS, never service-role access. Admin requests are independently verified against fresh semester permissions, profile identity, and conversation ownership before sending. Sharing a server storage identity with Calendar does not share OAuth grants or tokens. Gmail tokens use a separate encryption key and a Gmail-specific authenticated-encryption context. Sequenzy remains independent.


Semester states: `draft -> active -> closed -> archived`.

Membership states: `invited -> onboarding -> active -> alumni`, with `suspended` available as an administrative exception. Closing a semester converts participating members to read-only alumni access without deleting their reusable accounts.

## Read model

The application defaults to the active semester. Users may select a semester they can access; admins may choose all-time views. Queries must never use a global profile as proof of current-cohort access.

## Independent mentor booking (local implementation, 2026-09-08)

Friday programming and independent mentor bookings have separate records. Friday programs retain their weekly company rotations. Independent availability windows and booking requests carry their own semester scope and actual start/end timestamps; they do not use Friday meeting slots.

The mentor owning a window is the only participant who can publish/withdraw it and accept or decline its requests. An active startup team member requests on behalf of that startup. Either party can cancel; semester admins have read visibility, not authority to accept as a mentor. Request topics are private to the involved participants and authorized admins. Existing Friday session records remain historical data with their existing rules.

See `docs/superpowers/specs/2026-09-08-mentor-booking.md` for the current increment and implementation defaults. This design addition does not indicate a production deployment.
