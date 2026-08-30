import { requireSemesterAdmin } from "@/src/auth/server";
import {
  handleOutreachJson,
  parseImportCommitBody,
} from "@/src/outreach/server/http";
import { commitImport } from "@/src/outreach/import-flow";

interface RouteContext {
  params: Promise<{ importId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { importId } = await context.params;
  return await handleOutreachJson(
    request,
    (value) => parseImportCommitBody(
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, importId }
        : value,
      request.headers,
    ),
    async (body) => {
      const context = await requireSemesterAdmin(request, body.semesterId);
      return await commitImport({
        client: context.userClient,
        userId: context.user.id,
        semesterId: body.semesterId,
        importId: body.importId,
        idempotencyKey: body.idempotencyKey,
      });
    },
  );
}
