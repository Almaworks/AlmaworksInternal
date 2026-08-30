## Project: AlmaworksInternal — Full Feature Sprint

CRITICAL SAFETY CONSTRAINT: ALL database operations MUST use ONLY
project_id: layjdjfvxkowxidwuvbs (AlmaworksInternal). NEVER touch any other project.

OUTREACH TABLE
- [ ] Separate linkedin and email columns with one-click copy buttons
- [ ] Fields: outreach_type, date_of_last_contact, description, last_contacted_by, ocl
- [ ] Existing data migrated with no data loss
- [ ] Outreach type filterable/sortable
- [ ] Pie chart showing team needs by startup

MENTORS TABLE
- [ ] Separate linkedin and email columns with one-click copy buttons
- [ ] Mentor profiles: name, photo, linkedin, description, email
- [ ] Session tag field (S25, F25, S26) sortable/filterable
- [ ] Onboarding form wired to Supabase
- [ ] Mentor inbox page
- [ ] Mentor calendar page
- [ ] Mentor directory with request-a-mentor flow

STARTUPS TABLE
- [ ] Session tag field sortable/filterable

SCHEDULING TAB
- [ ] Grid layout: dates/times on Y-axis, companies on X-axis
- [ ] Cells show which mentors met which startup per session

RESOURCES TAB
- [ ] Resources tab in navigation
- [ ] Template emails: intro outreach, follow-up, mentor invite

GMAIL INTEGRATION
- [ ] Gmail OAuth flow in app settings
- [ ] Send outreach emails from within app
- [ ] Auto-log date_of_last_contact and last_contacted_by on send

DISTINCT SESSIONS
- [ ] No duplicate session records
- [ ] Session tags display correctly across all tables

VERIFICATION
1. Zero test regressions
2. Supabase project ID layjdjfvxkowxidwuvbs confirmed in all migrations
3. Outreach row count matches before and after migration
4. Copy buttons work for linkedin and email in both tables
5. Scheduling grid renders correctly
6. Session tag filter works across all tables