import { requireSemesterAdmin } from "@/src/auth/server";
import {
  handleOutreachJson,
  parseImportPreviewBody,
} from "@/src/outreach/server/http";
import { createImportPreview } from "@/src/outreach/import-flow";

export async function POST(request: Request) {
  return await handleOutreachJson(request, parseImportPreviewBody, async (body) => {
    const context = await requireSemesterAdmin(request, body.semesterId);
    return await createImportPreview({
      client: context.userClient,
      userId: context.user.id,
      semesterId: body.semesterId,
      source: body.source,
      ...(body.sourceFilename === undefined ? {} : { sourceFilename: body.sourceFilename }),
      rows: body.rows,
    });
  });
}
