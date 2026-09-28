import assert from "node:assert/strict";
import test from "node:test";

import { selectWithOptionalProfilePhotoPath } from "../../src/profile-photos/schema-compatibility.ts";

const missingDirectColumn = {
  code: "42703",
  details: null,
  hint: null,
  message: "column profiles.photo_path does not exist",
};

test("own profile reads retry without photo_path on the verified missing-column error", async () => {
  const fallbackProfile = { id: "profile-1", full_name: "Founder", email: "founder@example.com" };
  let fallbackCalls = 0;

  const result = await selectWithOptionalProfilePhotoPath(
    async () => ({ data: null, error: missingDirectColumn }),
    async () => {
      fallbackCalls += 1;
      return { data: fallbackProfile, error: null };
    },
  );

  assert.deepEqual(result, { data: fallbackProfile, error: null });
  assert.equal(fallbackCalls, 1);
});

test("network profile reads retry for the equivalent PostgREST schema-cache error", async () => {
  const fallbackProfiles = [{ id: "profile-1", full_name: "Mentor", email: "mentor@example.com" }];
  let fallbackCalls = 0;

  const result = await selectWithOptionalProfilePhotoPath(
    async () => ({
      data: null,
      error: {
        code: "PGRST204",
        details: null,
        hint: null,
        message: "Could not find the 'photo_path' column of 'profiles' in the schema cache",
      },
    }),
    async () => {
      fallbackCalls += 1;
      return { data: fallbackProfiles, error: null };
    },
  );

  assert.deepEqual(result, { data: fallbackProfiles, error: null });
  assert.equal(fallbackCalls, 1);
});

test("unrelated missing columns and permission failures never trigger the compatibility retry", async () => {
  const errors = [
    { ...missingDirectColumn, message: "column profiles.full_name does not exist" },
    { ...missingDirectColumn, message: "column mentor_profiles.photo_path does not exist" },
    { ...missingDirectColumn, code: "42501", message: "permission denied for table profiles" },
  ];

  for (const error of errors) {
    let fallbackCalls = 0;
    const result = await selectWithOptionalProfilePhotoPath(
      async () => ({ data: null, error }),
      async () => {
        fallbackCalls += 1;
        return { data: [], error: null };
      },
    );

    assert.deepEqual(result, { data: null, error });
    assert.equal(fallbackCalls, 0);
  }
});

test("an error from the fallback query is returned unchanged", async () => {
  const permissionError = {
    code: "42501",
    details: null,
    hint: null,
    message: "permission denied for table profiles",
  };

  const result = await selectWithOptionalProfilePhotoPath(
    async () => ({ data: null, error: missingDirectColumn }),
    async () => ({ data: null, error: permissionError }),
  );

  assert.deepEqual(result, { data: null, error: permissionError });
});
