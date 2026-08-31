# Architecture overview — Almaworks platform

> This page describes the current system. The approved v2 identity and semester-membership model is defined in [[architecture/identity-membership]].

## System layers

### 1. Users
Three roles with distinct access levels:
- **Startup** — browse mentors, request sessions, view schedule, complete onboarding form
- **Mentor** — view profile, see assigned sessions, view schedule, complete onboarding form
- **Admin** — full access: manage all users, approve sessions, run outreach tracker, view AI insights

### 2. Onboarding forms (triggered on account creation each semester)
- **Startup form:** semester availability, mentor preferences + tags, goals, stage, industry
- **Mentor form:** session date availability, expertise tags, mentorship goals
- Both forms feed the AI matching engine and session scheduler

### 3. Frontend (Next.js + React)
Key pages:
- `/login` — role-based auth
- `/mentors` — mentor directory (cross-semester, searchable, filterable by expertise)
- `/mentors/[slug]` — individual mentor profile with bio, links, history, request CTA
- `/schedule` — semester schedule view (week-by-week, "my sessions" highlighted)
- `/sessions/request` — session request form
- `/admin` — admin dashboard
- `/admin/schedule` — schedule manager (approve, assign, track)
- `/admin/outreach` — reach out tracker (prospect pipeline)

### 4. Backend (Supabase)
- **Auth:** Supabase Auth with JWT and magic links; durable identity is stored in `profiles`, while semester roles come from `semester_memberships`
- **Database:** Postgres with RLS — see `docs/adr/002-rls-for-role-access.md`
- **Storage:** Supabase Storage for profile photos and startup logos
- **Edge Functions:** AI matching engine and gap analysis (see `src/ai/`)
- **Realtime:** Live schedule updates when admin confirms a session

### 5. AI layer (Edge Functions in src/ai/)
- **Matching engine:** scores mentor-startup compatibility using expertise tags + availability
- **Gap analysis:** compares startup needs against current mentor pool, flags recruiting gaps
- All LLM calls go through `src/ai/` only — never called directly from frontend or API routes

### 6. Notifications (nice-to-have, Phase 2)
- Post-session auto email
- Weekly startup newsletter to mentors
- GCal invite on session confirmation

## Data model (key tables)
See `src/db/types.ts` for full generated types.

| Table | Purpose |
|---|---|
| `semesters` | Cohort boundaries and current lifecycle state |
| `profiles` | Durable authenticated identities for admins, mentors, and startup members |
| `semester_memberships` | Per-semester role, participation history, and onboarding state |
| `mentor_profiles` / `mentor_semesters` | Durable mentor details plus semester-specific participation |
| `startup_organizations` / `startup_semesters` | Durable startup details plus semester-specific cohort participation |
| `meetings` | Almaworks Friday meeting dates; each exposes two mentorship slots |
| `meeting_availability` | A semester member's availability for a meeting and slot |
| `sessions` | One startup-mentor mentorship session in a meeting slot |
| `outreach_contacts` / `outreach_opportunities` | Durable outreach contacts plus a fresh pipeline record per semester |
