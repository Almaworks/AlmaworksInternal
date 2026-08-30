import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateNextFollowUp,
  classifyFollowUp,
  restoreSilencedOpportunity,
  type FollowUpOpportunity,
} from "../../src/outreach/cadence.ts";

const now = "2027-02-15T12:00:00.000Z";

function opportunity(
  overrides: Partial<FollowUpOpportunity> = {},
): FollowUpOpportunity {
  return {
    stage: "contacted",
    ownerProfileId: "owner-1",
    ownerIsActive: true,
    nextFollowUpAt: "2027-02-15T12:00:00.000Z",
    snoozedUntil: null,
    isSilenced: false,
    ...overrides,
  };
}

test("calculates five-day and fourteen-day UTC follow-ups", () => {
  assert.equal(
    calculateNextFollowUp("2027-02-01T12:00:00.000Z", 5),
    "2027-02-06T12:00:00.000Z",
  );
  assert.equal(
    calculateNextFollowUp("2027-02-01T12:00:00.000Z", 14),
    "2027-02-15T12:00:00.000Z",
  );
});

test("rejects cadence values outside whole days one through 365", () => {
  assert.doesNotThrow(() =>
    calculateNextFollowUp("2027-02-01T12:00:00.000Z", 1),
  );
  assert.doesNotThrow(() =>
    calculateNextFollowUp("2027-02-01T12:00:00.000Z", 365),
  );
  assert.throws(() => calculateNextFollowUp("2027-02-01T12:00:00.000Z", 0));
  assert.throws(() => calculateNextFollowUp("2027-02-01T12:00:00.000Z", 1.5));
  assert.throws(() => calculateNextFollowUp("2027-02-01T12:00:00.000Z", 366));
});

test("requires explicit offsets for scheduling timestamps", () => {
  assert.throws(
    () => calculateNextFollowUp("2027-02-01T12:00:00.000", 5),
    /timezone/i,
  );
  assert.throws(
    () =>
      classifyFollowUp(
        opportunity({ nextFollowUpAt: "2027-02-15T12:00:00.000" }),
        now,
      ),
    /timezone/i,
  );
  assert.throws(
    () =>
      restoreSilencedOpportunity(
        opportunity({ isSilenced: true }),
        "2027-02-20T12:00:00.000",
      ),
    /timezone/i,
  );
  assert.equal(
    calculateNextFollowUp("2027-02-01T12:00:00.000+02:00", 5),
    "2027-02-06T10:00:00.000Z",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({ nextFollowUpAt: "2027-02-15T07:00:00.000-05:00" }),
      now,
    ),
    "due_today",
  );
});

test("classifies due work using UTC day boundaries", () => {
  assert.equal(
    classifyFollowUp(
      opportunity({ nextFollowUpAt: "2027-02-14T23:59:59.999Z" }),
      "2027-02-15T00:30:00.000Z",
    ),
    "overdue",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({ nextFollowUpAt: "2027-02-15T23:59:59.999Z" }),
      "2027-02-15T00:30:00.000Z",
    ),
    "due_today",
  );
});

test("applies closed, silenced, snoozed, and unassigned precedence", () => {
  const overdue = { nextFollowUpAt: "2027-02-01T12:00:00.000Z" };

  assert.equal(
    classifyFollowUp(
      opportunity({
        ...overdue,
        stage: "closed",
        isSilenced: true,
        snoozedUntil: "2027-03-01T12:00:00.000Z",
        ownerProfileId: null,
        ownerIsActive: false,
      }),
      now,
    ),
    "closed",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({
        ...overdue,
        isSilenced: true,
        snoozedUntil: "2027-03-01T12:00:00.000Z",
        ownerProfileId: null,
        ownerIsActive: false,
      }),
      now,
    ),
    "silenced",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({
        ...overdue,
        snoozedUntil: "2027-03-01T12:00:00.000Z",
        ownerProfileId: null,
        ownerIsActive: false,
      }),
      now,
    ),
    "snoozed",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({ ...overdue, ownerProfileId: null, ownerIsActive: false }),
      now,
    ),
    "unassigned",
  );
});

test("treats an expired snooze as active queue work", () => {
  assert.equal(
    classifyFollowUp(
      opportunity({
        nextFollowUpAt: "2027-02-15T12:00:00.000Z",
        snoozedUntil: "2027-02-15T12:00:00.000Z",
      }),
      now,
    ),
    "due_today",
  );
});

test("classifies converted and closed opportunities as closed", () => {
  assert.equal(classifyFollowUp(opportunity({ stage: "converted" }), now), "closed");
  assert.equal(classifyFollowUp(opportunity({ stage: "closed" }), now), "closed");
});

test("classifies future work by a configurable horizon", () => {
  assert.equal(
    classifyFollowUp(
      opportunity({ nextFollowUpAt: "2027-02-22T12:00:00.000Z" }),
      now,
      7,
    ),
    "upcoming",
  );
  assert.equal(
    classifyFollowUp(
      opportunity({ nextFollowUpAt: "2027-02-23T12:00:00.000Z" }),
      now,
      7,
    ),
    "waiting",
  );
});

test("restoring silenced work requires and applies a next follow-up", () => {
  const silencedOpportunity = opportunity({ isSilenced: true });

  assert.throws(
    () => restoreSilencedOpportunity(silencedOpportunity, null),
    /next follow-up/i,
  );
  assert.deepEqual(
    restoreSilencedOpportunity(silencedOpportunity, "2027-02-20T12:00:00.000Z"),
    opportunity({
      isSilenced: false,
      nextFollowUpAt: "2027-02-20T12:00:00.000Z",
    }),
  );
});
