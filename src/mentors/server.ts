import { requireSemesterAdmin } from "@/src/auth/server";
import { createMentorAccessCommand } from "@/src/mentors/access";

export const setMentorAccess = createMentorAccessCommand(async (request, semesterId) => {
  const context = await requireSemesterAdmin(request, semesterId);
  return {
    setGlobalMentorAccountAccess: async (args) =>
      await context.userClient.rpc("set_mentor_account_access", args),
    setSemesterMembershipActivity: async (args) =>
      await context.userClient.rpc("bulk_set_membership_activity", args),
    updateAuthUser: async (userId, attributes) => {
      const { error } = await context.adminClient.auth.admin.updateUserById(userId, attributes);
      return { error };
    },
  };
});
