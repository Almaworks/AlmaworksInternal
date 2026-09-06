# Shared Expertise Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile matching of free-form string arrays with a shared, self-extending expertise-tag catalog that mentors and startups can use without administrator intervention.

**Architecture:** A global canonical tag catalog and alias table hold normalized vocabulary; durable mentor assignments and semester-scoped startup-need assignments reference canonical tag IDs. Authenticated API routes use the caller’s RLS-scoped Supabase client to search, create, and attach tags. Existing screens use one shared picker; matching and gap analysis consume canonical IDs while legacy arrays are backfilled and then no longer used for matching.

**Tech Stack:** Next.js 16, React 19, TypeScript strict mode, Supabase Postgres/RLS, Supabase CLI migrations, Node test runner, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-06-shared-expertise-tags-design.md`

## Global Constraints

- Use only Supabase project `layjdjfvxkowxidwuvbs`; verify the project ref immediately before every remote operation.
- Generate schema migrations with `supabase db diff`; do not hand-edit migration files.
- Keep all RLS enabled and authorize through membership/profile ownership; never expose a service-role key to browser code.
- Global `expertise_tags`, aliases, and durable mentor-tag assignments are documented exemptions from `semester_id`; startup need assignments have non-null `semester_id`.
- Normalize names case-insensitively and whitespace/hyphen-insensitively; never silently merge a close result chosen by a user.
- A custom tag created by an eligible participant is immediately available to all tag searches.

---

### Task 1: Canonical tag schema, ownership rules, and data backfill

**Files:**
- Modify: `docs/architecture/identity-membership.md`
- Modify: `supabase/schemas/canonical_schema.sql`
- Create: generated `supabase/migrations/*_shared_expertise_tags.sql`
- Create: `supabase/tests/database/shared_expertise_tags.test.sql`
- Modify: `src/db/types.ts` via `supabase gen types typescript --local`

**Interfaces:**
- Produces `public.expertise_tags(id, name, normalized_name, created_by_profile_id, created_at, updated_at)`.
- Produces `public.expertise_tag_aliases(id, expertise_tag_id, normalized_alias)`.
- Produces `public.mentor_expertise_tags(mentor_profile_id, expertise_tag_id)` and `public.startup_mentor_need_tags(startup_semester_id, semester_id, expertise_tag_id, priority)`.
- Produces unique canonical/alias normalization and indexes for autocomplete.

- [ ] **Step 1: Write the failing pgTAP contract and RLS tests**

```sql
select ok(to_regclass('public.expertise_tags') is not null, 'shared tag catalog exists');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.startup_mentor_need_tags'::regclass
      and pg_get_constraintdef(oid) like '%semester_id%semesters%'
  ),
  'startup needs are semester-scoped'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.expertise_tags(name, normalized_name, created_by_profile_id)
    values ('Go-to-market', 'go to market', 'd2000000-0000-0000-0000-000000000002')$$,
  'an eligible participant can create a shared tag'
);
select throws_ok(
  $$insert into public.mentor_expertise_tags(mentor_profile_id, expertise_tag_id)
    values ('d2000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'a mentor cannot attach a tag to another mentor profile'
);
```

- [ ] **Step 2: Run the database test to verify it fails**

Run: `npm exec supabase -- test db --local supabase/tests/database/shared_expertise_tags.test.sql`

Expected: FAIL because the catalog and assignment tables do not exist.

- [ ] **Step 3: Apply the schema locally and generate a migration**

Create tables with UUID keys, unique `normalized_name` and `normalized_alias`, a check for startup priority `1..2`, and `semester_id` consistency through the startup-semester foreign key. Add `created_by_profile_id` and ownership/admin RLS policies. Backfill normalized unique values from the three legacy string arrays, then populate mentor and startup joins while preserving primary/secondary order. Document why global catalog and durable mentor assignments omit `semester_id`.

```sql
create table public.expertise_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null unique,
  created_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Run local DDL with `supabase db query --local`, then generate the migration with:

```powershell
npm exec supabase -- db diff --local --file shared_expertise_tags
```

- [ ] **Step 4: Regenerate types and run the database test**

Run:

```powershell
supabase gen types typescript --local > src/db/types.ts
npm exec supabase -- test db --local supabase/tests/database/shared_expertise_tags.test.sql
```

Expected: PASS; the test proves the catalog exists, startup tags remain cohort-scoped, and RLS permits only owned assignments.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add docs/architecture/identity-membership.md supabase/schemas/canonical_schema.sql supabase/migrations src/db/types.ts supabase/tests/database/shared_expertise_tags.test.sql
git commit -m "feat: add shared expertise tag schema"
```

### Task 2: Normalization and ranked suggestion domain

**Files:**
- Create: `src/expertise-tags/domain.ts`
- Create: `tests/expertise-tags/domain.test.mts`

**Interfaces:**
- Produces `normalizeTagName(value: string): string`.
- Produces `tagSearchTerms(name: string): readonly string[]`.
- Produces `rankTagSuggestions(query: string, tags: readonly ExpertiseTagSearchRow[]): readonly TagSuggestion[]`.
- `TagSuggestion` is `{ id: string; name: string; score: number; reason: "exact" | "prefix" | "alias" | "acronym" | "fuzzy" }`.

- [ ] **Step 1: Write failing domain tests**

```ts
test('normalizes punctuation and whitespace variants', () => {
  assert.equal(normalizeTagName('  Go-to-market '), 'go to market');
  assert.equal(normalizeTagName('GO   TO market'), 'go to market');
});

test('ranks a generated acronym above a fuzzy result', () => {
  const results = rankTagSuggestions('gtm', [
    { id: 'go', name: 'Go-to-market', aliases: [] },
    { id: 'growth', name: 'Growth strategy', aliases: [] },
  ]);
  assert.deepEqual(results[0], { id: 'go', name: 'Go-to-market', score: 900, reason: 'acronym' });
});

test('does not treat a close typo as an automatic replacement', () => {
  assert.equal(rankTagSuggestions('fundraizing', [{ id: 'fund', name: 'Fundraising strategy', aliases: [] }])[0]?.reason, 'fuzzy');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-strip-types --test tests/expertise-tags/domain.test.mts`

Expected: FAIL because the expertise-tags domain module does not exist.

- [ ] **Step 3: Implement deterministic normalization and ranking**

Implement Unicode-safe lowercase/trim/collapsed separators; generate acronym terms from normalized words; rank exact > prefix > alias > acronym > bounded edit-distance fuzzy. Return a new-tag candidate only when the query is non-empty and no exact normalized tag exists. Keep fuzzy matching advisory only; it never mutates assignments.

```ts
export function tagSearchTerms(name: string): readonly string[] {
  const words = normalizeTagName(name).split(' ').filter(Boolean);
  return [...new Set([words.join(' '), words.map((word) => word[0]).join('')])];
}
```

- [ ] **Step 4: Run the domain test**

Run: `node --experimental-strip-types --test tests/expertise-tags/domain.test.mts`

Expected: PASS.

- [ ] **Step 5: Commit the domain slice**

```powershell
git add src/expertise-tags/domain.ts tests/expertise-tags/domain.test.mts
git commit -m "feat: rank shared expertise tag suggestions"
```

### Task 3: RLS-scoped tag search, creation, and assignment API

**Files:**
- Create: `src/expertise-tags/server.ts`
- Create: `app/api/expertise-tags/route.ts`
- Create: `app/api/expertise-tags/mentor/route.ts`
- Create: `app/api/expertise-tags/startup-needs/route.ts`
- Create: `tests/expertise-tags/http.test.mts`

**Interfaces:**
- `GET /api/expertise-tags?q=<query>` returns `{ suggestions: TagSuggestion[]; create: { name: string } | null }`.
- `POST /api/expertise-tags/mentor` accepts `{ tag: { id?: string; name?: string } }` and attaches the canonical/new tag to the caller’s mentor profile.
- `POST /api/expertise-tags/startup-needs` accepts `{ startupSemesterId: string; tags: Array<{ id?: string; name?: string; priority: 1 | 2 }> }` and replaces only the caller’s owned startup needs for that semester.
- `createOrFindTag(client, profileId, rawName)` returns `{ id: string; name: string }` and handles unique-conflict retries without service-role access.

- [ ] **Step 1: Write failing API tests**

```ts
test('search returns Go-to-market for GTM', async () => {
  const response = await handlers.GET(new Request('https://almaworks.test/api/expertise-tags?q=gtm'));
  assert.deepEqual(await response.json(), {
    suggestions: [{ id: 'tag-go', name: 'Go-to-market', score: 900, reason: 'acronym' }],
    create: { name: 'gtm' },
  });
});

test('mentor attach writes only through the authenticated profile', async () => {
  const result = await attachMentorTag(fakeRlsClient, 'profile-1', { name: 'Healthcare reimbursement' });
  assert.equal(result.name, 'Healthcare reimbursement');
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `node --experimental-strip-types --test tests/expertise-tags/http.test.mts`

Expected: FAIL because the routes and server adapter do not exist.

- [ ] **Step 3: Implement the server adapter and routes**

Use `requireAuthenticatedUserWithRls` to resolve the durable profile ID. Search only readable catalog rows. On creation, insert normalized name and inferred acronym alias; if unique insert conflicts, select and use the winner. For startup needs, verify the caller is an assigned startup team member in the supplied semester before replacing priority rows. Return field-level validation messages for blank names, duplicate priorities, and unauthorized startup IDs.

- [ ] **Step 4: Run API tests and lint**

Run:

```powershell
node --experimental-strip-types --test tests/expertise-tags/http.test.mts
npx eslint src/expertise-tags/server.ts app/api/expertise-tags tests/expertise-tags/http.test.mts
```

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the API slice**

```powershell
git add src/expertise-tags app/api/expertise-tags tests/expertise-tags/http.test.mts
git commit -m "feat: add shared expertise tag API"
```

### Task 4: Shared tag picker and participant surfaces

**Files:**
- Create: `components/ExpertiseTagPicker.tsx`
- Create: `tests/expertise-tags/picker.test.mts`
- Modify: `app/dashboard/onboarding/onboarding-flow.tsx`
- Modify: `components/mentor-needs/MentorNeedsForm.tsx`
- Modify: `app/dashboard/participant/ParticipantDashboard.tsx`
- Modify: `app/dashboard/admin/mentors/page.tsx`

**Interfaces:**
- `ExpertiseTagPicker` accepts `value: readonly SelectedExpertiseTag[]`, `onChange(next)`, `mode: "mentor" | "startup-needs"`, and `maxSelections?: number`.
- The picker calls `GET /api/expertise-tags`, renders suggestion reason text for fuzzy matches, and renders an explicit `Create “…”` action only when the user selects it.
- Startup mode restricts selections to two priority-ranked values; mentor mode allows multiple values.

- [ ] **Step 1: Write failing picker tests**

```ts
test('shows Go-to-market as the GTM suggestion', () => {
  const state = pickerPresentation({ query: 'gtm', suggestions: [goToMarket], selected: [] });
  assert.equal(state.options[0]?.label, 'Go-to-market');
  assert.equal(state.options[0]?.reason, 'Matches “GTM”');
});

test('requires an explicit action before creating a close tag', () => {
  const state = pickerPresentation({ query: 'fundraizing', suggestions: [fundraising], selected: [] });
  assert.equal(state.createOption.label, 'Create “fundraizing”');
  assert.equal(state.options[0]?.reason, 'Similar to your search');
});
```

- [ ] **Step 2: Run the picker test to verify it fails**

Run: `node --experimental-strip-types --test tests/expertise-tags/picker.test.mts`

Expected: FAIL because the shared picker presentation does not exist.

- [ ] **Step 3: Implement the picker and replace existing tag inputs**

Use debounced API search, accessible listbox semantics, keyboard selection, visible selected chips, and explicit-create copy. Retain primary/secondary order in the Mentor Needs form. Route mentor saves through the mentor API and startup saves through startup-needs API; remove direct string-array writes from these surfaces.

- [ ] **Step 4: Run focused tests, lint, and visual checks**

Run:

```powershell
node --experimental-strip-types --test tests/expertise-tags/picker.test.mts tests/lifecycle/onboarding.test.mts tests/mentor-needs/mentor-needs.test.mts
npx eslint components/ExpertiseTagPicker.tsx app/dashboard/onboarding/onboarding-flow.tsx components/mentor-needs/MentorNeedsForm.tsx app/dashboard/participant/ParticipantDashboard.tsx app/dashboard/admin/mentors/page.tsx
```

Inspect locally at desktop and narrow widths: onboarding mentor expertise, startup Mentor Needs, and participant profile. Verify no clipped listbox, that `GTM` suggests `Go-to-market`, and that the explicit create action remains readable.

- [ ] **Step 5: Commit the UI slice**

```powershell
git add components/ExpertiseTagPicker.tsx app/dashboard/onboarding/onboarding-flow.tsx components/mentor-needs/MentorNeedsForm.tsx app/dashboard/participant/ParticipantDashboard.tsx app/dashboard/admin/mentors/page.tsx tests/expertise-tags/picker.test.mts
git commit -m "feat: use shared expertise picker across participants"
```

### Task 5: Canonical tag matching, dashboard reads, and legacy-field retirement

**Files:**
- Modify: `src/assignments/server.ts`
- Modify: `src/assignments/picker.ts`
- Modify: `src/mentor-needs/repository.ts`
- Modify: `app/api/participant-dashboard/route.ts`
- Modify: `src/ai/match.ts` and `src/ai/gap-analysis.ts` if present
- Modify: `tests/assignments/http.test.mts`
- Modify: `tests/mentor-needs/mentor-needs.test.mts`

**Interfaces:**
- Candidate data exposes `expertiseTagIds: string[]` and startup `mentorNeedTagIds: Array<{ id: string; priority: 1 | 2 }>`.
- `needsForRanking` derives primary/secondary by priority and does not read `preferred_expertise_tags`.
- Gap-board demand/supply grouping uses canonical IDs but presents the canonical tag name.

- [ ] **Step 1: Write failing matching and gap-analysis tests**

```ts
test('a GTM alias and Go-to-market expertise resolve to one matching tag ID', () => {
  const ranked = rankCandidates({ mentorNeedTagIds: [{ id: 'go', priority: 1 }], mentors: [{ expertiseTagIds: ['go'] }] });
  assert.equal(ranked[0]?.matchScore, 1);
});

test('legacy preferred expertise tags do not affect canonical ranking', () => {
  const needs = needsForRanking({ mentorNeedTags: [], preferredExpertiseTags: ['Legacy only'] });
  assert.deepEqual(needs.supplementalNeeds, []);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
node --experimental-strip-types --test tests/assignments/http.test.mts tests/mentor-needs/mentor-needs.test.mts
```

Expected: FAIL because candidate and board sources still use legacy string arrays.

- [ ] **Step 3: Move readers to canonical joins**

Load tag joins with explicit semester filtering. Replace array concatenation/exact string overlap with ID overlap. Keep legacy fields only for one-release compatibility reads, but do not write or rank from `preferred_expertise_tags`. Update API response types and participant dashboard projections to return canonical tag names/IDs.

- [ ] **Step 4: Run focused and full tests**

Run:

```powershell
npm test
npm run lint
```

Expected: PASS. If the pre-existing generated-route TypeScript issue remains, report it separately; do not alter unrelated generated files.

- [ ] **Step 5: Commit the matching slice**

```powershell
git add src/assignments src/mentor-needs app/api/participant-dashboard tests/assignments/http.test.mts tests/mentor-needs/mentor-needs.test.mts
git commit -m "feat: match mentors and startups by shared tag IDs"
```

### Task 6: Remote deployment and acceptance verification

**Files:**
- Modify: generated migration history only through Supabase CLI repair after successful remote SQL application.

**Interfaces:**
- Remote project has the generated schema migration applied and recorded.

- [ ] **Step 1: Verify the remote project target**

Run:

```powershell
$ref = Get-Content supabase/.temp/project-ref
if ($ref -ne 'layjdjfvxkowxidwuvbs') { throw "Unexpected Supabase project: $ref" }
```

Expected: `layjdjfvxkowxidwuvbs`.

- [ ] **Step 2: Apply the generated migration in order**

Run only after Step 1 passes:

```powershell
$migration = Get-ChildItem supabase/migrations/*_shared_expertise_tags.sql | Select-Object -Single
if ($null -eq $migration) { throw "Shared-tag migration was not generated." }
$version = $migration.BaseName.Split('_')[0]
npm exec supabase -- db query --linked --project-ref layjdjfvxkowxidwuvbs --file $migration.FullName
npm exec supabase -- migration repair --linked --project-ref layjdjfvxkowxidwuvbs --status applied $version
```

- [ ] **Step 3: Verify remote catalog/RLS state with read-only SQL**

```sql
select to_regclass('public.expertise_tags') is not null as catalog_exists;
select has_table_privilege('authenticated', 'public.expertise_tags', 'select') as catalog_readable;
select exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'startup_mentor_need_tags'
) as startup_assignments_rls_protected;
```

Expected: all values are `true`.

- [ ] **Step 4: Perform the browser acceptance pass**

Verify as a mentor that typing `gtm` suggests `Go-to-market`, selecting it persists after refresh, and creating `Healthcare reimbursement` makes it appear in startup Mentor Needs. Verify a startup can rank two needs and an unrelated user cannot alter either assignment.

- [ ] **Step 5: Report deployment and verification results**

Report the generated migration path, successful local/remote tests, browser states verified, and any unrelated check blockers.
