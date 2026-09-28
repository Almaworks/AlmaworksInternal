import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFridayProgramResponse,
  FridayProgramDataError,
  parseFridayProgramQuery,
  parseGenerateFridayProgramRequest,
  parseSetFridayWeekCanceledRequest,
  parseSaveFridaySpeakerRequest,
} from "../../src/friday-program/model.ts";

const semesterId = "10000000-0000-4000-8000-000000000001";
const firstMeetingId = "20000000-0000-4000-8000-000000000001";
const secondMeetingId = "20000000-0000-4000-8000-000000000002";
const programId = "30000000-0000-4000-8000-000000000001";

test("UUID query identifiers normalize case before matching saved records", () => {
  const uppercase = "ABCDEFAB-0000-4000-8000-000000000001";
  assert.deepEqual(parseFridayProgramQuery(`http://localhost?semesterId=${uppercase}&meetingId=${uppercase}`), { semesterId: uppercase.toLowerCase(), meetingId: uppercase.toLowerCase() });
});

test("the saved agenda preserves the 15/45/30/30 flow and facilitator swap", () => {
  const result = buildFridayProgramResponse({
    semesterId,
    meetings: [
      { id: firstMeetingId, meetingDate: "2026-09-11", label: "Week 1" },
      { id: secondMeetingId, meetingDate: "2026-09-18", label: "Week 2" },
    ],
    programs: [{
      id: programId,
      meetingId: firstMeetingId,
      agendaVersion: 1,
      groupAFacilitator: "Les",
      groupBFacilitator: "Eric Chan",
      generatedAt: "2026-09-08T16:00:00.000Z",
    }],
    assignments: [
      {
        programId,
        startupSemesterId: "40000000-0000-4000-8000-000000000002",
        startupOrganizationId: "50000000-0000-4000-8000-000000000002",
        startupName: "Beta",
        startupSlug: "beta",
        group: "A",
        position: 2,
      },
      {
        programId,
        startupSemesterId: "40000000-0000-4000-8000-000000000003",
        startupOrganizationId: "50000000-0000-4000-8000-000000000003",
        startupName: "Gamma",
        startupSlug: "gamma",
        group: "B",
        position: 1,
      },
      {
        programId,
        startupSemesterId: "40000000-0000-4000-8000-000000000001",
        startupOrganizationId: "50000000-0000-4000-8000-000000000001",
        startupName: "Alpha",
        startupSlug: "alpha",
        group: "A",
        position: 1,
      },
    ],
  });

  assert.deepEqual(result.agenda, [
    { key: "standups", offsetMinutes: 0, durationMinutes: 15, label: "Startup standups" },
    { key: "speaker", offsetMinutes: 15, durationMinutes: 45, label: "Speaker session" },
    {
      key: "group_round_1",
      offsetMinutes: 60,
      durationMinutes: 30,
      label: "Small-group round 1",
      facilitators: { A: "Les", B: "Eric Chan" },
    },
    {
      key: "group_round_2",
      offsetMinutes: 90,
      durationMinutes: 30,
      label: "Small-group round 2",
      facilitators: { A: "Eric Chan", B: "Les" },
    },
  ]);
  assert.equal(result.meetings[0]?.status, "published");
  assert.deepEqual(result.meetings[0]?.program?.groups.A.map((startup) => startup.name), ["Alpha", "Beta"]);
  assert.deepEqual(result.meetings[0]?.program?.groups.B.map((startup) => startup.name), ["Gamma"]);
  assert.deepEqual(result.meetings[1], {
    meetingId: secondMeetingId,
    meetingDate: "2026-09-18",
    label: "Week 2",
    status: "unpublished",
    program: null,
    speaker: null,
  });
});

test("speaker details are attached to the matching Friday before groups are published", () => {
  const speaker = { name: "Morgan Lee", bio: "Founder and operator.", expertise: "Operations", topic: "Hiring", contactEmail: "morgan@example.com", contactPhone: null, linkedinUrl: null, websiteUrl: null };
  const result = buildFridayProgramResponse({ semesterId, meetings: [{ id: firstMeetingId, meetingDate: "2026-09-11", label: null }], programs: [], assignments: [], speakers: [{ meetingId: firstMeetingId, ...speaker }] });
  assert.deepEqual(result.meetings[0]?.speaker, speaker);
  assert.equal(result.meetings[0]?.status, "unpublished");
});

test("a canceled Friday keeps its published program and speaker in the read model", () => {
  const speaker = { name: "Morgan Lee", bio: "Founder and operator.", expertise: "Operations", topic: "Hiring", contactEmail: "morgan@example.com", contactPhone: null, linkedinUrl: null, websiteUrl: null };
  const canceledAt = "2026-09-10T15:30:00.000Z";
  const canceledByProfileId = "70000000-0000-4000-8000-000000000001";
  const result = buildFridayProgramResponse({
    semesterId,
    meetings: [{ id: firstMeetingId, meetingDate: "2026-09-11", label: "Week 1", canceledAt, canceledByProfileId }],
    programs: [{ id: programId, meetingId: firstMeetingId, agendaVersion: 1, groupAFacilitator: "Les", groupBFacilitator: "Eric Chan", generatedAt: "2026-09-08T16:00:00.000Z" }],
    assignments: [{ programId, startupSemesterId: "startup-1", startupOrganizationId: "org-1", startupName: "Alpha", startupSlug: "alpha", group: "A", position: 1 }],
    speakers: [{ meetingId: firstMeetingId, ...speaker }],
  });

  assert.equal(result.meetings[0]?.status, "canceled");
  assert.equal(result.meetings[0]?.canceledAt, canceledAt);
  assert.equal(result.meetings[0]?.canceledByProfileId, canceledByProfileId);
  assert.equal(result.meetings[0]?.program?.programId, programId);
  assert.deepEqual(result.meetings[0]?.speaker, speaker);
});

test("a canceled Friday remains canceled after its actor profile is removed", () => {
  const canceledAt = "2026-09-10T15:30:00.000Z";
  const result = buildFridayProgramResponse({
    semesterId,
    meetings: [{ id: firstMeetingId, meetingDate: "2026-09-11", label: "Week 1", canceledAt, canceledByProfileId: null }],
    programs: [],
    assignments: [],
  });
  assert.equal(result.meetings[0]?.status, "canceled");
  assert.equal(result.meetings[0]?.canceledByProfileId, null);
});

test("speaker input requires content, contact email, and safe optional URLs", () => {
  const base = { semesterId, meetingId: firstMeetingId, name: "Morgan", bio: "Founder", expertise: "Growth", topic: "Hiring", contactEmail: "morgan@example.com" };
  assert.equal(parseSaveFridaySpeakerRequest(base).speaker.name, "Morgan");
  assert.throws(() => parseSaveFridaySpeakerRequest({ ...base, name: "  " }), /Speaker name is required/u);
  assert.throws(() => parseSaveFridaySpeakerRequest({ ...base, contactEmail: "invalid" }), /Contact email must be valid/u);
  assert.throws(() => parseSaveFridaySpeakerRequest({ ...base, websiteUrl: "javascript:alert(1)" }), /HTTPS URL/u);
});

test("a published program fails closed when a saved assignment is missing its program", () => {
  assert.throws(
    () => buildFridayProgramResponse({
      semesterId,
      meetings: [{ id: firstMeetingId, meetingDate: "2026-09-11", label: null }],
      programs: [],
      assignments: [{
        programId,
        startupSemesterId: "40000000-0000-4000-8000-000000000001",
        startupOrganizationId: "50000000-0000-4000-8000-000000000001",
        startupName: "Alpha",
        startupSlug: "alpha",
        group: "A",
        position: 1,
      }],
    }),
    FridayProgramDataError,
  );
});

test("request parsers require UUID semester and meeting identifiers", () => {
  assert.deepEqual(
    parseFridayProgramQuery(`https://example.test/api/friday-program?semesterId=${semesterId}&meetingId=${firstMeetingId}`),
    { semesterId, meetingId: firstMeetingId },
  );
  assert.deepEqual(parseGenerateFridayProgramRequest({ semesterId, meetingId: firstMeetingId }), {
    semesterId,
    meetingId: firstMeetingId,
    regenerate: false,
  });
  assert.deepEqual(parseGenerateFridayProgramRequest({ semesterId, meetingId: firstMeetingId, regenerate: true }), {
    semesterId,
    meetingId: firstMeetingId,
    regenerate: true,
  });
  assert.deepEqual(parseSetFridayWeekCanceledRequest({ semesterId, meetingId: firstMeetingId, canceled: true }), {
    semesterId,
    meetingId: firstMeetingId,
    canceled: true,
  });
  assert.throws(
    () => parseSetFridayWeekCanceledRequest({ semesterId, meetingId: firstMeetingId, canceled: "true" }),
    /canceled must be a boolean/u,
  );
  assert.throws(
    () => parseGenerateFridayProgramRequest({ semesterId, meetingId: firstMeetingId, regenerate: "true" }),
    /regenerate must be a boolean/u,
  );
  assert.throws(() => parseFridayProgramQuery("https://example.test/api/friday-program"), /semesterId is required/u);
  assert.throws(
    () => parseGenerateFridayProgramRequest({ semesterId, meetingId: "meeting-1" }),
    /meetingId must be a valid UUID/u,
  );
});
