import assert from "node:assert/strict";
import test from "node:test";

import * as outreachWorkspace from "../../src/outreach/workspace.ts";

type ScreenState = "loading" | "error" | "ready";
type GetScreenState = (input: {
  semestersLoading: boolean;
  workspaceLoading: boolean;
  hasData: boolean;
  hasError: boolean;
}) => ScreenState;

function screenState(): GetScreenState {
  const candidate = (outreachWorkspace as unknown as { getOutreachScreenState?: GetScreenState }).getOutreachScreenState;
  assert.equal(typeof candidate, "function", "getOutreachScreenState must be implemented");
  return candidate as GetScreenState;
}

test("semester completion cannot expose an error fallback while workspace data is loading", () => {
  assert.equal(screenState()({
    semestersLoading: false,
    workspaceLoading: true,
    hasData: false,
    hasError: false,
  }), "loading");
});

test("outreach becomes ready only after data arrives", () => {
  assert.equal(screenState()({ semestersLoading: false, workspaceLoading: false, hasData: true, hasError: false }), "ready");
  assert.equal(screenState()({ semestersLoading: false, workspaceLoading: false, hasData: false, hasError: true }), "error");
});
