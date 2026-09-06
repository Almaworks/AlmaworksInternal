import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/admin/page.tsx"), "utf8");

test("members table uses the available desktop width without expanding for account controls", () => {
  assert.match(source, /<table className="w-full table-fixed text-sm">/u);
  assert.match(source, /<colgroup>[\s\S]*?<col className="w-\[10rem\]"\s*\/>[\s\S]*?<col className="w-\[15rem\]"\s*\/>[\s\S]*?<col className="w-\[10\.5rem\]"\s*\/>[\s\S]*?<col className="w-\[8\.5rem\]"\s*\/>[\s\S]*?<col className="w-\[8\.5rem\]"\s*\/>[\s\S]*?<col className="w-\[14rem\]"\s*\/>[\s\S]*?<col className="w-\[11rem\]"\s*\/>[\s\S]*?<\/colgroup>/u);
});
