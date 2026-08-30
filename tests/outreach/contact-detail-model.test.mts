import assert from "node:assert/strict";
import test from "node:test";

import { contactDetailFromResponse } from "../../app/dashboard/admin/outreach/components/contact-detail-model.ts";

test("contact detail response exposes the editable contact and activity timeline", () => {
  const detail = contactDetailFromResponse({
    data: {
      contact: {
        id: "contact-1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        linkedinUrl: null,
        phone: null,
        biography: null,
        expertiseTags: ["AI"],
        notes: null,
        updatedAt: "2026-08-24T12:00:00.000Z",
      },
      activities: [{
        id: "activity-1",
        activityKind: "note",
        channel: null,
        occurredAt: "2026-08-24T12:00:00.000Z",
        summary: "Met at demo day",
        actorProfileId: null,
      }],
    },
  });

  assert.equal(detail?.contact.fullName, "Ada Lovelace");
  assert.equal(detail?.activities[0]?.summary, "Met at demo day");
});

test("contact detail response rejects incomplete data", () => {
  assert.equal(contactDetailFromResponse({ data: { activities: [] } }), null);
});
