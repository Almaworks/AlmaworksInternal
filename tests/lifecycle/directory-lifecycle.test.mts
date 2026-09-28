import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { membershipPresentation } from "../../src/lifecycle/membership-presentation.ts";
import { loadMentorDirectory, loadStartupDirectory } from "../../src/program/canonical-repository.ts";
import { createClient } from "@supabase/supabase-js";

function directoryClient(response: unknown) {
  return createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async () => new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    },
  });
}

function mentorRow(status: "onboarding" | "active" | "alumni" | "suspended", readiness: "ready") {
  return {
    general_availability: null,
    id: `${status}-mentor`,
    membership: {
      id: `${status}-membership`,
      profile_id: `${status}-profile`,
      status,
      profile: { email: `${status}@example.com`, full_name: `${status} mentor`, is_active: false },
    },
    opening_talk: null,
    per_week_availability: null,
    preferred_format: null,
    readiness_status: readiness,
    semester: { name: "Fall 2026" },
    semester_id: "fall-2026",
  };
}

function startupRow(status: "onboarding" | "active" | "alumni" | "suspended", readiness: "ready") {
  return {
    goals: [],
    id: `${status}-startup`,
    mentorship_needs: [],
    organization: {
      description: null,
      id: `${status}-organization`,
      industry: null,
      logo_url: null,
      name: `${status} startup`,
      slug: `${status}-startup`,
      website_url: null,
    },
    readiness_status: readiness,
    semester: { name: "Fall 2026" },
    semester_id: "fall-2026",
    stage: null,
    team: [{
      is_primary_contact: true,
      semester_id: "fall-2026",
      membership: {
        id: `${status}-membership`,
        profile_id: `${status}-profile`,
        semester_id: "fall-2026",
        status,
        profile: { email: `${status}@example.com`, full_name: `${status} founder`, is_active: false },
      },
    }],
  };
}

const expectedLabels = new Map([
  ["onboarding", "Ready for activation"],
  ["active", "Active"],
  ["alumni", "Alumni"],
  ["suspended", "Suspended"],
] as const);

test("mentor directory preserves canonical lifecycle inputs despite an inactive profile", async () => {
  for (const status of expectedLabels.keys()) {
    const [mentor] = await loadMentorDirectory(directoryClient([mentorRow(status, "ready")]));
    assert.equal(mentor.membership_status, status);
    assert.equal(mentor.readiness_status, "ready");
    assert.equal(
      membershipPresentation({ status: mentor.membership_status, readinessStatus: mentor.readiness_status }).label,
      expectedLabels.get(status),
    );
  }
});

test("startup directory ignores a cross-semester primary contact in favor of a same-semester team member", async () => {
  const row = startupRow("active", "ready");
  row.team = [
    {
      is_primary_contact: true,
      semester_id: "spring-2025",
      membership: {
        id: "cross-semester-membership",
        profile_id: "cross-semester-profile",
        semester_id: "spring-2025",
        status: "suspended",
        profile: { email: "cross-semester@example.com", full_name: "Cross-semester founder", is_active: true },
      },
    },
    {
      is_primary_contact: false,
      semester_id: "fall-2026",
      membership: {
        id: "same-semester-membership",
        profile_id: "same-semester-profile",
        semester_id: "fall-2026",
        status: "active",
        profile: { email: "same-semester@example.com", full_name: "Same-semester founder", is_active: true },
      },
    },
  ];

  const [startup] = await loadStartupDirectory(directoryClient([row]));

  assert.equal(startup.membership_status, "active");
  assert.equal(startup.membership_email, "same-semester@example.com");
});

test("startup directory preserves canonical lifecycle inputs from its primary membership", async () => {
  for (const status of expectedLabels.keys()) {
    const [startup] = await loadStartupDirectory(directoryClient([startupRow(status, "ready")]));
    assert.equal(startup.membership_status, status);
    assert.equal(startup.readiness_status, "ready");
    assert.equal(
      membershipPresentation({ status: startup.membership_status, readinessStatus: startup.readiness_status }).label,
      expectedLabels.get(status),
    );
  }
});

test("directory pages present lifecycle status without a direct boolean lifecycle mutation", async () => {
  const [mentorPage, adminPage] = await Promise.all([
    readFile(new URL("../../app/dashboard/admin/mentors/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(mentorPage, /toggleActive\(/u);
  assert.match(mentorPage, /membershipPresentation\(/u);
  assert.match(mentorPage, /adminMemberHref\(/u);
  assert.match(adminPage, /membershipPresentation\(/u);
  assert.match(adminPage, /adminMemberHref\(/u);
  assert.match(adminPage, /searchParams\.get\('member'\)/u);
  assert.match(adminPage, /memberDeepLinkState\(memberParam\)/u);
  assert.match(adminPage, /setMemberSearch\(deepLinkState\.search\)/u);
  assert.match(adminPage, /setMemberVisibility\(deepLinkState\.visibility\)/u);
  assert.match(adminPage, /setCohortSelected\(deepLinkState\.selectedMembershipIds\)/u);
  assert.match(mentorPage, /adminMemberHref\(m\.email, m\.semester_id\)/u);
  assert.match(adminPage, /adminMemberHref\(s\.membership_email, s\.semester_id\)/u);
  assert.match(adminPage, /useCohortScreen\(memberReferences, 'all', searchParams\.get\('semester'\) \?\? undefined, tab !== 'overview' && tab !== 'friday-program'\)/u);
});
