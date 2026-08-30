import type { SupabaseClient, User } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUser } from "../../auth/server.ts";
import type { Database } from "../../db/types.ts";

const MAX_MANAGEABLE_SEMESTERS = 500;

export interface AllTimeOutreachSemester {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

export interface AllTimeOutreachContext {
  user: User;
  userClient: SupabaseClient<Database>;
  manageableSemesters: readonly AllTimeOutreachSemester[];
}

type AuthenticateAllTimeRequest = (request: Request) => Promise<{
  user: User;
  userClient: SupabaseClient<Database>;
}>;

export function createRequireAllTimeOutreachAccess(authenticate: AuthenticateAllTimeRequest) {
  return async function authorizeAllTimeOutreach(
    request: Request,
  ): Promise<AllTimeOutreachContext> {
  const { user, userClient } = await authenticate(request);
  const { data: canManageAny, error: authorizationError } = await userClient.rpc(
    "can_manage_any_outreach",
    { candidate_id: user.id },
  );
  if (authorizationError !== null || canManageAny !== true) {
    throw new AuthorizationError("All-time outreach administrator access required.", 403);
  }

  const { data: semesterRows, error: semesterError } = await userClient
    .from("semesters")
    .select("id, name, start_date, end_date, is_active")
    .order("start_date", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_MANAGEABLE_SEMESTERS + 1);
  if (semesterError !== null) {
    throw new AuthorizationError("Unable to verify manageable outreach semesters.", 500);
  }
  if ((semesterRows?.length ?? 0) > MAX_MANAGEABLE_SEMESTERS) {
    throw new AuthorizationError(
      `All-time outreach exceeds the ${MAX_MANAGEABLE_SEMESTERS}-semester authorization bound.`,
      500,
    );
  }

  const authorizationResults = await Promise.all((semesterRows ?? []).map(async (semester) => ({
    semester,
    result: await userClient.rpc("can_manage_semester", {
      candidate_id: user.id,
      target_semester_id: semester.id,
    }),
  })));
  if (authorizationResults.some(({ result }) => result.error !== null)) {
    throw new AuthorizationError("Unable to verify manageable outreach semesters.", 500);
  }

  return {
    user,
    userClient,
    manageableSemesters: authorizationResults
      .filter(({ result }) => result.data === true)
      .map(({ semester }) => ({
        id: semester.id,
        name: semester.name,
        startsOn: semester.start_date,
        endsOn: semester.end_date,
        isActive: semester.is_active,
      })),
  };
  };
}

export const requireAllTimeOutreachAccess = createRequireAllTimeOutreachAccess(
  requireAuthenticatedUser,
);
