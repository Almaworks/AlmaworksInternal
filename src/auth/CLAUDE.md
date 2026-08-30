# CLAUDE.md — src/auth/ (SHARP EDGE)

> This folder controls authentication and role-based access.
> Read this before making any changes here.

## What lives here
- Supabase Auth configuration and helpers
- Role checking utilities
- JWT claims shape
- Auth middleware for API routes

## The role enum
There are exactly 3 roles. Do not add new roles without an ADR and team discussion.
```typescript
type Role = 'mentor' | 'startup' | 'admin'
```
Roles are granted by `platform_roles` and `semester_memberships`. Browser-controlled auth metadata and legacy `profiles.role` are never authoritative.

## Non-negotiable rules
1. NEVER disable or bypass RLS policies — see docs/adr/002-rls-for-role-access.md
2. NEVER use the Supabase service role key on the frontend or in client-side code
3. NEVER expose user data across roles — a startup must never see another startup's private data
4. All role checks in UI components are secondary gates only — RLS is the primary gate
5. JWT identity is the authenticated `sub`; authorization is resolved from RLS-protected database memberships so semester changes do not rely on stale JWT role claims.

## Common mistakes to avoid
- Using `.auth.admin` methods from the frontend — server-side only
- Forgetting to check `semester_id` when checking role — a user may be active in one semester but not another
- Caching auth state without invalidating on role change

## Critical: always use explicit public schema prefix in functions
When writing any Postgres function that references your tables, always prefix
with `public.` explicitly — e.g. `public.profiles`, `public.user_role`.
Functions running as `security definer` default to the auth schema context
and will fail silently if schema is not specified.

Always add `set search_path = public` to security definer functions:
create or replace function public.your_function()
...
$$ language plpgsql security definer set search_path = public;
