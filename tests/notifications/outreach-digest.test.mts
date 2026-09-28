import assert from "node:assert/strict";
import test from "node:test";

import {
  renderOutreachDigest,
  selectOutreachDigestItems,
  type OutreachDigestOpportunity,
} from "../../src/notifications/outreach-digest.ts";

const ownerProfileId = "owner-1";
const now = "2026-09-26T13:00:00.000Z";

function opportunity(
  overrides: Partial<OutreachDigestOpportunity> = {},
): OutreachDigestOpportunity {
  return {
    companyName: "Analytical Engines",
    contactName: "Ada Lovelace",
    id: "opportunity-1",
    isActive: true,
    isArchived: false,
    isSilenced: false,
    nextAction: "Send a concise follow-up email",
    nextFollowUpAt: "2026-09-26T16:30:00.000Z",
    ownerIsActive: true,
    ownerProfileId,
    semesterId: "semester-1",
    snoozedUntil: null,
    stage: "contacted",
    ...overrides,
  };
}

test("selects the assigned active owner's due and overdue work in New York day order", () => {
  const items = selectOutreachDigestItems({
    now,
    ownerProfileId,
    opportunities: [
      opportunity({ id: "due", nextFollowUpAt: "2026-09-26T16:30:00.000Z" }),
      opportunity({
        id: "overdue",
        contactName: "Grace Hopper",
        nextFollowUpAt: "2026-09-25T16:30:00.000Z",
      }),
      opportunity({ id: "tomorrow", nextFollowUpAt: "2026-09-27T04:30:00.000Z" }),
      opportunity({ id: "other-owner", ownerProfileId: "owner-2" }),
    ],
  });

  assert.deepEqual(
    items.map((item) => ({ id: item.id, status: item.status, dueDate: item.dueDate })),
    [
      { id: "overdue", status: "overdue", dueDate: "Sep 25, 2026, 12:30 PM EDT" },
      { id: "due", status: "due_today", dueDate: "Sep 26, 2026, 12:30 PM EDT" },
    ],
  );
});

test("excludes silenced, snoozed, closed, inactive, and archived opportunities", () => {
  const items = selectOutreachDigestItems({
    now,
    ownerProfileId,
    opportunities: [
      opportunity({ id: "included" }),
      opportunity({ id: "silenced", isSilenced: true }),
      opportunity({ id: "snoozed", snoozedUntil: "2026-09-27T13:00:00.000Z" }),
      opportunity({ id: "closed", stage: "closed" }),
      opportunity({ id: "declined", stage: "declined" }),
      opportunity({ id: "inactive-opportunity", isActive: false }),
      opportunity({ id: "inactive-owner", ownerIsActive: false }),
      opportunity({ id: "archived", isArchived: true }),
    ],
  });

  assert.deepEqual(items.map((item) => item.id), ["included"]);
});

test("includes due unassigned work only when rendering an active admin digest", () => {
  const opportunities = [
    opportunity({ id: "assigned", ownerProfileId }),
    opportunity({ id: "unassigned", ownerProfileId: null, ownerIsActive: false }),
  ];

  assert.deepEqual(
    selectOutreachDigestItems({ now, ownerProfileId, opportunities }).map((item) => item.id),
    ["assigned"],
  );
  const items = selectOutreachDigestItems({
    includeUnassigned: true,
    now,
    ownerProfileId,
    opportunities,
  });
  assert.deepEqual(
    items.map((item) => ({ id: item.id, assignment: item.assignment })),
    [
      { id: "assigned", assignment: "assigned" },
      { id: "unassigned", assignment: "unassigned" },
    ],
  );

  const digest = renderOutreachDigest({
    appOrigin: "https://app.almaworks.org",
    items: [items[1]!],
    ownerName: "Grace",
  });
  assert.match(digest.text, /Unassigned opportunity/u);
  assert.match(digest.html, /Unassigned opportunity/u);
});

test("renders escaped HTML and the exact deep link for every selected opportunity", () => {
  const [item] = selectOutreachDigestItems({
    now,
    ownerProfileId,
    opportunities: [opportunity({
      companyName: "<Engines & Co>",
      contactName: "Ada <script>alert(1)</script>",
      id: "opportunity & one",
      nextAction: "Review \"warm\" introduction & reply",
      semesterId: "semester & one",
    })],
  });
  assert.ok(item);

  const digest = renderOutreachDigest({
    appOrigin: "https://app.almaworks.org",
    items: [item],
    ownerName: "Grace <Hopper>",
  });

  const expectedUrl = "https://app.almaworks.org/dashboard/admin/outreach?semesterId=semester+%26+one&opportunityId=opportunity+%26+one";
  assert.equal(digest.subject, "Almaworks: 1 outreach follow-up due");
  assert.ok(digest.text.includes(expectedUrl));
  assert.match(digest.html, /Grace &lt;Hopper&gt;/u);
  assert.match(digest.html, /Ada &lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.match(digest.html, /&lt;Engines &amp; Co&gt;/u);
  assert.match(digest.html, /Review &quot;warm&quot; introduction &amp; reply/u);
  assert.doesNotMatch(digest.html, /<script>/u);
  assert.match(digest.html, /href="https:\/\/app\.almaworks\.org\/dashboard\/admin\/outreach\?semesterId=semester\+%26\+one&amp;opportunityId=opportunity\+%26\+one"/u);
});

test("requires a public HTTPS application origin", () => {
  assert.throws(
    () => renderOutreachDigest({ appOrigin: "http://localhost:3000", items: [], ownerName: "Grace" }),
    /public HTTPS application origin/u,
  );
});
