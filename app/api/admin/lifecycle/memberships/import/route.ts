import { NextResponse } from "next/server";

import { AuthorizationError, requireSemesterAdmin } from "@/src/auth/server";
import {
  CohortCommandError,
  createImportPriorMembershipsCommand,
} from "@/src/lifecycle/cohort-commands";
import { CohortValidationError, parseImportMembershipsRequest } from "@/src/lifecycle/cohort-management";

const command = createImportPriorMembershipsCommand(async (request, semesterId) => {
  const { userClient } = await requireSemesterAdmin(request, semesterId);
  return {
    importPriorMemberships: async (args) => {
      if (args.p_membership_ids === null) {
        return await userClient.rpc("import_prior_semester_memberships", {
          p_source_semester_id: args.p_source_semester_id,
          p_target_semester_id: args.p_target_semester_id,
        });
      }
      return await userClient.rpc("import_prior_semester_memberships", {
        p_source_semester_id: args.p_source_semester_id,
        p_target_semester_id: args.p_target_semester_id,
        p_membership_ids: args.p_membership_ids,
      });
    },
  };
});

export async function POST(request: Request) {
  try {
    const body = parseImportMembershipsRequest(await request.json());
    return NextResponse.json(await command({ request, ...body }));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CohortCommandError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CohortValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import memberships." },
      { status: 500 },
    );
  }
}
