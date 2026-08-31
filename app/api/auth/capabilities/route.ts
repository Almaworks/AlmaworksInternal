import {
  createSupabaseAdminCapabilitySource,
  resolveAdminCapability,
} from "@/src/auth/admin-capability";
import {
  AuthorizationError,
  requireAuthenticatedUserWithRls,
} from "@/src/auth/server";

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, userClient } = await requireAuthenticatedUserWithRls(request);
    const capability = await resolveAdminCapability(
      createSupabaseAdminCapabilitySource(userClient),
      user.id,
    );
    return Response.json({ data: capability });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 500;
    const code = status === 401 ? "unauthenticated" : "internal_error";
    const message = status === 401 ? "Authentication is required." : "Unable to resolve account capabilities.";
    return Response.json({ error: { code, message } }, { status });
  }
}
