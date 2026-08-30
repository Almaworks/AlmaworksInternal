# Almaworks Mentor-Startup Platform

## Scope

These instructions apply to this folder and all of its descendants unless a more specific `AGENTS.md` exists deeper in the tree.

## Why This Exists

Almaworks runs a mentorship program connecting mentors and startups each semester. This platform replaces manual scheduling and scattered spreadsheets with a centralized web tool. Mentors and startups can log in, discover each other, and request sessions. The Almaworks admin team manages scheduling, outreach, and program operations.

## What This System Does

- Mentor and startup profiles with expertise tags and semester history
- Startup-facing mentor directory that is searchable, filterable, and cross-semester
- Session request flow: startup requests -> admin approves -> Google Calendar invite is sent
- Semester schedule page visible to all users, with week-by-week and role-aware views
- Admin tools for schedule management, outreach tracking, and onboarding form triggers
- AI matching engine that ranks mentor-startup fit by expertise and availability
- AI gap analysis that identifies missing mentor profiles for recruiting

## Tech Stack

- Frontend: React + Next.js with TypeScript
- Backend, database, and authentication: Supabase (Postgres, RLS, Edge Functions, Realtime, and Storage)
- AI: Supabase Edge Functions calling an LLM API such as OpenAI or Anthropic
- Hosting: Vercel for the frontend and Supabase Cloud for the backend

## Repository Map

```text
AGENTS.md              <- agent instructions for this repository
CLAUDE.md              <- Claude-specific repository guidance
GETTING_STARTED.md     <- bootstrap instructions (read once, then ignore)
.claude/
  skills/              <- reusable expert modes for common workflows
  hooks/               <- deterministic guardrails
docs/
  architecture.md      <- system architecture overview
  adr/                 <- engineering decision records
src/
  auth/                <- authentication and RLS (sharp edge; read local instructions)
  db/                  <- database types, migrations, and seed data (sharp edge)
  ai/                  <- matching engine and gap analysis; all LLM calls live here
  api/                 <- REST API route handlers
  components/          <- shared React components
  pages/               <- Next.js pages
```

## Key Commands

```bash
# Start local Supabase
supabase start

# Start the development server
npm run dev

# Regenerate TypeScript types after a schema change
supabase gen types typescript --local > src/db/types.ts

# Run tests
npm test

# Run the linter
npm run lint
```

## Supabase Project Boundary

This repository belongs exclusively to the AlmaworksInternal Supabase project:

- Project URL: `https://layjdjfvxkowxidwuvbs.supabase.co`
- Project reference: `layjdjfvxkowxidwuvbs`

Agents must obey all of the following rules:

1. Only connect to, inspect, query, modify, migrate, link, deploy to, or otherwise operate on the Supabase project identified above.
2. Before every remote Supabase operation, verify that the target URL or project reference exactly matches the allowed project.
3. Never use credentials, configuration, CLI linkage, environment variables, or tool state that targets another Supabase project.
4. If the target project cannot be verified, or if any project identifier differs from `layjdjfvxkowxidwuvbs`, stop without performing the operation and report the mismatch to the user.
5. Do not relink this repository to a different Supabase project, even temporarily, unless this `AGENTS.md` is explicitly updated by the user first.

## Non-Negotiable Engineering Rules

1. Every program-scoped Supabase table must have a non-null `semester_id` foreign key. Global identity, organization, authorization, configuration, and system-delivery tables may omit it only when the exemption is documented in `docs/architecture/identity-membership.md`.
2. Never bypass Row Level Security. All access control must go through Supabase RLS policies.
3. Never hand-edit files in `supabase/migrations/`; always use `supabase db diff`.
4. All LLM API calls must go through `src/ai/`. Never call an LLM directly from a component or page.
5. TypeScript strict mode is enabled. Do not use `any` types.
6. Run `npm run lint` before every commit.

## Working Expectations

- Read more specific instructions in nested `AGENTS.md` or `CLAUDE.md` files before changing sensitive areas.
- Preserve unrelated user changes in the working tree.
- Keep changes scoped to the requested task.
- Validate changes with the narrowest relevant checks, then run broader tests when the risk warrants them.
