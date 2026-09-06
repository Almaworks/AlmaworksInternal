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
- `outreach_contacts`, `outreach_companies`, and `outreach_contact_companies`: durable CRM identity and organization records
- `outreach_relationship_labels`: global CRM label configuration; active outreach administrators may read the catalog and attach labels within semesters they manage, while only platform super administrators may create, rename, or delete label definitions

No program participation is inferred from a global record.

## Semester-scoped records

Every program-scoped table has a non-null foreign key to `semesters`:

- `semester_memberships`: a person's role and lifecycle state for a cohort
- `startup_semesters`: a startup's cohort-specific goals, preferences, and state
- `startup_mentor_need_tags`: a startup's ordered mentor needs for one cohort
- `startup_team_memberships`: people authorized to manage a startup in a cohort
- `mentor_semesters`: a mentor's cohort-specific participation and preferences
- invitations, access requests, onboarding progress, availability, notifications, and audit events

## Authority

User-supplied authentication metadata is never authoritative for role or status. Database authorization derives from server-created membership and platform-role rows. The browser may edit safe profile fields only; role, membership, and semester lifecycle changes go through server-owned commands protected by RLS and database constraints.

## Lifecycle

Semester states: `draft -> active -> closed -> archived`.

Membership states: `invited -> onboarding -> active -> alumni`, with `suspended` available as an administrative exception. Closing a semester converts participating members to read-only alumni access without deleting their reusable accounts.

## Read model

The application defaults to the active semester. Users may select a semester they can access; admins may choose all-time views. Queries must never use a global profile as proof of current-cohort access.
