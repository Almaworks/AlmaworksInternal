import { parseMemberDeletionBody } from "../../../../../../src/auth/member-deletion.ts";
import {
  authorizeMemberDeletionClient,
  deleteMemberPersonalData,
  MemberDeletionError,
  previewMemberDeletion,
  type MemberDeletionClient,
} from "../../../../../../src/auth/member-deletion-server.ts";
import { AuthorizationError } from "../../../../../../src/auth/server.ts";
import type { MemberDeletionPreview } from "../../../../../../src/auth/member-deletion.ts";

type Context = { params: Promise<{ profileId: string }> };
interface Dependencies {
  authorize(request: Request): Promise<MemberDeletionClient>;
  preview(client: MemberDeletionClient, profileId: string): Promise<MemberDeletionPreview>;
  remove(client: MemberDeletionClient, input: {
    profileId: string; confirmationEmail: string; reason: string; version: string;
  }): Promise<{ profileId: string; status: "completed" }>;
}
class RequestValidationError extends Error {}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}
function errorResponse(error: unknown): Response {
  if (error instanceof RequestValidationError) return response({ error: { code: "validation_error", message: error.message } }, 400);
  if (error instanceof AuthorizationError) return response({ error: {
    code: error.status === 401 ? "unauthenticated" : error.status === 403 ? "forbidden" : "internal_error",
    message: error.message,
  } }, error.status);
  if (error instanceof MemberDeletionError) {
    if (["PGRST202", "42883"].includes(error.code)) return response({ error: {
      code: "database_update_required",
      message: "Permanent deletion is not available until the database update is installed.",
    } }, 503);
    const status = error.reconciliationRequired ? 502
      : error.code === "42501" ? 403
      : error.code === "P0002" ? 404
      : ["PT409", "40001", "55000", "23505", "40P01"].includes(error.code) ? 409
      : error.code === "22023" ? 400 : 500;
    const code = error.reconciliationRequired ? error.code
      : status === 403 ? "forbidden" : status === 404 ? "not_found"
      : status === 409 ? "conflict" : status === 400 ? "validation_error" : "internal_error";
    return response({ error: { code, message: error.message,
      ...(error.reconciliationRequired ? { reconciliationRequired: true } : {}) } }, status);
  }
  return response({ error: { code: "internal_error", message: "Unable to complete member deletion." } }, 500);
}
function validateProfileId(value: string): string {
  if (!uuidPattern.test(value)) throw new RequestValidationError("profileId must be a valid UUID.");
  return value;
}

export function createMemberDeletionHandlers(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    authorize: authorizeMemberDeletionClient, preview: previewMemberDeletion,
    remove: deleteMemberPersonalData, ...overrides,
  };
  return {
    async GET(request: Request, context: Context): Promise<Response> {
      try {
        const profileId = validateProfileId((await context.params).profileId);
        const client = await dependencies.authorize(request);
        return response({ data: await dependencies.preview(client, profileId) });
      } catch (error) { return errorResponse(error); }
    },
    async DELETE(request: Request, context: Context): Promise<Response> {
      try {
        const profileId = validateProfileId((await context.params).profileId);
        let body: unknown;
        try { body = await request.json(); }
        catch { throw new RequestValidationError("Request body must be valid JSON."); }
        let input;
        try { input = parseMemberDeletionBody(body); }
        catch (error) {
          throw new RequestValidationError(error instanceof Error ? error.message : "Invalid deletion request.");
        }
        const client = await dependencies.authorize(request);
        return response({ data: await dependencies.remove(client, { profileId,
          confirmationEmail: input.confirmationEmail, reason: input.reason, version: input.version }) });
      } catch (error) { return errorResponse(error); }
    },
  };
}
const handlers = createMemberDeletionHandlers();
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;

