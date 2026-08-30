import assert from "node:assert/strict";
import test from "node:test";

import { filterCompanyPeople, groupWorkspaceRowsByCompany } from "../../app/dashboard/admin/outreach/components/company-view-model.ts";

const rows = [
  { id: "one", contactName: "Ada Lovelace", companyName: "Brightbox", companyDomain: "brightbox.example", stage: "contacted" },
  { id: "two", contactName: "Grace Hopper", companyName: "Brightbox", companyDomain: "brightbox.example", stage: "closed" },
  { id: "three", contactName: "Linus Torvalds", companyName: null, companyDomain: null, stage: "ready" },
] as const;

test("company grouping keeps related people together and counts only non-closed opportunities as open", () => {
  assert.deepEqual(groupWorkspaceRowsByCompany(rows), [
    { name: "Brightbox", domain: "brightbox.example", people: [rows[0], rows[1]], openOpportunityCount: 1 },
    { name: "Independent / no company", domain: null, people: [rows[2]], openOpportunityCount: 1 },
  ]);
});

test("person search within a company is case-insensitive and matches a partial name", () => {
  assert.deepEqual(filterCompanyPeople(rows.slice(0, 2), "  hopper "), [rows[1]]);
});
