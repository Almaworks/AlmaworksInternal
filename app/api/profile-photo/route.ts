import { NextResponse } from "next/server";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import { PROFILE_PHOTO_MAX_BYTES, ProfilePhotoError, createProfilePhotoService } from "@/src/profile-photos/profile-photos";
import { createSupabaseProfilePhotoRepository } from "@/src/profile-photos/supabase-repository";
import { createProfilePhotoUrlResolver } from "@/src/profile-photos/urls";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function responseError(cause: unknown) {
  if (cause instanceof AuthorizationError || cause instanceof ProfilePhotoError) return fail(cause.message, cause.status);
  return fail("Profile photo could not be updated.", 500);
}

export async function GET(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const profile = await userClient.from("profiles").select("full_name,email").eq("id", profileId).single();
    if (profile.error) throw new Error("Profile could not be loaded.");
    const state = await createSupabaseProfilePhotoRepository(userClient).load(profileId);
    const photoUrl = await createProfilePhotoUrlResolver(userClient)(state.photoPath);
    return NextResponse.json({
      fullName: profile.data.full_name ?? profile.data.email,
      email: profile.data.email,
      photoUrl,
      eligible: state.eligible,
      reason: state.eligible ? null : "Active program access is required to change this photo.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return responseError(cause);
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > PROFILE_PHOTO_MAX_BYTES + 256 * 1024) {
      return fail("Profile photos must be 4 MiB or smaller.", 400);
    }
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("A multipart image upload is required.", 400);
    }
    const files = form.getAll("file");
    if (files.length !== 1) return fail("Upload exactly one file field named 'file'.", 400);
    const file = files[0];
    if (!(file instanceof File)) return fail("A file field named 'file' is required.", 400);
    const result = await createProfilePhotoService(createSupabaseProfilePhotoRepository(userClient)).upload(profileId, file);
    return NextResponse.json(result);
  } catch (cause) {
    return responseError(cause);
  }
}

export async function DELETE(request: Request) {
  try {
    const { profileId, userClient } = await requireAuthenticatedUserWithRls(request);
    const result = await createProfilePhotoService(createSupabaseProfilePhotoRepository(userClient)).remove(profileId);
    return NextResponse.json(result);
  } catch (cause) {
    return responseError(cause);
  }
}
