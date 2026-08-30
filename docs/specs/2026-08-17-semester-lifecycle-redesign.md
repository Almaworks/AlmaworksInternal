---
title: Semester Lifecycle Redesign Implementation Spec
status: approved
updated: 2026-08-17
---

# Semester lifecycle redesign

## Goal

Make onboarding and offboarding a predictable semester operation for fewer than 250 invitees while keeping first-time setup light for startups and mentors.

## Scope

- reusable identities and semester memberships
- cohort administrator and super-admin authorization
- versioned semester defaults
- validated roster preview and import
- real tracked email delivery for invitations
- reviewed access-request fallback
- three-step, resumable onboarding with role-specific checklists
- shared startup team management and availability
- semester close, alumni access, and selective carry-forward
- active-semester default with semester and all-time views
- audit trail and operational readiness dashboard

## Acceptance criteria

- A returning person receives one account and a new membership, not a duplicate profile.
- Role and access cannot be elevated through browser-controlled auth metadata or profile edits.
- Roster import reports invalid rows and duplicate matches before committing changes.
- An invitation records provider acceptance, failure, expiry, acceptance, resend, and revocation.
- Startup and mentor users can complete required setup in three short steps and resume later.
- Any active startup teammate can maintain the startup's shared profile and availability.
- Closing a semester prevents new operational actions while retaining read-only history.
- Carry-forward is previewed, selective, idempotent, and audited.
- Admin pages work on desktop and mobile, with keyboard access, visible focus, and meaningful empty/error/loading states.

## Delivery slices

1. Domain state machines, roster validation, and test harness.
2. Schema, backfill, constraints, RLS, and generated types.
3. Server-owned lifecycle services and authenticated APIs.
4. Semester operations, invitations, and access-request admin UI.
5. Startup and mentor onboarding experiences.
6. Close/carry-forward flow, observability, and cutover verification.

## Hard gate

Before generating or applying schema changes, reconcile local and remote Supabase migration history for the authorized project `layjdjfvxkowxidwuvbs`. Do not repair, link, or apply migrations against any other project.
