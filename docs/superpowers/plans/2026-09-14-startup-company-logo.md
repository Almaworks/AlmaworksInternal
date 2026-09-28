# Startup Company Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let assigned startup participants upload, replace, remove, and see their shared company logo from Startup Profile, while making the Stage select full width.

**Architecture:** Add a private organization-owned `startup-logos` Storage bucket and nullable `startup_organizations.logo_path`, with access governed by existing membership relationships plus explicit Storage RLS. A dedicated service uses versioned paths and compare-and-swap updates, while dashboard projection resolves short-lived signed URLs and preserves `logo_url` as a safe HTTPS fallback.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Supabase Postgres/RLS/Storage, Sharp, Node test runner, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-14-startup-company-logo-design.md`

## Global Constraints

- Operate only on Supabase project `layjdjfvxkowxidwuvbs`; verify this exact reference before every remote operation.
- Never bypass RLS or use service-role access for participant logo operations.
- Never hand-edit `supabase/migrations/`; generate the migration with `supabase db diff`.
- Accept only JPEG, PNG, and WebP inputs no larger than 4 MiB or 50 million decoded pixels; normalize to at most 1024 x 1024 without enlargement.
- Store versioned private paths shaped as `<organization-id>/<uuid>.<jpg|png|webp>` and never persist signed URLs.
- Preserve `startup_organizations.logo_url` as the rollout fallback.
- Preserve unrelated worktree and index changes. Capture the staged-path list before each task commit and use path-limited commits.
- Run `npm.cmd run lint` before every commit; if full lint fails only on existing generated artifacts, record the exact blocker and run ESLint on the changed TypeScript/TSX files.
- Do not deploy, create a hosted bucket, migrate production, or upload real participant images without separate authorization.

---

### Task 1: Shared image processor and startup-logo domain service

**Files:**
- Create: `src/profile-images/process-profile-image.ts`
- Modify: `src/profile-photos/profile-photos.ts`
- Create: `src/startup-logos/startup-logos.ts`
- Create: `src/startup-logos/urls.ts`
- Modify: `tests/profile-photos/profile-photos.test.mts`
- Create: `tests/startup-logos/startup-logos.test.mts`

**Interfaces:**
- Produces: `processProfileImage(file: File, subject: "Profile photos" | "Startup logos"): Promise<{ extension: "jpg" | "png" | "webp"; file: File }>`.
- Produces: `StartupLogoRepository`, `StartupLogoState`, `StartupLogoError`, and `createStartupLogoService(repository, randomId?)`.
- Produces: `STARTUP_LOGO_BUCKET`, `STARTUP_LOGO_URL_TTL_SECONDS`, and `createStartupLogoUrlResolver(client)`.

- [ ] **Step 1: Write the failing shared-processor and startup-logo tests**

Move the existing image fixtures into the relevant test files and add these behavior assertions:

```ts
const ORGANIZATION_ID = "40000000-0000-0000-0000-000000000001";

test("uploads a processed startup logo to a versioned organization path", async () => {
  const uploads: Array<{ path: string; type: string }> = [];
  const writes: Array<{ expected: string | null; next: string | null }> = [];
  const service = createStartupLogoService(repository({
    upload: async (path, file) => { uploads.push({ path, type: file.type }); },
    replacePath: async (_organizationId, expected, next) => { writes.push({ expected, next }); return true; },
  }), () => "50000000-0000-0000-0000-000000000002");

  const result = await service.upload(PROFILE_ID, png());
  const path = `${ORGANIZATION_ID}/50000000-0000-0000-0000-000000000002.png`;
  assert.deepEqual(uploads, [{ path, type: "image/png" }]);
  assert.deepEqual(writes, [{ expected: null, next: path }]);
  assert.deepEqual(result, { logoUrl: `https://signed.test/${path}` });
});

test("rejects a participant without an active assigned startup", async () => {
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: false, organizationId: null, logoPath: null, legacyLogoUrl: null }),
  }));
  await assert.rejects(
    service.upload(PROFILE_ID, png()),
    (error: unknown) => error instanceof StartupLogoError && error.status === 403,
  );
});

test("a concurrent replacement deletes only the new object", async () => {
  const removed: string[][] = [];
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: `${ORGANIZATION_ID}/old.jpg`, legacyLogoUrl: null }),
    replacePath: async () => false,
    remove: async (paths) => { removed.push(paths); },
  }), () => "50000000-0000-0000-0000-000000000002");

  await assert.rejects(service.upload(PROFILE_ID, png()), (error: unknown) => error instanceof StartupLogoError && error.status === 409);
  assert.deepEqual(removed, [[`${ORGANIZATION_ID}/50000000-0000-0000-0000-000000000002.png`]]);
});

test("removal clears the managed path and returns the HTTPS rollout fallback", async () => {
  const events: string[] = [];
  const service = createStartupLogoService(repository({
    loadForProfile: async () => ({ eligible: true, organizationId: ORGANIZATION_ID, logoPath: `${ORGANIZATION_ID}/old.jpg`, legacyLogoUrl: "https://legacy.test/logo.png" }),
    replacePath: async (_organizationId, expected, next) => { events.push(`replace:${expected}:${next}`); return true; },
    remove: async (paths) => { events.push(`remove:${paths.join(",")}`); },
  }));

  assert.deepEqual(await service.remove(PROFILE_ID), { logoUrl: "https://legacy.test/logo.png" });
  assert.deepEqual(events, [`replace:${ORGANIZATION_ID}/old.jpg:null`, `remove:${ORGANIZATION_ID}/old.jpg`]);
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/profile-photos/profile-photos.test.mts tests/startup-logos/startup-logos.test.mts
```

Expected: FAIL because `process-profile-image.ts`, `startup-logos.ts`, and `urls.ts` do not exist.

- [ ] **Step 3: Implement the shared processor and domain service**

Extract the current Sharp validation and normalization into the shared processor while keeping `PROFILE_PHOTO_MAX_BYTES` as an exported alias for compatibility. Define the startup service around this exact contract:

```ts
export interface StartupLogoState {
  eligible: boolean;
  organizationId: string | null;
  logoPath: string | null;
  legacyLogoUrl: string | null;
}

export interface StartupLogoRepository {
  loadForProfile(profileId: string): Promise<StartupLogoState>;
  upload(path: string, file: File): Promise<void>;
  sign(path: string): Promise<string>;
  replacePath(organizationId: string, expectedPath: string | null, nextPath: string | null): Promise<boolean>;
  remove(paths: string[]): Promise<void>;
}

async function requireEligible(repository: StartupLogoRepository, profileId: string) {
  const state = await repository.loadForProfile(profileId);
  if (!state.eligible || !state.organizationId) {
    throw new StartupLogoError("An active assigned startup membership is required.", 403);
  }
  return { ...state, organizationId: state.organizationId };
}

function isManagedLogoPath(organizationId: string, path: string | null): path is string {
  if (!path?.startsWith(`${organizationId}/`)) return false;
  return /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/u.test(path.slice(organizationId.length + 1));
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function cleanup(repository: StartupLogoRepository, paths: string[]): Promise<void> {
  try { await repository.remove(paths); } catch { /* Private orphan remains inaccessible. */ }
}

export function createStartupLogoService(
  repository: StartupLogoRepository,
  randomId: () => string = () => crypto.randomUUID(),
) {
  return {
    async upload(profileId: string, file: File): Promise<{ logoUrl: string }> {
      const state = await requireEligible(repository, profileId);
      const processed = await processProfileImage(file, "Startup logos");
      const path = `${state.organizationId}/${randomId()}.${processed.extension}`;
      await repository.upload(path, processed.file);
      let logoUrl: string;
      try { logoUrl = await repository.sign(path); }
      catch (cause) { await cleanup(repository, [path]); throw cause; }
      let replaced: boolean;
      try { replaced = await repository.replacePath(state.organizationId, state.logoPath, path); }
      catch (cause) { await cleanup(repository, [path]); throw cause; }
      if (!replaced) {
        await cleanup(repository, [path]);
        throw new StartupLogoError("The startup logo changed while this upload was running. Please try again.", 409);
      }
      if (isManagedLogoPath(state.organizationId, state.logoPath)) await cleanup(repository, [state.logoPath]);
      return { logoUrl };
    },
    async remove(profileId: string): Promise<{ logoUrl: string | null }> {
      const state = await requireEligible(repository, profileId);
      const replaced = await repository.replacePath(state.organizationId, state.logoPath, null);
      if (!replaced) throw new StartupLogoError("The startup logo changed while this removal was running. Please try again.", 409);
      if (isManagedLogoPath(state.organizationId, state.logoPath)) await cleanup(repository, [state.logoPath]);
      return { logoUrl: safeHttpsUrl(state.legacyLogoUrl) };
    },
  };
}
```

Keep these helpers private to the service file.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2. Expected: all existing personal-photo tests and all startup-logo tests PASS.

- [ ] **Step 5: Run scoped lint and commit only Task 1 files**

```powershell
npx.cmd eslint src/profile-images/process-profile-image.ts src/profile-photos/profile-photos.ts src/startup-logos/startup-logos.ts src/startup-logos/urls.ts tests/profile-photos/profile-photos.test.mts tests/startup-logos/startup-logos.test.mts
git diff --check -- src/profile-images/process-profile-image.ts src/profile-photos/profile-photos.ts src/startup-logos/startup-logos.ts src/startup-logos/urls.ts tests/profile-photos/profile-photos.test.mts tests/startup-logos/startup-logos.test.mts
```

Run `npm.cmd run lint`, record any unrelated generated-artifact failures, stage only new Task 1 files, and use:

```powershell
git commit --only -m "feat: add startup logo image service" -- src/profile-images/process-profile-image.ts src/profile-photos/profile-photos.ts src/startup-logos/startup-logos.ts src/startup-logos/urls.ts tests/profile-photos/profile-photos.test.mts tests/startup-logos/startup-logos.test.mts
```

---

### Task 2: Declarative schema, Storage RLS, and generated migration

**Files:**
- Modify: `supabase/schemas/canonical_schema.sql`
- Modify: `supabase/schemas/zz_security.sql`
- Modify: `supabase/config.toml`
- Modify: `tests/database-revamp/canonical-schema.test.mts`
- Create: `supabase/tests/database/startup_logos.test.sql`
- Generate: `supabase/migrations/*_startup_company_logo.sql` using CLI only; use the filename emitted by `supabase db diff`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Produces: nullable `startup_organizations.logo_path text` constrained to an organization-owned versioned image path.
- Produces: authenticated column-level `UPDATE (logo_path)` plus consolidated `storage.objects` SELECT/INSERT/DELETE policies covering both managed-image buckets.
- Produces: private `startup-logos` bucket configuration with a 4 MiB limit and three allowed MIME types.

- [ ] **Step 1: Add failing schema-contract assertions**

Extend the canonical schema test with exact assertions:

```ts
test("startup organizations store constrained private logo paths", () => {
  const start = source.indexOf("create table if not exists public.startup_organizations");
  const table = source.slice(start, source.indexOf(";", start));
  assert.match(table, /logo_path text/u);
  assert.match(table, /startup_organizations_logo_path_check/u);
  assert.match(source, /grant update \(name, industry, description, website_url, logo_path\) on table public\.startup_organizations to authenticated/u);
  assert.match(source, /bucket_id = 'startup-logos'/u);
  assert.match(source, /startup_team_memberships/u);
});
```

Add pgTAP cases proving: an assigned active startup member can update only their organization path and insert/delete only in that organization folder; a cohort peer can read the signed object metadata but cannot modify it; an unrelated or inactive member cannot read or write it; invalid path shapes fail the check constraint.

- [ ] **Step 2: Run schema tests and verify RED**

```powershell
node --experimental-strip-types --test tests/database-revamp/canonical-schema.test.mts
```

Expected: FAIL because `logo_path`, its grant, and the `startup-logos` policy branches are absent.

- [ ] **Step 3: Update declarative schema and bucket configuration**

Add the organization column and constraint:

```sql
"logo_path" "text",
CONSTRAINT "startup_organizations_logo_path_check" CHECK (
  "logo_path" IS NULL OR
  "logo_path" ~ (('^'::"text" || ("id")::"text") || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'::"text")
)
```

Extend the existing consolidated Storage policies with an `OR` branch for `startup-logos`; do not create a second policy for the same Storage operation because the repository enforces one consolidated policy per table/action. Every write branch must join active `semesters`, `startup_semesters`, `startup_team_memberships`, and `semester_memberships`, compare the first path folder to `startup_organization_id`, resolve the current profile through `private.current_profile_id((SELECT auth.uid()))`, and allow only `onboarding` or `active` startup memberships.

Add the private bucket:

```toml
[storage.buckets.startup-logos]
public = false
file_size_limit = "4MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp"]
```

- [ ] **Step 4: Verify static schema GREEN, then generate and verify the migration**

```powershell
node --experimental-strip-types --test tests/database-revamp/canonical-schema.test.mts
npx.cmd supabase --version
npx.cmd supabase db diff --help
npx.cmd supabase db diff -f startup_company_logo
npx.cmd supabase gen types typescript --local
npx.cmd supabase migration list --local
```

Write generated types to a temporary file, inspect it, then replace `src/db/types.ts` with the CLI output through the established repository workflow. If Docker/local Supabase is unavailable, stop this task at the migration/type generation step and report the concrete blocker; never create the migration by hand.

- [ ] **Step 5: Run the local database test**

```powershell
npx.cmd supabase test db supabase/tests/database/startup_logos.test.sql
```

Expected: pgTAP PASS for column privilege, path constraint, assigned-member write, peer read, cross-organization denial, inactive denial, and bucket restrictions.

- [ ] **Step 6: Run scoped checks and commit only Task 2 files**

Run migration safety, the static schema test, `git diff --check` on Task 2 paths, and repository-mandated lint. Commit with a path-limited commit containing only the declarative schema, security grants, bucket config, generated migration, generated types, and their tests.

---

### Task 3: Supabase repository and authenticated API route

**Files:**
- Create: `src/startup-logos/supabase-repository.ts`
- Create: `app/api/startup-logo/route.ts`
- Create: `tests/startup-logos/supabase-repository.test.mts`
- Create: `tests/startup-logos/startup-logo-route.test.mts`

**Interfaces:**
- Consumes: `StartupLogoRepository` and `createStartupLogoService` from Task 1.
- Consumes: `Database.startup_organizations.logo_path` from Task 2.
- Produces: `createSupabaseStartupLogoRepository(client): StartupLogoRepository`.
- Produces: authenticated `POST /api/startup-logo` and `DELETE /api/startup-logo` responses shaped as `{ logoUrl: string | null }` or `{ error: string }`.

- [ ] **Step 1: Write failing repository and route tests**

The repository test must assert the exact lookup sequence and filters: active semester; caller profile's startup membership with status `onboarding|active`; matching `startup_team_memberships`; matching `startup_semesters`; then organization `logo_path,logo_url`. It must also assert compare-and-swap behavior:

```ts
test("replacePath updates only the observed organization logo path", async () => {
  const client = fakeClient({ organizationId: ORGANIZATION_ID, currentPath: null });
  const repository = createSupabaseStartupLogoRepository(client);
  assert.equal(await repository.replacePath(ORGANIZATION_ID, null, `${ORGANIZATION_ID}/${VERSION}.png`), true);
  assert.deepEqual(client.updates, [{ table: "startup_organizations", values: { logo_path: `${ORGANIZATION_ID}/${VERSION}.png` }, filters: [["id", ORGANIZATION_ID], ["is", "logo_path", null]] }]);
});
```

The route test must prove it passes only the authenticated `profileId` to the service, rejects multipart payloads without exactly one `file`, maps `StartupLogoError` statuses, and enforces the content-length guard before parsing form data.

- [ ] **Step 2: Run tests and verify RED**

```powershell
node --experimental-strip-types --test tests/startup-logos/supabase-repository.test.mts tests/startup-logos/startup-logo-route.test.mts
```

Expected: FAIL because the repository and route do not exist.

- [ ] **Step 3: Implement repository and route**

The repository must upload with immutable caching and no upsert:

```ts
const result = await client.storage.from(STARTUP_LOGO_BUCKET).upload(path, file, {
  cacheControl: "31536000",
  contentType: file.type,
  upsert: false,
});
```

The route structure must mirror the personal-photo route while using the startup-logo service:

```ts
export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > PROFILE_IMAGE_MAX_BYTES + 256 * 1024) {
      return NextResponse.json({ error: "Startup logos must be 4 MiB or smaller." }, { status: 400 });
    }
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    let form: FormData;
    try { form = await request.formData(); }
    catch { return NextResponse.json({ error: "A multipart image upload is required." }, { status: 400 }); }
    const files = form.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) {
      return NextResponse.json({ error: "Upload exactly one file field named 'file'." }, { status: 400 });
    }
    const service = createStartupLogoService(createSupabaseStartupLogoRepository(userClient));
    return NextResponse.json(await service.upload(profileId, files[0]));
  } catch (cause) {
    if (cause instanceof AuthorizationError || cause instanceof StartupLogoError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    return NextResponse.json({ error: "Startup logo could not be updated." }, { status: 500 });
  }
}
```

Implement `DELETE` with the same error mapping and `service.remove(profileId)`.

- [ ] **Step 4: Run tests, scoped lint, and commit Task 3**

Run the Step 2 tests, ESLint on the four Task 3 files, `git diff --check`, and repository-mandated lint. Use a path-limited commit containing only Task 3 files.

---

### Task 4: Dashboard logo projection and startup-directory rendering

**Files:**
- Modify: `src/dashboard/participant-dashboard.ts`
- Modify: `src/dashboard/participant-startups.ts`
- Modify: `app/api/participant-dashboard/route.ts`
- Create: `src/startup-logos/schema-compatibility.ts`
- Modify: `app/dashboard/participant/StartupsDirectory.tsx`
- Modify: `tests/dashboard/participant-dashboard.test.mts`
- Modify: `tests/dashboard/participant-startups.test.mts`
- Modify: `tests/dashboard/participant-dashboard-server.test.mts`
- Create: `tests/startup-logos/schema-compatibility.test.mts`

**Interfaces:**
- Consumes: `createStartupLogoUrlResolver` from Task 1.
- Produces: `startupProfile.logoUrl: string | null` and `StartupDirectoryProfile.logoUrl: string | null`.
- Produces: `selectWithOptionalStartupLogoPath()` retrying only verified `logo_path` missing-column/schema-cache errors.

- [ ] **Step 1: Add failing projection and compatibility tests**

Add assertions that a managed `logo_path` resolves to a signed URL, missing managed paths use only an HTTPS `logo_url`, unsafe legacy schemes become `null`, and the compatibility retry triggers only for `startup_organizations.logo_path` error codes `42703` or `PGRST204`.

```ts
test("startup profile and directory expose the resolved shared logo", () => {
  const view = buildParticipantDashboardView(startupInput({ logoUrl: "https://signed.test/org/logo.png" }));
  assert.equal(view.startupProfile?.logoUrl, "https://signed.test/org/logo.png");
  assert.equal(view.startups[0]?.logoUrl, "https://signed.test/org/logo.png");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --experimental-strip-types --test tests/dashboard/participant-dashboard.test.mts tests/dashboard/participant-startups.test.mts tests/dashboard/participant-dashboard-server.test.mts tests/startup-logos/schema-compatibility.test.mts
```

Expected: FAIL because the view models and query do not expose the shared logo.

- [ ] **Step 3: Implement compatibility-safe projection**

Select `logo_path` and `logo_url` through `selectWithOptionalStartupLogoPath`, resolve each organization once per request with a cached resolver, and place the resolved URL in both the signed-in startup profile and mentor-visible startup directory records. Preserve existing relationship normalization for object-or-array PostgREST embeds.

Render `ProfileAvatar` in startup directory cards with `name={startup.name}` and `photoUrl={startup.logoUrl}` so initials remain the broken/missing-image fallback. Do not substitute a founder's `photoUrl`.

- [ ] **Step 4: Run focused tests, scoped lint, and commit Task 4**

Run Step 2, ESLint on changed TypeScript/TSX files, `git diff --check`, and repository-mandated lint. Commit only Task 4 paths with `git commit --only`.

---

### Task 5: Startup Profile company-logo control and full-width Stage select

**Files:**
- Create: `components/startup-logo/StartupLogoControl.tsx`
- Create: `components/startup-logo/startup-logo.module.css`
- Modify: `app/dashboard/participant/ParticipantDashboard.tsx`
- Modify: `app/design-preview/participant-dashboard/participant-dashboard.module.css`
- Create: `tests/dashboard/startup-logo-ui.test.mts`
- Modify: `tests/dashboard/profile-photo-ui.test.mts`

**Interfaces:**
- Consumes: `startupProfile.logoUrl` from Task 4.
- Produces: `StartupLogoControl({ name, logoUrl, preview, onLogoChange })`.
- Calls: `POST /api/startup-logo` and `DELETE /api/startup-logo`.

- [ ] **Step 1: Write failing UI and CSS contract tests**

```ts
test("Startup Profile owns a shared company logo control", () => {
  assert.match(dashboard, /StartupLogoControl/u);
  assert.match(dashboard, /name=\{startupProfileForm\.name\}/u);
  assert.match(dashboard, /logoUrl=\{view\.startupProfile\.logoUrl\}/u);
  assert.match(dashboard, /onLogoChange=\{updateStartupLogo\}/u);
});

test("Stage select uses the same full-width control styling as inputs", () => {
  assert.match(styles, /\.formGrid input,\.formGrid textarea,\.formGrid select\s*\{[^}]*width:100%/u);
  assert.match(styles, /\.formGrid input:focus,\.formGrid textarea:focus,\.formGrid select:focus/u);
});
```

Use the existing React hook harness pattern to assert preview mode has no input/button, invalid file types make no request, a successful upload calls `onLogoChange`, and removal accepts a `null` or fallback HTTPS URL.

- [ ] **Step 2: Run UI tests and verify RED**

```powershell
node --experimental-strip-types --test tests/dashboard/startup-logo-ui.test.mts tests/dashboard/profile-photo-ui.test.mts
```

Expected: FAIL because the startup control is absent and `<select>` is omitted from the form-control CSS selectors.

- [ ] **Step 3: Implement the company-logo control and immediate dashboard update**

Follow the personal-photo control's validation and feedback behavior, but use company copy and endpoints:

```tsx
<section className={styles.control} aria-labelledby="startup-logo-heading">
  <ProfileAvatar name={name} photoUrl={normalizedLogoUrl} size="large" />
  <div className={styles.copy}>
    <h3 id="startup-logo-heading">Company logo</h3>
    <p>Shared across your startup team. JPEG, PNG, or WebP, up to 4 MB.</p>
  </div>
</section>
```

Add `updateStartupLogo(nextLogoUrl)` to update `result.startupProfile.logoUrl` and every matching `result.startups` entry without waiting for a full dashboard reload. Render the control before `.formGrid`. In preview, show the fictional-preview note and no upload/remove element.

Update both normal and focus selectors to include `.formGrid select`, including `width:100%`, `box-sizing:border-box`, the existing padding, typography, background, border, and focus ring.

- [ ] **Step 4: Run focused tests and scoped static checks**

Run Step 2, the Task 4 dashboard tests, ESLint on the component and dashboard files, and `git diff --check` on all Task 5 paths. Expected: PASS with no new warnings.

- [ ] **Step 5: Perform desktop and narrow visual QA**

Follow `docs/runbooks/authenticated-qa.md`. Use the built-in Browser with a real startup session after hosted-schema preflight. Inspect Startup Profile at a desktop viewport and at 390 px width. Confirm the logo control is unclipped, Stage matches neighboring field width, labels do not overlap, focus is visible, and upload/remove messages fit.

If Browser inventory, credentials, or hosted schema are missing, report the exact scenario as BLOCKED and do not call visual QA passed.

- [ ] **Step 6: Run repository-mandated lint and commit Task 5**

Run `npm.cmd run lint`, record pre-existing generated-artifact failures separately, and create a path-limited commit containing only Task 5 files.

---

### Task 6: Integrated verification, project memory, and release handoff

**Files:**
- Modify: `docs/profile-photos.md`
- Modify: `docs/memory/handoff.md`
- Modify only if a durable new lesson emerges: `docs/memory/lessons.md`

**Interfaces:**
- Consumes: all preceding task deliverables.
- Produces: sanitized validation and release status with no credentials or participant information.

- [ ] **Step 1: Run focused and broad automated verification**

```powershell
node --experimental-strip-types --test tests/startup-logos/*.test.mts tests/profile-photos/*.test.mts tests/dashboard/startup-logo-ui.test.mts tests/dashboard/participant-dashboard.test.mts tests/dashboard/participant-startups.test.mts tests/dashboard/participant-dashboard-server.test.mts tests/database-revamp/canonical-schema.test.mts
npx.cmd tsc --noEmit --pretty false
npm.cmd test
npm.cmd run lint
git diff --check
```

Record exact pass counts and separate failures caused by pre-existing shared-worktree files or generated artifacts from failures introduced by this feature.

- [ ] **Step 2: Run local Supabase verification**

```powershell
npx.cmd supabase migration list --local
npx.cmd supabase test db supabase/tests/database/startup_logos.test.sql
npm.cmd run db:migration-safety
```

Expected: migration present locally, startup-logo pgTAP PASS, and migration safety PASS. If Docker is unavailable, record all three dependent checks as BLOCKED.

- [ ] **Step 3: Run authenticated behavior and authorization scenarios**

After verifying the app target and hosted schema against exact project ref `layjdjfvxkowxidwuvbs`, record PASS/FAIL/BLOCKED for: upload; reload persistence; replacement; removal/fallback; second member sees the shared logo; unrelated account cannot modify it; invalid file; server failure; desktop; narrow viewport. Do not mutate real participant data without a user-designated disposable fixture and authorization.

- [ ] **Step 4: Update documentation and memory**

Update `docs/profile-photos.md` with the organization-logo ownership, bucket, fallback, authorization, concurrency, and release requirements. Re-read `docs/memory/handoff.md`, add a distinct `2026-09-14-startup-company-logo` section with exact validation outcomes and blockers, and preserve all other active-task sections.

- [ ] **Step 5: Apply verification-before-completion and request code review**

Read and follow `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Fix in-scope findings through failing regression tests and repeat affected checks.

- [ ] **Step 6: Commit documentation only and report release boundary**

Run the required lint command and `git diff --check` first. Use a path-limited documentation commit. Report that local implementation does not create the hosted private bucket, apply migrations, deploy code, or prove authenticated production behavior unless those separately authorized steps actually occurred.
