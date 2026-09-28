import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { createSemesterExportArchive, createSemesterExportManifest } from "../../src/semester-export/format.ts";
import type { SemesterExportInput } from "../../src/semester-export/types.ts";

const input: SemesterExportInput = {
  metadata: {
    scope: "semester",
    semesterId: "fall-2026",
    semesterName: "Fall 2026 — Founders",
    exportedAt: "2026-09-09T12:00:00.000Z",
    exclusions: ["Authentication identities and invitation secrets are never exported.", "Photo files are referenced by path only."],
    unresolvedProfileIds: ["profile-hidden-from-rls"],
  },
  datasets: [
    {
      id: "sessions",
      columns: ["id", "topic", "notes", "count", "metadata", "missing"],
      rows: [{
        id: "session-1",
        topic: "=SUM(A1:A2)",
        notes: "A comma, a quote \" and\na newline — all preserved",
        count: 4,
        metadata: { tags: ["sales", "growth"], source: "admin" },
        missing: null,
        private_note: "must not leave the declared projection",
      }],
    },
    {
      id: "outreach_contacts",
      columns: ["id", "name"],
      rows: [{ id: "contact-1", name: "Ada Lovelace" }, { id: "contact-2", name: "  +danger" }],
    },
  ],
};

async function entries(archive: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(archive);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir).sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await zip.file(name)?.async("string")]))) as Record<string, string>;
}

test("creates a ZIP with deterministic CSV and lossless JSON tables", async () => {
  const result = await createSemesterExportArchive(input);
  const files = await entries(result.archive);

  assert.equal(result.fileName, "semester-export-fall-2026-semester.zip");
  assert.deepEqual(Object.keys(files).sort(), ["README.md", "manifest.json", "tables/outreach_contacts.csv", "tables/outreach_contacts.json", "tables/sessions.csv", "tables/sessions.json"]);
  assert.equal(files["tables/sessions.csv"], 'id,topic,notes,count,metadata,missing\r\nsession-1,\'=SUM(A1:A2),"A comma, a quote "" and\na newline — all preserved",4,"{""source"":""admin"",""tags"":[""sales"",""growth""]}",\r\n');
  assert.match(files["tables/outreach_contacts.csv"] ?? "", /contact-2,'  \+danger\r\n/u);
  assert.match(files["README.md"] ?? "", /CSV uses empty cells for null values; the matching JSON files preserve exact values\./u);
  assert.deepEqual(JSON.parse(files["tables/sessions.json"] ?? "[]"), [{
    id: "session-1",
    topic: "=SUM(A1:A2)",
    notes: "A comma, a quote \" and\na newline — all preserved",
    count: 4,
    metadata: { source: "admin", tags: ["sales", "growth"] },
    missing: null,
  }]);
  assert.doesNotMatch(files["tables/sessions.json"] ?? "", /private_note/u);

  const manifest = JSON.parse(files["manifest.json"] ?? "{}") as {
    semester: { id: string; name: string };
    datasets: Array<{ id: string; file: string; jsonFile: string; rowCount: number }>;
    exclusions: string[];
    unresolvedReferences: { profiles: string[] };
  };
  assert.deepEqual(manifest.semester, { id: "fall-2026", name: "Fall 2026 — Founders" });
  assert.deepEqual(manifest.datasets.map(({ id, file, jsonFile, rowCount }) => ({ id, file, jsonFile, rowCount })), [
    { id: "sessions", file: "tables/sessions.csv", jsonFile: "tables/sessions.json", rowCount: 1 },
    { id: "outreach_contacts", file: "tables/outreach_contacts.csv", jsonFile: "tables/outreach_contacts.json", rowCount: 2 },
  ]);
  assert.deepEqual(manifest.exclusions, input.metadata.exclusions);
  assert.deepEqual(manifest.unresolvedReferences, { profiles: input.metadata.unresolvedProfileIds });
});

test("rejects duplicate or unsafe dataset IDs before generating archive paths", async () => {
  await assert.rejects(
    () => createSemesterExportArchive({ ...input, datasets: [{ ...input.datasets[0]!, id: "sessions" }, { ...input.datasets[1]!, id: "sessions" }] }),
    /unique/u,
  );
  await assert.rejects(
    () => createSemesterExportArchive({ ...input, datasets: [{ ...input.datasets[0]!, id: "../secrets" }] }),
    /safe identifier/u,
  );
});

test("rejects duplicate columns and non-finite numbers", async () => {
  await assert.rejects(
    () => createSemesterExportArchive({ ...input, datasets: [{ ...input.datasets[0]!, columns: ["id", "id"] }] }),
    /unique/u,
  );
  await assert.rejects(
    () => createSemesterExportArchive({ ...input, datasets: [{ ...input.datasets[0]!, rows: [{ id: "session-1", count: Number.NaN }] }] }),
    /finite/u,
  );
});

test("manifest builder rejects unsupported scopes and describes CSV plus JSON companions", () => {
  assert.throws(
    () => createSemesterExportManifest({ ...input, metadata: { ...input.metadata, scope: "invalid" as "semester" } }),
    /scope/u,
  );
  assert.deepEqual(createSemesterExportManifest(input).datasets.map(({ id, file, jsonFile, columns, rowCount }) => ({ id, file, jsonFile, columns, rowCount })), [
    { id: "sessions", file: "tables/sessions.csv", jsonFile: "tables/sessions.json", columns: ["id", "topic", "notes", "count", "metadata", "missing"], rowCount: 1 },
    { id: "outreach_contacts", file: "tables/outreach_contacts.csv", jsonFile: "tables/outreach_contacts.json", columns: ["id", "name"], rowCount: 2 },
  ]);
});

test("README escapes metadata so it cannot inject headings or links", async () => {
  const archive = await createSemesterExportArchive({
    ...input,
    metadata: {
      ...input.metadata,
      semesterName: "# injected heading\n[unsafe link](https://example.test)",
      exclusions: ["## injected exclusion\n[unsafe link](https://example.test)"],
    },
  });
  const readme = (await entries(archive.archive))["README.md"] ?? "";

  assert.ok(readme.includes("Semester: **\\# injected heading\\n\\[unsafe link\\]\\(https://example\\.test\\)**"));
  assert.ok(readme.includes("- \\#\\# injected exclusion\\n\\[unsafe link\\]\\(https://example\\.test\\)"));
  assert.doesNotMatch(readme, /^# injected heading$/mu);
});

