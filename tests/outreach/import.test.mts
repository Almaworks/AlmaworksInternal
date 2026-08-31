import assert from "node:assert/strict";
import test from "node:test";

import { representativeLegacyExportRow } from "./fixtures/legacy-export.mts";
import {
  matchOutreachRow,
  normalizeOutreachRow,
  summarizeImportPreview,
  type ImportCandidateIndex,
} from "../../src/outreach/import.ts";

const candidates: ImportCandidateIndex = {
  contacts: [
    {
      id: "contact-email",
      email: "ada@example.com",
      linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
      fullName: "Ada Lovelace",
      company: "Analytical Engines",
    },
    {
      id: "contact-linkedin",
      email: "grace@example.com",
      linkedinUrl: "https://www.linkedin.com/in/grace-hopper",
      fullName: "Grace Hopper",
      company: "Navy",
    },
    {
      id: "contact-fuzzy",
      email: null,
      linkedinUrl: null,
      fullName: "Margaret Hamilton",
      company: "Apollo Software, Inc.",
    },
  ],
  owners: [{ id: "owner-ada", fullName: "Ada Owner", isActive: true }],
  companies: [
    { id: "company-1", name: "Ambiguous Labs" },
    { id: "company-2", name: "ambiguous labs" },
  ],
};

test("normalizes legacy contact fields into a canonical editable row", () => {
  const row = normalizeOutreachRow(
    {
      prospect_name: "  Ada Lovelace  ",
      prospect_email: " ADA@Example.COM ",
      linkedin_url: "linkedin.com/in/Ada-Lovelace/?trk=public_profile",
      company: "  Analytical Engines  ",
      status: "onboarded",
      outreach_type: "Mentor, investor, MENTOR, Partner",
      who_reached_out: " Ada Owner ",
    },
    8,
  );

  assert.deepEqual(row, {
    rowNumber: 8,
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
    company: "Analytical Engines",
    companyDomain: "example.com",
    stage: "closed",
    relationshipLabels: ["mentor", "investor", "partner"],
    ownerName: "Ada Owner",
    issues: [],
  });
});

test("keeps malformed identity rows editable with validation issue codes", () => {
  const malformedEmail = normalizeOutreachRow(
    { prospect_name: "  Grace Hopper ", prospect_email: "not-an-email" },
    9,
  );
  const missingIdentity = normalizeOutreachRow({ company: "No Contact Co." }, 10);

  assert.equal(malformedEmail.fullName, "Grace Hopper");
  assert.equal(malformedEmail.email, null);
  assert.deepEqual(malformedEmail.issues, ["email_invalid"]);
  assert.equal(missingIdentity.email, null);
  assert.equal(missingIdentity.fullName, null);
  assert.deepEqual(missingIdentity.issues, ["identity_missing"]);
});

test("normalizes real CSV headers after removing case and spacing differences", () => {
  const row = normalizeOutreachRow(representativeLegacyExportRow, 10);

  assert.deepEqual(row, {
    rowNumber: 10,
    fullName: "Lin-Manuel Miranda",
    email: "lin.miranda@example.org",
    linkedinUrl: "https://www.linkedin.com/in/lin-manuel-miranda",
    company: "Example Studios",
    companyDomain: "example.org",
    stage: "contacted",
    relationshipLabels: ["speaker", "investor"],
    ownerName: "Ada Owner",
    issues: [],
  });
});

test("maps legacy waiting and response statuses to outreach stages", () => {
  const expectedStages = {
    Waiting: "not_contacted",
    No: "declined",
    "Haven't reached": "not_contacted",
    "Reached out": "contacted",
    Confirmed: "replied",
  } as const;

  for (const [status, stage] of Object.entries(expectedStages)) {
    assert.equal(normalizeOutreachRow({ Name: "Stage Contact", Status: status }, 11).stage, stage);
  }
});

test("matches exact email before an otherwise different LinkedIn candidate", () => {
  const row = normalizeOutreachRow(
    {
      prospect_name: "Ada Lovelace",
      prospect_email: "ada@example.com",
      linkedin_url: "https://linkedin.com/in/grace-hopper",
    },
    11,
  );

  assert.deepEqual(matchOutreachRow(row, candidates), {
    disposition: "matched",
    contactId: "contact-email",
    suggestedContactId: null,
    matchSource: "email",
    ownerId: null,
    issues: [],
  });
});

test("uses canonical LinkedIn when email is absent", () => {
  const row = normalizeOutreachRow(
    { prospect_name: "Grace Hopper", linkedin_url: "www.linkedin.com/in/Grace-Hopper/" },
    12,
  );

  assert.equal(matchOutreachRow(row, candidates).disposition, "matched");
  assert.equal(matchOutreachRow(row, candidates).contactId, "contact-linkedin");
  assert.equal(matchOutreachRow(row, candidates).matchSource, "linkedin");
});

test("requires review when multiple contacts share an exact normalized email", () => {
  const row = normalizeOutreachRow({ Name: "Duplicate Email", "Contact info": "DUPLICATE@EXAMPLE.COM" }, 12);
  const duplicateCandidates: ImportCandidateIndex = {
    contacts: [
      { id: "first", email: "duplicate@example.com", linkedinUrl: null, fullName: "First", company: null },
      { id: "second", email: "Duplicate@Example.com", linkedinUrl: null, fullName: "Second", company: null },
    ],
  };

  assert.deepEqual(matchOutreachRow(row, duplicateCandidates), {
    disposition: "review_required",
    contactId: null,
    suggestedContactId: null,
    matchSource: "email",
    ownerId: null,
    issues: ["contact_ambiguous"],
  });
});

test("requires review when multiple contacts share a canonical LinkedIn profile", () => {
  const row = normalizeOutreachRow({ Name: "Duplicate LinkedIn", Linkedin: "linkedin.com/in/duplicate" }, 13);
  const duplicateCandidates: ImportCandidateIndex = {
    contacts: [
      { id: "first", email: null, linkedinUrl: "https://linkedin.com/in/Duplicate/", fullName: "First", company: null },
      { id: "second", email: null, linkedinUrl: "www.linkedin.com/in/duplicate?trk=public", fullName: "Second", company: null },
    ],
  };

  assert.deepEqual(matchOutreachRow(row, duplicateCandidates), {
    disposition: "review_required",
    contactId: null,
    suggestedContactId: null,
    matchSource: "linkedin",
    ownerId: null,
    issues: ["contact_ambiguous"],
  });
});

test("returns fuzzy name and company candidates for review instead of auto-merging", () => {
  const row = normalizeOutreachRow(
    { prospect_name: "Margaret Hamilton", company: "Apollo Software" },
    13,
  );

  assert.deepEqual(matchOutreachRow(row, candidates), {
    disposition: "review_required",
    contactId: null,
    suggestedContactId: "contact-fuzzy",
    matchSource: "name_company",
    ownerId: null,
    issues: [],
  });
});

test("surfaces unresolved owners and ambiguous companies without throwing", () => {
  const row = normalizeOutreachRow(
    {
      prospect_name: "New Person",
      company: "Ambiguous Labs",
      who_reached_out: "Missing Owner",
    },
    14,
  );

  assert.deepEqual(matchOutreachRow(row, candidates), {
    disposition: "create",
    contactId: null,
    suggestedContactId: null,
    matchSource: null,
    ownerId: null,
    issues: ["owner_unmatched", "company_ambiguous"],
  });
});

test("summarizes matching dispositions and rows that need review", () => {
  const decisions = [
    matchOutreachRow(normalizeOutreachRow({ prospect_email: "ada@example.com" }, 15), candidates),
    matchOutreachRow(normalizeOutreachRow({ prospect_name: "Margaret Hamilton", company: "Apollo Software" }, 16), candidates),
    matchOutreachRow(normalizeOutreachRow({ company: "No identity" }, 17), candidates),
    matchOutreachRow(normalizeOutreachRow({ prospect_name: "New Person" }, 18), candidates),
  ];

  assert.deepEqual(summarizeImportPreview(decisions), {
    totalRows: 4,
    matchedRows: 1,
    createRows: 1,
    reviewRequiredRows: 1,
    invalidRows: 1,
    rowsWithIssues: 1,
  });
});
