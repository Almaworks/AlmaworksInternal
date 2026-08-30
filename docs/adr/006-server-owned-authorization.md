---
title: ADR 006 - Server-owned authorization
status: accepted
date: 2026-08-17
---

# Server-owned authorization

## Context

Authentication metadata and broadly writable profile rows are unsuitable sources of authority. Role or status values supplied by a browser can create privilege-escalation paths.

## Decision

Authorization derives only from server-created `platform_roles` and `semester_memberships`, enforced by RLS and database constraints. User metadata may prefill display fields but never grants a role, membership, activation, or administrative scope.

## Consequences

- Invitations and approved access requests are the only normal membership-creation paths.
- Administrative mutations run through explicit server commands and record audit events.
- Profile self-service updates use a safe-field allowlist.
- RLS tests must cover anonymous, invited, active, alumni, cohort-admin, and super-admin actors.
