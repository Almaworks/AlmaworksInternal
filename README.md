# Almaworks Mentor-Startup Platform

A web-based internal tool for Almaworks that centralizes mentor and startup data, enables mutual discovery, streamlines mentorship session requests, and gives the Almaworks team the tools to run a more organized and scalable mentorship program.

---

## Table of Contents

- [The Problem](#the-problem)
- [What This Platform Does](#what-this-platform-does)
- [Who Uses It](#who-uses-it)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Roadmap](#roadmap)
- [Team](#team)

---

## The Problem

Almaworks runs a semester-based mentorship program connecting experienced mentors with early-stage startups. Until now, the program has been managed entirely through manual processes:

- **No shared database** — mentor and startup information lives in spreadsheets, emails, and personal notes that reset every semester
- **No discovery layer** — startups have no way to browse mentors or proactively request someone whose background fits their needs
- **Scheduling is labor-intensive** — the Almaworks team manually finds available mentors each week, emails to check availability, sends calendar invites, and maintains a schedule by hand
- **Outreach is untracked** — recruiting new mentors happens informally with no pipeline, no logging of who was contacted, and no record of responses
- **Low mentor retention** — mentors receive little communication between sessions and lose context on the startups they are working with
- **No visibility for participants** — mentors and startups do not know in advance who they will be meeting with each week

These problems compound each semester. Institutional knowledge is lost, the same outreach mistakes are repeated, and the team spends hours on coordination that should be automated.

---

## What This Platform Does

The Almaworks platform replaces all of the above with a single, role-aware web application. It serves three audiences simultaneously — startups, mentors, and the Almaworks admin team — each with a tailored experience built on a shared database.

At its core, the platform does six things:

1. **Stores and surfaces a persistent database of mentors and startups** across all semesters, so knowledge is never lost when a cohort ends
2. **Lets mentors and startups discover each other** through a searchable, filterable directory with individual profile pages
3. **Gives startups a self-service way to request mentorship sessions** directly from a mentor's profile, reducing the coordination burden on the Almaworks team
4. **Gives the Almaworks team a structured scheduling tool** to approve requests, assign sessions, and publish a semester-wide schedule visible to all participants
5. **Uses AI to match startups with the most compatible mentors** based on expertise tags, availability, and startup goals — and to identify gaps in the current mentor pool for recruiting
6. **Keeps mentors engaged between sessions** through automated post-session emails and a weekly newsletter updating them on startup progress

---

## Who Uses It

### Startups
Founders and teams enrolled in the Almaworks program for the current semester. Startups use the platform to:
- Complete an onboarding form at the start of each semester confirming their availability and what kind of mentor they are looking for
- Browse the full mentor directory across all semesters to find mentors relevant to their needs
- View individual mentor profiles with bio, expertise, company, links, and past mentorship history
- Request a mentorship session directly from a mentor's profile page
- Track the status of their session requests (pending, confirmed, declined)
- View the full semester schedule to see who they are meeting with each week

### Mentors
Experienced professionals who volunteer to mentor startups in the Almaworks program. Mentors use the platform to:
- Complete an onboarding form at the start of each semester confirming which Friday meeting dates they are available and what expertise they want to bring
- View and manage their own profile
- Browse the startup directory to understand the companies in the current cohort
- See their confirmed upcoming and past sessions
- View the full semester schedule

### Almaworks Admin Team
Internal Almaworks staff who run the program. Admins use the platform to:
- Create and manage all mentor and startup accounts
- Trigger onboarding forms at the start of each semester
- View and manage all incoming session requests
- Approve, decline, or reschedule session requests and assign them to specific dates
- Publish and update the semester schedule
- Track outreach to prospective new mentors through a structured pipeline (prospect → contacted → responded → onboarded)
- View AI-generated mentor-startup match recommendations
- View AI-generated gap analysis identifying what kinds of mentors to recruit for the current cohort

---

## Features

### Authentication & Access Control
- Email-based login with magic link (no passwords to manage)
- Role-based access: every user is one of `mentor`, `startup`, or `admin`
- Each role sees a completely different dashboard and navigation
- Row Level Security (RLS) enforced at the database layer — access control is not just UI-deep

### Onboarding Forms
Triggered automatically when a new account is created, and re-triggered at the start of each semester.

**Startup onboarding form collects:**
- Availability across all scheduled Friday meeting dates for the semester
- Mentor preferences in free text ("I want a mentor who is strong in GTM strategy")
- Preferred expertise tags (multi-select: GTM, Fundraising, Product, Biotech, Operations, Legal, etc.)
- Top three goals for the semester
- Startup stage (idea, MVP, growth) and industry

**Mentor onboarding form collects:**
- Availability across all scheduled Friday meeting dates for the semester (checkbox per date)
- Expertise tags (multi-select)
- What they want to bring to mentorship (free text)

Both forms feed directly into the AI matching engine and the session scheduler.

### Mentor Directory
- Full directory of all mentors across all semesters
- Filter by current semester or any past semester, or view all time
- Search by name, company, or expertise
- Filter by one or more expertise tags
- Each mentor card shows name, company, expertise pills, semesters active, and a quick session request button

### Mentor Profile Pages
Each mentor has their own profile page at `/mentors/[slug]` containing:
- Full bio and current role
- Expertise tags
- Links: LinkedIn, personal website, company page
- Mentorship history: which semesters they participated in and which startups they worked with
- A "Request a session" CTA that opens the session request flow

### Session Request Flow
- Startup selects a mentor and submits a request with a topic and preferred meeting dates
- Request appears in the admin dashboard with status: pending
- Admin approves, declines, or reschedules the request
- On confirmation, both mentor and startup are notified (email + optional GCal invite)
- Startup can track all their requests and their current status

### Semester Schedule View
- A single page visible to all logged-in users showing the full semester schedule from start to finish
- Organized week by week, each week showing all sessions with assigned mentor and startup
- The logged-in user's own sessions are highlighted so they can find their slot at a glance
- Sessions can be expanded to show topic and a brief mentor bio snippet
- Admin sees unassigned slots that still need a mentor assigned — other users do not

### Admin Dashboard
- Overview metrics: total mentors, startups, sessions, pending requests
- Full session request management table with filters by status, mentor, and startup
- Schedule manager: approve, assign, and update sessions
- User management: create, edit, and deactivate mentor and startup accounts

### Reach Out Tracker
An internal pipeline tool for the Almaworks team to manage mentor recruiting:
- Log prospective mentors with name, email, LinkedIn, and expertise tags
- Track each prospect through stages: prospect → contacted → responded → onboarded
- Add notes per prospect
- Filter by semester and status
- When a prospect is onboarded, their information pre-fills the mentor profile creation form

### AI Mentor Matching
When a startup submits a session request or the admin wants to find the best mentor for a startup, the AI matching engine:
1. Reads the startup's preferred expertise tags, goals, and available dates
2. Finds all mentors available on those dates
3. Scores each mentor by tag overlap and goal alignment
4. Sends the top candidates to an LLM for a ranked recommendation with reasoning
5. Returns a ranked list the admin can use to assign the session

### AI Gap Analysis
At any point during a semester, the admin can run a gap analysis which:
1. Aggregates all startup expertise needs from their onboarding forms
2. Aggregates all mentor expertise tags in the current cohort
3. Identifies expertise areas where startup demand is not met by the current mentor pool
4. Generates recruiting recommendations: what kind of mentor profiles to target this semester

### Notifications *(Phase 2)*
- Automated post-session email sent to both mentor and startup after each confirmed session
- Weekly newsletter sent to all active mentors updating them on startup progress
- Automatic Google Calendar invite sent to both parties when a session is confirmed

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js + React (TypeScript) | Full-stack web application |
| Database | Supabase (Postgres) | All relational data storage |
| Auth | Supabase Auth | Magic link login, JWT, role management |
| Access control | Supabase RLS | Row-level security policies per role |
| File storage | Supabase Storage | Profile photos, startup logos |
| AI / Edge logic | Supabase Edge Functions | Matching engine, gap analysis |
| Realtime | Supabase Realtime | Live schedule updates |
| Hosting | Vercel | Frontend deployment |
| AI model | OpenAI / Anthropic API | LLM for matching and gap analysis |

---

## Database Schema

The database is anchored to the `semesters` table. Every record that is semester-specific carries a `semester_id` foreign key. This means historical data is never deleted — it stays queryable for the mentor directory and AI gap analysis across all past cohorts.

### Canonical 20-table model

- Program operations: `profiles`, `platform_roles`, `semesters`, `semester_memberships`, `invitations`, `mentor_profiles`, `mentor_semesters`, `startup_organizations`, `startup_semesters`, `startup_team_memberships`, `meetings`, `meeting_availability`, `sessions`, and `program_audit_events`.
- Outreach: `outreach_contacts`, `outreach_companies`, `outreach_contact_companies`, `outreach_opportunities`, `outreach_activities`, and `outreach_imports`.

`profiles.id` is the durable identity. Its nullable `auth_user_id` links only identities that can log in. Roles and semester access come exclusively from `platform_roles` and `semester_memberships`; legacy `profiles.role` and `profiles.semester_id` remain temporarily for safe migration and are never authoritative.

A semester is a cohort term such as Fall 2026. A meeting is one Friday program date. A session is one mentor-startup conversation in slot 1 or 2 during that meeting. Outreach contacts remain independent from program profiles even when the same person appears in both domains.

---

## Project Structure

```
almaworks-platform/
├── CLAUDE.md                        # Repo memory — read this first
├── README.md                        # You are here
├── GETTING_STARTED.md               # Bootstrap instructions for Claude Code
│
├── .claude/
│   ├── skills/
│   │   ├── code-review.md           # PR review checklist
│   │   ├── new-feature.md           # Feature development playbook
│   │   └── db-migration.md          # Database migration procedure
│   └── hooks/
│       ├── pre-commit.sh            # Lint + type check + migration guard
│       └── post-schema-change.sh    # Auto-regenerate Supabase types
│
├── docs/
│   ├── architecture.md              # Full system architecture overview
│   └── adr/
│       ├── 001-supabase-over-custom-backend.md
│       ├── 002-rls-for-role-access.md
│       ├── 003-ai-matching-via-edge-functions.md
│       └── 004-semester-anchor-pattern.md
│
├── src/
│   ├── auth/
│   │   └── CLAUDE.md                # Sharp edge — RLS and role rules
│   ├── db/
│   │   ├── CLAUDE.md                # Sharp edge — migration rules
│   │   └── types.ts                 # Auto-generated Supabase types
│   ├── ai/
│   │   ├── CLAUDE.md                # Sharp edge — all LLM calls live here
│   │   ├── match.ts                 # Mentor matching Edge Function
│   │   ├── gap-analysis.ts          # Gap analysis Edge Function
│   │   └── prompts/                 # Versioned prompt templates
│   ├── api/                         # API route handlers
│   ├── components/                  # Shared React components
│   └── pages/                       # Next.js pages
│
└── supabase/
    ├── migrations/                  # Auto-generated — never hand-edit
    └── seed.sql                     # Local development seed data
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Docker (required for Supabase local development)
- Supabase CLI: `npm install -g supabase`

### 1. Clone the repo
```bash
git clone https://github.com/almaworks/mentor-platform.git
cd mentor-platform
npm install
```

### 2. Set up environment variables
```bash
cp .env.local.example .env.local
```
Fill in your Supabase project URL and anon key. Ask the project lead for the values if you are joining the team.

### 3. Start local Supabase
```bash
supabase start
```
This starts a local Postgres instance, Auth server, and Storage. First run takes a few minutes to pull Docker images.

### 4. Apply the database schema
```bash
supabase db reset
```
This runs all migrations and seeds the database with sample data.

### 5. Generate TypeScript types
```bash
supabase gen types typescript --local > src/db/types.ts
```

### 6. Start the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 7. Verify your setup
Open Claude Code in VS Code, and run:
```
Read CLAUDE.md and tell me what this project does and what the rules are.
```
If Claude Code can accurately describe the platform and the rules, your setup is correct.

---

## Development Workflow

### Before starting any task
1. Read the relevant local `CLAUDE.md` if your task touches `src/auth/`, `src/db/`, or `src/ai/`
2. If adding a new database table, follow `.claude/skills/db-migration.md`
3. If building a new feature, follow `.claude/skills/new-feature.md`

### The non-negotiable rules (summary)
1. Every new table needs `semester_id` — see `docs/adr/004`
2. Never bypass RLS — see `docs/adr/002`
3. Never hand-edit `supabase/migrations/` — use `supabase db diff`
4. All LLM calls go through `src/ai/` only
5. TypeScript strict mode — no `any` types
6. Run `npm run lint` before every commit — the pre-commit hook will block you if you don't

### Submitting a PR
1. Run the code review checklist in `.claude/skills/code-review.md` before opening a PR
2. At least one other team member must review before merging
3. PR title format: `feat: ...` / `fix: ...` / `chore: ...`

### After any schema change
```bash
# Always run this after changing the database schema
supabase gen types typescript --local > src/db/types.ts
# Commit types.ts in the same commit as the migration file
```

---

## Roadmap

### Phase 1 — Foundation *(current)*
- [ ] Next.js project setup + Supabase client
- [ ] Full database schema + RLS policies
- [ ] Auth flow (login + role-based redirect)
- [ ] Mentor and startup onboarding forms
- [ ] Mentor directory + individual profile pages
- [ ] Session request flow
- [ ] Semester schedule page
- [ ] Admin dashboard skeleton

### Phase 2 — Core Admin Tools
- [ ] Schedule manager (approve, assign, track sessions)
- [ ] Reach out tracker (prospect pipeline)
- [ ] AI mentor matching engine
- [ ] AI gap analysis

### Phase 3 — Retention & Notifications *(nice to have)*
- [ ] Post-session auto email
- [ ] Weekly mentor newsletter
- [ ] Google Calendar invite on session confirmation

---

## Team

| Name | Role | Responsibilities |
|---|---|---|
| Siwakorn Komolhiran | Project Manager | Planning, requirements, coordination |
| [Name] | Frontend Dev | React components, pages, UI |
| [Name] | Backend Dev | Supabase schema, RLS, Edge Functions |
| [Name] | Full-Stack Dev | Feature work across both layers |

---

*Built by the Almaworks internal team. For questions, contact the project manager.*
