import { requireSemesterAdmin } from "@/src/auth/server";
import {
  handleOutreachJson,
  parseLegacyMigrationBody,
} from "@/src/outreach/server/http";
import { previewLegacyMigration } from "@/src/outreach/legacy-service";

export async function POST(request: Request) {
  return await handleOutreachJson(
    request,
    parseLegacyMigrationBody,
    async (body) => {
      const context = await requireSemesterAdmin(request, body.semesterId);
      return await previewLegacyMigration({
        client: context.userClient,
        userId: context.user.id,
        semesterId: body.semesterId,
      });
    },
  );
}
