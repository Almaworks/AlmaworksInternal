# Sprint Progress

## Session 1 — 2026-06-03

### Status Assessment
Already done before this sprint:
- [x] Outreach: separate linkedin/email columns with one-click copy
- [x] Outreach: outreach_type, last_contacted_at, notes, who_reached_out, source_channel fields
- [x] Outreach: status filter (prospect/contacted/responded/onboarded)
- [x] Outreach: pie/donut chart for team needs by startup
- [x] Outreach: bulk status update
- [x] Mentors admin: separate linkedin/email columns with one-click copy
- [x] Mentors admin: profiles with name, linkedin, bio, email, tags
- [x] Schedule: grid layout dates/times on Y-axis, companies on X-axis (in admin overview)
- [x] Schedule: cells show mentor per session per startup

### This Session — Completed
- [x] Resources tab: created /dashboard/resources page with template emails
- [x] Resources tab: added to admin navigation in layout.tsx
- [x] Outreach: added outreach_type dropdown filter
- [x] Mentor directory: replaced broken /dashboard/mentors page with proper card grid
- [x] Mentor directory: expertise tag filter, search
- [x] Mentor directory: request-a-mentor flow for startup users
- [x] Mentor inbox: created /dashboard/mentor/inbox page for pending session requests
- [x] Mentor inbox: added Inbox nav item to mentor navigation
- [x] Admin mentors page: semester/tag filter dropdown added
- [x] Admin startups tab: semester filter + search added

### Still Remaining (Next Session)
- [ ] MENTORS TABLE: Session tag field (S25, F25, S26) sortable/filterable — currently filters by full semester name; short-tag format depends on how semesters are named in DB
- [ ] MENTORS TABLE: Onboarding form wired to Supabase — unclear scope; admin can already add mentors manually
- [ ] MENTORS TABLE: Mentor calendar page — separate /dashboard/mentor/calendar page (mentor dashboard has inline calendar already)
- [ ] STARTUPS TABLE: Session tag sortable/filterable — added semester filter, but sort isn't in table header yet
- [ ] GMAIL INTEGRATION: Gmail OAuth flow, send emails, auto-log contact — complex, needs OAuth setup
- [ ] DISTINCT SESSIONS: No duplicate session records — needs unique constraint migration
- [ ] VERIFICATION: Run through all verification checklist items

## NEXT SESSION
Pick up from:
1. Mentor calendar page — add /dashboard/mentor/calendar/page.tsx with a full calendar view and add to mentor nav
2. Startup session tag sort — make startups table sortable by semester_name
3. Distinct sessions — add unique constraint on (mentor_id, startup_id, session_date_id) via supabase db diff
4. Gmail integration — research OAuth approach; consider Resend as simpler alternative
5. Onboarding form — clarify what "wired to Supabase" means vs current manual flow
