import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../../supabase/schemas/lifecycle.sql", import.meta.url);

test("startup mentor needs persist context and no-preference within the semester-scoped row", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const start = sql.indexOf("create table public.startup_semesters");
  const declaration = sql.slice(start, sql.indexOf(";", start));
  assert.match(declaration, /semester_id uuid not null references public\.semesters\(id\)/);
  assert.match(declaration, /mentorship_needs text\[\] not null default '\{\}'/);
  assert.match(declaration, /mentor_need_context text/);
  assert.match(declaration, /mentor_need_no_preference boolean not null default false/);
});
