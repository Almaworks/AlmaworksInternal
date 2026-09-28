import assert from "node:assert/strict";
import test from "node:test";
import { mentorOnboardingUrl } from "../../src/outreach-email/onboarding-link.ts";

test("mentor onboarding uses the configured public access request page", () => {
  assert.equal(mentorOnboardingUrl("https://almaworks.example.org"), "https://almaworks.example.org/request-access");
});
test("missing, local and unsafe origins cannot become outreach links", () => {
  for (const value of [undefined, "", "http://localhost:3000", "https://localhost", "https://127.0.0.1", "https://host.local", "https://user:password@example.org", "https://example.org/other", "https://example.org?token=abc", "javascript:alert(1)"]) assert.equal(mentorOnboardingUrl(value), null);
});
