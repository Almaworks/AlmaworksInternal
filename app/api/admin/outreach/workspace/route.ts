import { requireSemesterAdmin } from "@/src/auth/server";
import { requireAllTimeOutreachAccess } from "@/src/outreach/server/all-time-authorization";
import {
  handleOutreachOperation,
  parseWorkspaceQuery,
} from "@/src/outreach/server/http";

import { loadAllTimeWorkspaceResponse, loadWorkspaceResponse } from "../_data";

export async function GET(request: Request) {
  return await handleOutreachOperation(async () => {
    const query = parseWorkspaceQuery(new URL(request.url));
    if (query.semesterId === "all") {
      const { userClient, manageableSemesters } = await requireAllTimeOutreachAccess(request);
      return await loadAllTimeWorkspaceResponse(userClient, {
        cursor: query.cursor,
        pageSize: query.pageSize,
        semesters: manageableSemesters,
      });
    }
    const { userClient } = await requireSemesterAdmin(request, query.semesterId);
    return await loadWorkspaceResponse(userClient, query);
  });
}
