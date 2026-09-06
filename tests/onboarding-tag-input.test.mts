import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mentor onboarding uses the shared expertise-tag selector", async () => {
  const source = await readFile(new URL("../app/dashboard/onboarding/onboarding-flow.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ ExpertiseTagPicker \} from "@\/components\/ExpertiseTagPicker"/u);
  assert.match(source, /<ExpertiseTagPicker value=\{expertise\}/u);
  assert.doesNotMatch(source, /Separate topics with commas/u);
});
