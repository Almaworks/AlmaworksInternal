import {
  parseRemoveMemberLoginBody,
  parseRestoreMemberLoginBody,
} from "../../../../../../src/auth/member-login-account.ts";
import {
  authorizeMemberLoginAccountClient,
  MemberLoginAccountError,
  MemberLoginReconciliationError,
  previewMemberLoginRemoval,
  removeMemberLogin,
  restoreMemberLogin,
  type MemberLoginAccountClient,
  type MemberLoginRemovalPreview,
  type MemberLoginRemovalResult,
  type MemberLoginRestorationResult,
} from "../../../../../../src/auth/member-login-account-server.ts";
import { AuthorizationError } from "../../../../../../src/auth/server.ts";

type RouteContext = { params: Promise<{ profileId: string }> };

interface MemberLoginAccountHandlerDependencies {
  authorize(request: Request): Promise<MemberLoginAccountClient>;
  preview(
    client: MemberLoginAccountClient,
    profileId: string,
  ): Promise<MemberLoginRemovalPreview>;
  remove(
    client: MemberLoginAccountClient,
    input: { profileId: string; reason: string },
  ): Promise<MemberLoginRemovalResult>;
  restore(
    client: MemberLoginAccountClient,
    input: { profileId: string; redirectTo: string },
  ): Promise<MemberLoginRestorationResult>;
}

class RequestValidationError extends Error {}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validateProfileId(profileId: string): string {
  if (!uuidPattern.test(profileId)) throw new RequestValidationError("profileId must be a valid UUID.");
  return profileId;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof RequestValidationError) {
    return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 400 });
  }
  if (error instanceof AuthorizationError) {
    const code = error.status === 401 ? "unauthenticated" : error.status === 403 ? "forbidden" : "internal_error";
    return Response.json({ error: { code, message: error.message } }, { status: error.status });
  }
  if (error instanceof MemberLoginReconciliationError) {
    return Response.json({
      error: {
        code: "reconciliation_required",
        databaseState: error.databaseState,
        message: error.message,
        reconciliationRequired: true,
      },
    }, { status: 502 });
  }
  if (error instanceof MemberLoginAccountError) {
    const status = error.code === "42501"
      ? 403
      : error.code === "P0002"
        ? 404
        : ["55000", "23505", "40001"].includes(error.code)
          ? 409
          : error.code === "22023"
            ? 400
            : 500;
    const code = status === 403
      ? "forbidden"
      : status === 404
        ? "not_found"
        : status === 409
          ? "conflict"
          : status === 400
            ? "validation_error"
            : "internal_error";
    return Response.json({ error: { code, message: error.message } }, { status });
  }
  return Response.json({
    error: { code: "internal_error", message: "Unable to update the member login account." },
  }, { status: 500 });
}

export function createMemberLoginAccountHandlers(
  overrides: Partial<MemberLoginAccountHandlerDependencies> = {},
) {
  const dependencies: MemberLoginAccountHandlerDependencies = {
    authorize: authorizeMemberLoginAccountClient,
    preview: previewMemberLoginRemoval,
    remove: removeMemberLogin,
    restore: restoreMemberLogin,
    ...overrides,
  };

  return {
    async GET(request: Request, context: RouteContext): Promise<Response> {
      try {
        const profileId = validateProfileId((await context.params).profileId);
        const client = await dependencies.authorize(request);
        return Response.json({ data: await dependencies.preview(client, profileId) });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async DELETE(request: Request, context: RouteContext): Promise<Response> {
      try {
        const profileId = validateProfileId((await context.params).profileId);
        let body;
        try {
          body = parseRemoveMemberLoginBody(await readJson(request));
        } catch (error) {
          if (error instanceof RequestValidationError) throw error;
          throw new RequestValidationError(error instanceof Error ? error.message : "Invalid removal request.");
        }
        const client = await dependencies.authorize(request);
        return Response.json({
          data: await dependencies.remove(client, { profileId, reason: body.reason }),
        });
      } catch (error) {
        return errorResponse(error);
      }
    },

    async POST(request: Request, context: RouteContext): Promise<Response> {
      try {
        const profileId = validateProfileId((await context.params).profileId);
        try {
          parseRestoreMemberLoginBody(await readJson(request));
        } catch (error) {
          if (error instanceof RequestValidationError) throw error;
          throw new RequestValidationError(error instanceof Error ? error.message : "Invalid restoration request.");
        }
        const client = await dependencies.authorize(request);
        const redirectTo = `${new URL(request.url).origin}/auth/callback`;
        return Response.json({
          data: await dependencies.restore(client, { profileId, redirectTo }),
        });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

const handlers = createMemberLoginAccountHandlers();

export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
export const POST = handlers.POST;
