import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const generator = join(root, "scripts", "generate-database-explorer.mjs");

function generate(markdown: string): string {
  const directory = mkdtempSync(join(tmpdir(), "almaworks-database-explorer-"));
  const input = join(directory, "database-map.md");
  const output = join(directory, "database-explorer.html");
  writeFileSync(input, markdown, "utf8");
  execFileSync(process.execPath, [generator, "--input", input, "--output", output], {
    cwd: root,
    stdio: "pipe",
  });
  return readFileSync(output, "utf8");
}

function readEmbeddedSchema(html: string): {
  tables: Array<{ name: string; domain: string; columns: Array<{ name: string }>; connections: string[] }>;
  totals: { tables: number; columns: number };
} {
  const match = html.match(/<script type="application\/json" id="schema-data">([\s\S]*?)<\/script>/);
  assert.ok(match, "the generated artifact must embed its parsed schema data");
  return JSON.parse(match[1]);
}

test("generator turns table columns and foreign keys into explorable schema data", () => {
  const html = generate(`# Database map

## Identity

### \`profiles\`

Application identity.

- \`id\` (\`uuid\`, PK) — profile identifier.
- \`semester_id\` — cohort; -> \`semesters.id\`.

## Cohorts

### \`semesters\`

Program cohort.

- \`id\` (\`uuid\`, PK) — cohort identifier.
`);
  const schema = readEmbeddedSchema(html);

  assert.deepEqual(schema.totals, { tables: 2, columns: 3 });
  assert.deepEqual(schema.tables.map((table) => table.name), ["profiles", "semesters"]);
  assert.equal(schema.tables[0].domain, "Identity");
  assert.deepEqual(schema.tables[0].connections, ["semesters"]);
  assert.deepEqual(schema.tables[0].columns.map((column) => column.name), ["id", "semester_id"]);
});

test("generator preserves the complete verified Almaworks schema", () => {
  const markdown = readFileSync(join(root, "docs", "database-map.md"), "utf8");
  const html = generate(markdown);
  const schema = readEmbeddedSchema(html);

  assert.deepEqual(schema.totals, { tables: 20, columns: 234 });
  assert.equal(new Set(schema.tables.map((table) => table.name)).size, 20);
  assert.ok(schema.tables.some((table) => table.name === "semester_memberships" && table.connections.includes("profiles") && table.connections.includes("semesters")));
  assert.ok(schema.tables.some((table) => table.name === "sessions" && table.connections.includes("meetings") && table.connections.includes("mentor_semesters") && table.connections.includes("startup_semesters")));
  assert.ok(schema.tables.some((table) => table.name === "outreach_opportunities" && table.connections.includes("outreach_contacts")));
  for (const retired of ["mentors", "startups", "session_dates", "availability", "agents", "visa_application_orders"]) {
    assert.ok(!schema.tables.some((table) => table.name === retired));
  }
});
