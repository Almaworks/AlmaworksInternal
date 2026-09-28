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
  profileId: string;
  user: User;
  userClient: SupabaseClient<Database>;
}>;

export function createRequireAllTimeOutreachAccess(authenticate: AuthenticateAllTimeRequest) {
  return async function authorizeAllTimeOutreach(
    request: Request,
  ): Promise<AllTimeOutreachContext> {
    const { profileId, user, userClient } = await authenticate(request);
    // Same authority as can_manage_semester, using the authenticated profile from
    // the server context. RLS still filters every read; never accept browser IDs.
    const [platform, memberships, semesters] = await Promise.all([
      userClient.from('platform_roles').select('role').eq('profile_id', profileId).eq('role', 'super_admin'),
      userClient.from('semester_memberships').select('semester_id').eq('profile_id', profileId).eq('role', 'admin').eq('status', 'active'),
      userClient.from('semesters').select('id, name, start_date, end_date, is_active')
        .order('start_date', { ascending: false }).order('id', { ascending: true }).limit(MAX_MANAGEABLE_SEMESTERS + 1),
    ]);
    const semesterRows = semesters.data;
    const semesterError = platform.error ?? memberships.error ?? semesters.error;
    if (semesterError !== null) {
      throw new AuthorizationError("Unable to verify manageable outreach semesters.", 500);
    }
    if ((semesterRows?.length ?? 0) > MAX_MANAGEABLE_SEMESTERS) {
      throw new AuthorizationError(
        `All-time outreach exceeds the ${MAX_MANAGEABLE_SEMESTERS}-semester authorization bound.`,
        500,
      );
    }

    const isSuperAdmin = platform.data?.some(row => row.role === 'super_admin') === true;
    const manageableIds = new Set((memberships.data ?? []).map(row => row.semester_id));
    const manageable = (semesterRows ?? []).filter(semester => isSuperAdmin || manageableIds.has(semester.id));
    if (manageable.length === 0) throw new AuthorizationError('All-time outreach administrator access required.', 403);

    return {
      user,
      userClient,
      manageableSemesters: manageable.map((semester) => ({
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
