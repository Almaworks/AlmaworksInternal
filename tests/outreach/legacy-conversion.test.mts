import assert from "node:assert/strict";
import test from "node:test";

import { resolveLegacyMentorConversion } from "../../src/outreach/legacy-conversion.ts";

test("resolves a legacy mentor through its linked CRM mentor profile", () => {
  assert.deepEqual(resolveLegacyMentorConversion(
    "legacy-mentor-1",
    [{ id: "legacy-mentor-1", userId: "profile-1" }],
    new Set(["profile-1"]),
  ), {
    convertedMentorProfileId: "profile-1",
    issueCodes: [],
  });
});

test("flags every unresolved legacy mentor conversion for review", () => {
  const cases = [
    {
      mentors: [],
      mentorProfileIds: new Set<string>(),
    },
    {
      mentors: [{ id: "legacy-mentor-1", userId: null }],
      mentorProfileIds: new Set<string>(),
    },
    {
      mentors: [{ id: "legacy-mentor-1", userId: "profile-without-mentor-profile" }],
      mentorProfileIds: new Set<string>(),
    },
  ];

  for (const candidateSet of cases) {
    assert.deepEqual(resolveLegacyMentorConversion(
      "legacy-mentor-1",
      candidateSet.mentors,
      candidateSet.mentorProfileIds,
    ), {
      convertedMentorProfileId: null,
      issueCodes: ["converted_mentor_unresolved"],
    });
  }
});

test("does not create a conversion issue when the legacy row was not converted", () => {
  assert.deepEqual(resolveLegacyMentorConversion(
    null,
    [],
    new Set(),
  ), {
    convertedMentorProfileId: null,
    issueCodes: [],
  });
});
