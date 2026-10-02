import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { StartupLogoError, createStartupLogoService } from "@/src/startup-logos/startup-logos";
import { createSupabaseStartupLogoRepository, StartupLogoUnavailableError } from "@/src/startup-logos/supabase-repository";
import { readStartupLogoUpload, StartupLogoUploadRequestError } from "@/src/startup-logos/upload-request";
import { createStartupLogoUrlResolver } from "@/src/startup-logos/urls";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function responseError(cause: unknown) {
  if (cause instanceof AuthorizationError || cause instanceof StartupLogoError ||
    cause instanceof StartupLogoUnavailableError || cause instanceof StartupLogoUploadRequestError) {
    return fail(cause.message, cause.status);
  }
  return fail("Startup logo could not be updated. Please try again.", 500);
}

export async function GET(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const repository = createSupabaseStartupLogoRepository(userClient);
    const state = await repository.loadForProfile(profileId);
    const logoUrl = state.eligible
      ? state.logoPath
        ? await repository.sign(state.logoPath)
        : await createStartupLogoUrlResolver(userClient)(null, state.legacyLogoUrl)
      : null;
    return NextResponse.json({
      logoUrl,
      eligible: state.eligible,
      companyName: state.companyName ?? null,
      reason: state.eligible ? null : "An active assigned startup membership is required.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return responseError(cause);
  }
}

export async function POST(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const file = await readStartupLogoUpload(request);
    const result = await createStartupLogoService(createSupabaseStartupLogoRepository(userClient)).upload(profileId, file);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return responseError(cause);
  }
}

export async function DELETE(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const result = await createStartupLogoService(createSupabaseStartupLogoRepository(userClient)).remove(profileId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return responseError(cause);
  }
}
