import { requireSemesterAdmin } from "@/src/auth/server";
import {
  handleOutreachJson,
  parseLegacyMigrationBody,
} from "@/src/outreach/server/http";
import { commitLegacyMigration } from "@/src/outreach/legacy-service";

export async function POST(request: Request) {
  return await handleOutreachJson(
    request,
    (value) => parseLegacyMigrationBody(value, request.headers),
    async (body) => {
      const context = await requireSemesterAdmin(request, body.semesterId);
      return await commitLegacyMigration({
        client: context.userClient,
        userId: context.user.id,
        semesterId: body.semesterId,
        idempotencyKey: body.idempotencyKey!,
      });
    },
  );
}
