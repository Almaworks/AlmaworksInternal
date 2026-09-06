import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMentorNeedsBoard,
  normalizeMentorNeedSelection,
  suggestMentorNeeds,
  type MentorNeedsSource,
} from "../../src/mentor-needs/domain.ts";
import { buildMentorNeedsBoardPayload } from "../../src/mentor-needs/http.ts";
import { getMentorNeedsDisplayState } from "../../src/mentor-needs/ui-state.ts";

test("normalizes one primary and optional secondary need while preserving custom labels", () => {
  assert.deepEqual(normalizeMentorNeedSelection({
    primary: "  Enterprise Sales ",
    secondary: "Regulated health",
    noPreference: false,
    context: "  Preparing our first hospital pilot.  ",
  }), {
    needs: ["Enterprise sales", "Regulated health"],
    noPreference: false,
    context: "Preparing our first hospital pilot.",
  });
});

test("no-preference clears selected categories but retains useful context", () => {
  assert.deepEqual(normalizeMentorNeedSelection({
    primary: "Fundraising strategy",
    secondary: null,
    noPreference: true,
    context: "Help us decide what expertise matters.",
  }), {
    needs: [],
    noPreference: true,
    context: "Help us decide what expertise matters.",
  });
});

test("rejects an empty preference and duplicate need categories", () => {
  assert.throws(() => normalizeMentorNeedSelection({ primary: null, secondary: null, noPreference: false, context: "" }), /Choose a mentor need/);
  assert.throws(() => normalizeMentorNeedSelection({ primary: "Sales", secondary: " sales ", noPreference: false, context: "" }), /different/);
});

test("suggests canonical matches and offers an immediate custom category", () => {
  assert.deepEqual(suggestMentorNeeds("enterprise", ["Enterprise sales", "Fundraising strategy"]), {
    canonical: ["Enterprise sales"],
    custom: "enterprise",
  });
  assert.equal(suggestMentorNeeds("Enterprise sales", ["Enterprise sales"]).custom, null);
});

test("aggregates active demand, mentor supply, and manually tagged active outreach by category", () => {
  const source: MentorNeedsSource = {
    startups: [
      { id: "s1", name: "Northstar", needs: ["Enterprise sales", "Regulated health"], context: "Pilot procurement" },
      { id: "s2", name: "Orbit", needs: ["Enterprise sales"], context: null },
    ],
    mentors: [
      { id: "m1", name: "Dana", tags: ["Enterprise sales"] },
    ],
    outreach: [
      { id: "o1", name: "Maya", stage: "responded", tags: ["Regulated health"] },
      { id: "o2", name: "Luis", stage: "closed", tags: ["Regulated health"] },
    ],
  };

  assert.deepEqual(buildMentorNeedsBoard(source), [
    {
      category: "Enterprise sales",
      requestCount: 2,
      mentorCount: 1,
      outreachCount: 0,
      status: "tracking",
      startups: [{ id: "s1", name: "Northstar", context: "Pilot procurement", isPrimary: true }, { id: "s2", name: "Orbit", context: null, isPrimary: true }],
      mentors: [{ id: "m1", name: "Dana" }],
      outreach: [],
    },
    {
      category: "Regulated health",
      requestCount: 1,
      mentorCount: 0,
      outreachCount: 1,
      status: "gap",
      startups: [{ id: "s1", name: "Northstar", context: "Pilot procurement", isPrimary: false }],
      mentors: [],
      outreach: [{ id: "o1", name: "Maya", stage: "responded" }],
    },
  ]);
});

test("does not count mentor or outreach tags that have no active startup demand", () => {
  const board = buildMentorNeedsBoard({
    startups: [],
    mentors: [{ id: "m1", name: "Dana", tags: ["Fundraising strategy"] }],
    outreach: [{ id: "o1", name: "Maya", stage: "ready", tags: ["Legal"] }],
  });
  assert.deepEqual(board, []);
});

test("admin payload separates headline totals from category-matched rows", () => {
  const current = { id: "fall", name: "Fall 2026", startsOn: "2026-09-01", isActive: true };
  const previous = { id: "spring", name: "Spring 2026", startsOn: "2026-01-01", isActive: false };
  assert.deepEqual(buildMentorNeedsBoardPayload({ current, previous, all: [current, previous] }, [], {
    activeMentorCount: 102,
    activeOutreachContactCount: 87,
  }, "semester"), {
    cohorts: [current, previous],
    rows: [],
    summary: {
      activeMentorCount: 102,
      activeOutreachContactCount: 87,
    },
    scope: "semester",
  });
});

test("shows a loading screen before mentor needs have loaded", () => {
  assert.equal(getMentorNeedsDisplayState({ isLoading: true, hasLoaded: false, hasError: false, rowCount: 0 }), "initial-loading");
  assert.equal(getMentorNeedsDisplayState({ isLoading: true, hasLoaded: true, hasError: false, rowCount: 4 }), "updating");
  assert.equal(getMentorNeedsDisplayState({ isLoading: false, hasLoaded: true, hasError: false, rowCount: 0 }), "empty");
});
