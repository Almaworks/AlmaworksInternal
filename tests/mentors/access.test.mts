import assert from "node:assert/strict";
import test from "node:test";

const subject = await import("../../src/mentors/access.ts").catch(() => null);

test("semester removal suspends only the selected membership and never changes Auth", async () => {
  assert.ok(subject, "the mentor access command must exist");
  if (!subject) return;
  const events: unknown[] = [];
  const command = subject.createMentorAccessCommand(async (_request, semesterId) => {
    events.push({ authorizedSemesterId: semesterId });
    return {
      setGlobalMentorAccountAccess: async () => {
        throw new Error("global access must not be changed");
      },
      setSemesterMembershipActivity: async (args) => {
        events.push(args);
        return { data: 1, error: null };
      },
      updateAuthUser: async () => {
        throw new Error("Auth must not be changed for semester removal");
      },
    };
  });

  const result = await command({
    enabled: false,
    membershipId: "membership-spring",
    mentorSemesterId: "mentor-spring",
    request: new Request("https://almaworks.example.test/mentors/access"),
    scope: "semester",
    semesterId: "spring-2027",
  });

  assert.deepEqual(events, [
    { authorizedSemesterId: "spring-2027" },
    {
      p_is_active: false,
      p_membership_ids: ["membership-spring"],
      p_semester_id: "spring-2027",
    },
  ]);
  assert.deepEqual(result, { scope: "semester", status: "suspended", updated: 1 });
});

test("global disable blocks the durable profile before banning the Auth identity", async () => {
  assert.ok(subject, "the mentor access command must exist");
  if (!subject) return;
  const events: unknown[] = [];
  const command = subject.createMentorAccessCommand(async () => ({
    setGlobalMentorAccountAccess: async (args) => {
      events.push({ database: args });
      return {
        data: [{
          auth_user_id: "auth-mentor",
          profile_id: "profile-mentor",
          profile_is_active: false,
          suspended_membership_ids: ["membership-spring"],
        }],
        error: null,
      };
    },
    setSemesterMembershipActivity: async () => {
      throw new Error("semester-only RPC must not be used");
    },
    updateAuthUser: async (userId, attributes) => {
      events.push({ auth: { attributes, userId } });
      return { error: null };
    },
  }));

  const result = await command({
    enabled: false,
    membershipId: "membership-spring",
    mentorSemesterId: "mentor-spring",
    request: new Request("https://almaworks.example.test/mentors/access"),
    scope: "global",
    semesterId: "spring-2027",
  });

  assert.deepEqual(events, [
    { database: { p_enabled: false, p_mentor_semester_id: "mentor-spring" } },
    { auth: { attributes: { ban_duration: "876000h" }, userId: "auth-mentor" } },
  ]);
  assert.deepEqual(result, {
    authUpdated: true,
    profileId: "profile-mentor",
    scope: "global",
    status: "disabled",
    suspendedMembershipIds: ["membership-spring"],
  });
});

test("global reinstatement unbans the identity without silently restoring a semester membership", async () => {
  assert.ok(subject, "the mentor access command must exist");
  if (!subject) return;
  const events: unknown[] = [];
  const command = subject.createMentorAccessCommand(async () => ({
    setGlobalMentorAccountAccess: async (args) => {
      events.push({ database: args });
      return {
        data: [{
          auth_user_id: "auth-mentor",
          profile_id: "profile-mentor",
          profile_is_active: true,
          suspended_membership_ids: [],
        }],
        error: null,
      };
    },
    setSemesterMembershipActivity: async () => {
      throw new Error("semester-only RPC must not be used");
    },
    updateAuthUser: async (userId, attributes) => {
      events.push({ auth: { attributes, userId } });
      return { error: null };
    },
  }));

  const result = await command({
    enabled: true,
    membershipId: "membership-spring",
    mentorSemesterId: "mentor-spring",
    request: new Request("https://almaworks.example.test/mentors/access"),
    scope: "global",
    semesterId: "spring-2027",
  });

  assert.deepEqual(events, [
    { database: { p_enabled: true, p_mentor_semester_id: "mentor-spring" } },
    { auth: { attributes: { ban_duration: "none" }, userId: "auth-mentor" } },
  ]);
  assert.deepEqual(result, {
    authUpdated: true,
    profileId: "profile-mentor",
    scope: "global",
    status: "reinstated",
    suspendedMembershipIds: [],
  });
});

test("an Auth failure reports reconciliation while leaving the database access block in place", async () => {
  assert.ok(subject, "the mentor access command must exist");
  if (!subject) return;
  const command = subject.createMentorAccessCommand(async () => ({
    setGlobalMentorAccountAccess: async () => ({
      data: [{
        auth_user_id: "auth-mentor",
        profile_id: "profile-mentor",
        profile_is_active: false,
        suspended_membership_ids: ["membership-spring"],
      }],
      error: null,
    }),
    setSemesterMembershipActivity: async () => ({ data: 0, error: null }),
    updateAuthUser: async () => ({ error: { message: "Auth service unavailable" } }),
  }));

  await assert.rejects(
    command({
      enabled: false,
      membershipId: "membership-spring",
      mentorSemesterId: "mentor-spring",
      request: new Request("https://almaworks.example.test/mentors/access"),
      scope: "global",
      semesterId: "spring-2027",
    }),
    (error: unknown) => error instanceof subject.MentorAccessReconciliationError
      && error.databaseState === "disabled"
      && /Auth service unavailable/u.test(error.message),
  );
});

test("mentor access presentation distinguishes semester removal from global disable", () => {
  assert.ok(subject, "the mentor access presentation must exist");
  if (!subject) return;
  assert.deepEqual(subject.mentorAccessPresentation({ membershipStatus: "active", profileActive: true }), {
    label: "Active",
    semesterAction: "remove",
    tone: "success",
  });
  assert.deepEqual(subject.mentorAccessPresentation({ membershipStatus: "suspended", profileActive: true }), {
    label: "Removed from semester",
    semesterAction: "restore",
    tone: "muted",
  });
  assert.deepEqual(subject.mentorAccessPresentation({ membershipStatus: "suspended", profileActive: false }), {
    label: "Account disabled",
    semesterAction: null,
    tone: "danger",
  });
});

test("mentor access request parsing rejects ambiguous destructive actions", () => {
  assert.ok(subject, "the mentor access parser must exist");
  if (!subject) return;
  assert.deepEqual(subject.parseMentorAccessRequest({
    enabled: false,
    membershipId: "10000000-0000-4000-8000-000000000001",
    scope: "semester",
    semesterId: "20000000-0000-4000-8000-000000000001",
  }), {
    enabled: false,
    membershipId: "10000000-0000-4000-8000-000000000001",
    scope: "semester",
    semesterId: "20000000-0000-4000-8000-000000000001",
  });
  assert.throws(
    () => subject.parseMentorAccessRequest({ enabled: false, scope: "everywhere" }),
    /scope must be semester or global/u,
  );
  assert.throws(
    () => subject.parseMentorAccessRequest({ enabled: "false", scope: "global" }),
    /enabled must be a boolean/u,
  );
});
