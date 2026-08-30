---
title: ADR 005 - Reusable identities and semester memberships
status: accepted
date: 2026-08-17
---

# Reusable identities and semester memberships

## Context

The existing profile model combines permanent identity, role, semester, and activation state. That makes recurring onboarding error-prone and makes returning users difficult to represent safely.

## Decision

Keep identity and durable role profiles global. Represent participation and authority with explicit semester memberships and role-specific semester records. Use one Fall or Spring cohort per semester and keep closed cohorts available as read-only alumni history.

## Consequences

- A single account can participate in multiple semesters and roles over time.
- Every operational query must select a semester explicitly or use the active-semester resolver.
- Backfill must translate legacy `profiles.role`, `profiles.status`, and `profiles.semester_id` into membership rows before cutover.
- Global tables require a documented exemption from the semester foreign-key invariant.
