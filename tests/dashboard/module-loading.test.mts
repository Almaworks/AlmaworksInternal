import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

test("remote admin modules gate their initial results behind the shared loader", async () => {
  const [mentors, notify, outreach, friday] = await Promise.all([
    source("app/dashboard/admin/mentors/page.tsx"),
    source("app/dashboard/admin/notify/page.tsx"),
    source("app/dashboard/admin/outreach/outreach-workspace.tsx"),
    source("components/friday-program/FridayProgramPanel.tsx"),
  ]);

  for (const moduleSource of [mentors, notify, outreach, friday]) {
    assert.match(moduleSource, /import\s*\{\s*DataLoading\s*\}\s*from\s*["']@\/components\/DataLoading["']/u);
  }
  assert.match(mentors, /const \[loading, setLoading\] = useState\(true\)/u);
  assert.match(mentors, /loading \|\| cohort\.loading/u);
  assert.match(mentors, /if \(cohort\.loadError\).*<CohortScreenControls/u);
  assert.match(notify, /const \[loadingsessions, setLoadingSessions\] = useState\(true\)/u);
  assert.match(outreach, /screenState === "loading"[\s\S]*<DataLoading/u);
  assert.match(friday, /isLoading[\s\S]*<DataLoading/u);
});

test("scope-changing admin reads ignore superseded responses", async () => {
  const [mentors, notify, outreach, friday] = await Promise.all([
    source("app/dashboard/admin/mentors/page.tsx"),
    source("app/dashboard/admin/notify/page.tsx"),
    source("app/dashboard/admin/outreach/outreach-workspace.tsx"),
    source("components/friday-program/FridayProgramPanel.tsx"),
  ]);

  assert.match(mentors, /loadRequestId\.current !== requestId/u);
  assert.match(notify, /loadRequestId\.current !== requestId/u);
  assert.match(outreach, /generation === loadGeneration\.current/u);
  assert.match(friday, /loadRequestId\.current !== requestId/u);
});

test("cohort and remote workspaces keep empty states behind animated loading gates", async () => {
  const [cohorts, emailWorkspace, photoWorkspace, semesterOperations, drawer] = await Promise.all([
    source("app/dashboard/admin/semesters/cohort-directory.tsx"),
    source("components/outreach-email/OutreachEmailWorkspace.tsx"),
    source("components/profile-photo/AdminProfilePhotoWorkspace.tsx"),
    source("app/dashboard/admin/semesters/semester-operations.tsx"),
    source("app/dashboard/admin/outreach/components/contact-drawer.tsx"),
  ]);

  for (const moduleSource of [cohorts, emailWorkspace, photoWorkspace, semesterOperations, drawer]) {
    assert.match(moduleSource, /import\s*\{\s*DataLoading\s*\}\s*from\s*["']@\/components\/DataLoading["']/u);
  }
  assert.match(cohorts, /loadRequestId\.current !== requestId/u);
  assert.match(cohorts, /if \(loading\) return <DataLoading/u);
  assert.match(cohorts, /setMembers\(\[\]\)/u);
  assert.match(cohorts, /if \(loadError\) return/u);
  assert.match(cohorts, /return \(\) => \{ active = false; loadRequestId\.current \+= 1; \}/u);
  assert.match(drawer, /detailError/u);
});
