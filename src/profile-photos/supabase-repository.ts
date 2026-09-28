import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { PROFILE_PHOTO_BUCKET, createProfilePhotoUrlResolver } from "./urls.ts";
import type { ProfilePhotoRepository, ProfilePhotoState } from "./profile-photos.ts";

type RlsClient = SupabaseClient<Database>;

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function createSupabaseProfilePhotoRepository(client: RlsClient): ProfilePhotoRepository {
  const resolveUrl = createProfilePhotoUrlResolver(client);
  return {
    load: async (profileId): Promise<ProfilePhotoState> => {
      const [profileResult, membershipResult] = await Promise.all([
        client.from("profiles").select("photo_path").eq("id", profileId).maybeSingle(),
        client.from("semester_memberships")
          .select("role,semester:semesters!inner(is_active)")
          .eq("profile_id", profileId)
          .eq("semester.is_active", true)
          .in("role", ["mentor", "startup"])
          .in("status", ["onboarding", "active"])
          .limit(1)
          .maybeSingle(),
      ]);
      ensure(profileResult.error);
      ensure(membershipResult.error);
      const role = membershipResult.data?.role;
      return {
        eligible: role === "mentor" || role === "startup",
        photoPath: profileResult.data?.photo_path ?? null,
        role: role === "mentor" || role === "startup" ? role : null,
      };
    },
    upload: async (path, file) => {
      const result = await client.storage.from(PROFILE_PHOTO_BUCKET).upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
      ensure(result.error);
    },
    sign: async (path) => {
      const url = await resolveUrl(path);
      if (!url) throw new Error("Profile photo URL could not be created.");
      return url;
    },
    replacePath: async (profileId, expectedPath, nextPath) => {
      let query = client.from("profiles").update({ photo_path: nextPath }).eq("id", profileId);
      query = expectedPath === null ? query.is("photo_path", null) : query.eq("photo_path", expectedPath);
      const result = await query.select("id").maybeSingle();
      ensure(result.error);
      return result.data?.id === profileId;
    },
    clearLegacyMentorPhoto: async (profileId) => {
      const result = await client.from("mentor_profiles").update({ photo_url: null }).eq("profile_id", profileId);
      ensure(result.error);
    },
    remove: async (paths) => {
      if (paths.length === 0) return;
      const result = await client.storage.from(PROFILE_PHOTO_BUCKET).remove(paths);
      ensure(result.error);
    },
  };
}

