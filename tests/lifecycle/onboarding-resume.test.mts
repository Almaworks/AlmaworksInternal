import assert from "node:assert/strict";
import test from "node:test";
import { restoreOnboardingDraft } from "../../src/lifecycle/onboarding-draft.ts";

test("restores saved mentor fields and review step after a consent round-trip", () => {
  const result = restoreOnboardingDraft({ role: "mentor", name: "Mentor", organization: "Old", description: "Old bio", expertise: ["Old"], teamContact: "" }, [
    { item_key: "identity", completed_at: "2026-09-19", payload: {} },
    { item_key: "mentor_profile", completed_at: "2026-09-19", payload: { organization: "Saved company", description: "Saved biography" } },
    { item_key: "expertise", completed_at: "2026-09-19", payload: { expertise: ["Product"] } },
  ]);
  assert.equal(result.organization, "Saved company");
  assert.equal(result.description, "Saved biography");
  assert.deepEqual(result.expertise, ["Product"]);
  assert.equal(result.step, 3);
});
test("new invitations retain canonical profile data without inventing expertise", () => {
  const result = restoreOnboardingDraft({ role: "mentor", name: "Mentor", organization: "Existing", description: "Existing biography", expertise: [], teamContact: "" }, []);
  assert.equal(result.organization, "Existing");
  assert.deepEqual(result.expertise, []);
  assert.equal(result.step, 1);
});
test("partially saved and intentionally cleared fields resume on profile step", () => {
  const result = restoreOnboardingDraft({ role: "mentor", name: "Mentor", organization: "Old", description: "Old", expertise: ["Product"], teamContact: "" }, [
    { item_key: "identity", completed_at: "2026-09-19", payload: {} },
    { item_key: "mentor_profile", completed_at: null, payload: { organization: "", description: "Draft" } },
  ]);
  assert.equal(result.organization, "");
  assert.equal(result.description, "Draft");
  assert.equal(result.step, 2);
});
test("startup draft restores company and team details only from its role keys", () => {
  const result = restoreOnboardingDraft({ role: "startup", name: "Founder", organization: "Acme", description: "", expertise: [], teamContact: "" }, [
    { item_key: "identity", completed_at: "saved", payload: {} },
    { item_key: "company_snapshot", completed_at: "saved", payload: { organization: "Acme", description: "Company summary" } },
    { item_key: "team_contacts", completed_at: "saved", payload: { teamContact: "Team contact" } },
    { item_key: "mentor_profile", payload: { organization: "Wrong role" } },
  ]);
  assert.equal(result.organization, "Acme");
  assert.equal(result.teamContact, "Team contact");
  assert.equal(result.step, 3);
});
test("malformed JSON cannot corrupt canonical values or skip required steps", () => {
  const base = { role: "mentor" as const, name: "Mentor", organization: "Existing", description: "Bio", expertise: ["Product"], teamContact: "" };
  assert.equal(restoreOnboardingDraft(base, null).step, 1);
  assert.equal(restoreOnboardingDraft(base, [{ item_key: "mentor_profile", completed_at: "yes", payload: { organization: 3 } }]).organization, "Existing");
  assert.deepEqual(restoreOnboardingDraft(base, [{ item_key: "expertise", payload: { expertise: [null, 3] } }]).expertise, ["Product"]);
});

test("mentor review defaults to setting mentoring hours next", () => {
  const result = restoreOnboardingDraft({ role: "mentor", name: "Mentor", organization: "Existing", description: "Bio", expertise: ["Product"], teamContact: "" }, []);
  assert.equal(result.availabilityChoice, "set-hours-next");
});

test("mentor review restores the add-later availability choice without treating it as saved hours", () => {
  const result = restoreOnboardingDraft({ role: "mentor", name: "Mentor", organization: "Existing", description: "Bio", expertise: ["Product"], teamContact: "" }, [
    { item_key: "mentoring_hours_setup", completed_at: null, payload: { choice: "add-later" } },
  ]);
  assert.equal(result.availabilityChoice, "add-later");
});

test("malformed availability choices fall back to the guided path", () => {
  const result = restoreOnboardingDraft({ role: "startup", name: "Founder", organization: "Acme", description: "Summary", expertise: [], teamContact: "Founder" }, [
    { item_key: "mentoring_hours_setup", completed_at: null, payload: { choice: "unexpected" } },
  ]);
  assert.equal(result.availabilityChoice, "set-hours-next");
});
