import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import {
  CohortCommandError,
  createBulkSetMembershipActivityCommand,
} from "@/src/lifecycle/cohort-commands";
import { CohortValidationError, parseBulkLifecycleRequest } from "@/src/lifecycle/cohort-management";

const command = createBulkSetMembershipActivityCommand(async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    bulkSetMembershipActivity: async (args) => await userClient.rpc("bulk_set_membership_activity", args),
  };
});

export async function PATCH(request: Request) {
  try {
    const body = parseBulkLifecycleRequest(await request.json());
    return NextResponse.json(await command({ request, ...body }));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CohortCommandError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "partial_update" ? 409 : 400 });
    }
    if (error instanceof CohortValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update memberships." },
      { status: 500 },
    );
  }
}
