import { requireSemesterAdmin } from "@/src/auth/server";
import { createAssignmentRoutes, createSupabaseAssignmentDataSource } from "@/src/assignments/server";

const routes = createAssignmentRoutes({
  authorize: async (request, semesterId) => {
    const { userClient } = await requireSemesterAdmin(request, semesterId);
    return createSupabaseAssignmentDataSource(userClient);
  },
});

export const POST = routes.commit;
