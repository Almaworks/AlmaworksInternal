import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant home cards prioritize their descriptive headings without category eyebrows", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");
  const home = source.slice(source.indexOf('{tab === "home"'), source.indexOf('{tab === "network"'));

  assert.match(home, /<h2>\{isMentor \? "Your mentoring schedule" : "Request mentor time"\}<\/h2>/);
  assert.match(home, /<h2>Notifications<\/h2>/);
  assert.match(home, /<h2>Upcoming meetings<\/h2>/);
  assert.match(home, /<h2>\{isMentor \? "Startup members you can support" : "Meet your cohort"\}<\/h2>/);
  assert.doesNotMatch(home, /<p className=\{styles\.eyebrow\}>Independent mentoring<\/p>/);
  assert.doesNotMatch(home, /<p className=\{styles\.eyebrow\}>For you<\/p>/);
  assert.doesNotMatch(home, /<p className=\{styles\.eyebrow\}>Active semester network<\/p>/);
});
