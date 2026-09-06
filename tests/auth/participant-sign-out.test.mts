import assert from "node:assert/strict";
import test from "node:test";

import { signOutParticipant } from "../../src/auth/participant-sign-out.ts";

test("participant sign-out clears only the current session before returning home", async () => {
  let receivedScope: string | null = null;
  let destination: string | null = null;
  const client = {
    auth: {
      signOut: async (options: { scope: "local" }) => {
        receivedScope = options.scope;
        return { error: null };
      },
    },
  };

  await signOutParticipant(client, (href) => { destination = href; });

  assert.equal(receivedScope, "local");
  assert.equal(destination, "/");
});

test("participant sign-out preserves the session error and does not navigate", async () => {
  let navigated = false;
  const client = {
    auth: {
      signOut: async () => ({ error: { message: "Could not clear session." } }),
    },
  };

  await assert.rejects(
    () => signOutParticipant(client, () => { navigated = true; }),
    /Could not clear session\./,
  );
  assert.equal(navigated, false);
});
