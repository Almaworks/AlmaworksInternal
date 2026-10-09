import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVATION_TAB_LABEL,
  activationAttentionCount,
  membersReadyForActivation,
} from "../../src/lifecycle/admin-activation.ts";
import type { CohortMember } from "../../src/lifecycle/cohort-management.ts";

const members: CohortMember[] = [
  {
    membershipId: "ready-membership",
    profileId: "ready-profile",
    name: "Ready Mentor",
    email: "ready@example.com",
    role: "mentor",
    status: "onboarding",
    readinessStatus: "ready",
    semesterId: "current-semester",
    semesterName: "Fall 2026",
  },
  {
    membershipId: "in-progress-membership",
    profileId: "in-progress-profile",
    name: "In progress Startup",
    email: "progress@example.com",
    role: "startup",
    status: "onboarding",
    readinessStatus: "in_progress",
    semesterId: "current-semester",
    semesterName: "Fall 2026",
  },
  {
    membershipId: "invited-membership",
    profileId: "invited-profile",
    name: "Invited Mentor",
    email: "invited@example.com",
    role: "mentor",
    status: "invited",
    readinessStatus: "ready",
    semesterId: "current-semester",
    semesterName: "Fall 2026",
  },
  {
    membershipId: "active-membership",
    profileId: "active-profile",
    name: "Active Mentor",
    email: "active@example.com",
    role: "mentor",
    status: "active",
    readinessStatus: "ready",
    semesterId: "current-semester",
    semesterName: "Fall 2026",
  },
];

test("activation workspace lists only onboarding members ready for activation", () => {
  assert.deepEqual(membersReadyForActivation(members).map((member) => member.membershipId), ["ready-membership"]);
});

test("activation badge combines ready members and registration requests", () => {
  assert.equal(activationAttentionCount(members, 2), 3);
});

test("activation workspace uses the needs activation label", () => {
  assert.equal(ACTIVATION_TAB_LABEL, "Needs activation");
});

test("admin activation UI consumes the separately loaded current-semester model", () => {
  const page = readFileSync(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");
  assert.match(
    page,
    /activationWorkspaceState\(cohort\.currentMembers, cohort\.cohorts\.current\?\.id \?\? null, pendingUsers\.length\)/u,
  );
});

test("all-time activation workspace disables registration-request mutations", () => {
  const page = readFileSync(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");
  const registrationRequests = page.slice(
    page.indexOf("Registration requests"),
    page.indexOf("{tab === 'members'"),
  );

  assert.match(registrationRequests, /<select[\s\S]*?disabled=\{cohort\.scope === 'all' \|\| deletionLockedIds\.has\(u\.id\)\}/);
  assert.match(registrationRequests, /onClick=\{\(\) => approveUser\(u\.id\)\}[\s\S]*?disabled=\{approving === u\.id \|\| !roleSelections\[u\.id\] \|\| cohort\.scope === 'all' \|\| deletionLockedIds\.has\(u\.id\)\}/);
  assert.match(registrationRequests, /onClick=\{\(\) => rejectUser\(u\.id\)\}[\s\S]*?disabled=\{cohort\.scope === 'all' \|\| deletionLockedIds\.has\(u\.id\)\}/);
});

test("member account changes refresh current activation and directory read models", () => {
  const page = readFileSync(new URL("../../app/dashboard/admin/page.tsx", import.meta.url), "utf8");

  assert.match(
    page,
    /const membershipRefreshes = \(\) => \[loadAll, cohort\.reload, cohort\.reloadCurrent\] as const/u,
  );
  assert.match(
    page,
    /async function refreshMemberLoginReadModels\(\)[\s\S]*?refreshMembershipReadModels\(membershipRefreshes\(\)\)/u,
  );
});
