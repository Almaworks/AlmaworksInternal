import { ProfileImageError, PROFILE_IMAGE_MAX_BYTES, processProfileImage } from "../profile-images/process-profile-image.ts";

export const PROFILE_PHOTO_MAX_BYTES = PROFILE_IMAGE_MAX_BYTES;
type ParticipantPhotoRole = "mentor" | "startup";

export class ProfilePhotoError extends Error {
  readonly status: 400 | 403 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 409 | 500) {
    super(message);
    this.name = "ProfilePhotoError";
    this.status = status;
  }
}

export interface ProfilePhotoState {
  eligible: boolean;
  photoPath: string | null;
  role: ParticipantPhotoRole | null;
}

export interface ProfilePhotoRepository {
  load(profileId: string): Promise<ProfilePhotoState>;
  upload(path: string, file: File): Promise<void>;
  sign(path: string): Promise<string>;
  replacePath(profileId: string, expectedPath: string | null, nextPath: string | null): Promise<boolean>;
  clearLegacyMentorPhoto(profileId: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

async function sanitizeImage(file: File): Promise<{ extension: "jpg" | "png" | "webp"; file: File }> {
  try {
    return await processProfileImage(file, "Profile photos");
  } catch (cause) {
    if (cause instanceof ProfileImageError) throw new ProfilePhotoError(cause.message, 400);
    throw new ProfilePhotoError("The selected file is not a valid image.", 400);
  }
}

function isManagedPhotoPath(profileId: string, path: string | null): path is string {
  if (!path?.startsWith(`${profileId}/`)) return false;
  const filename = path.slice(profileId.length + 1);
  return /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/u.test(filename);
}

async function requireEligible(repository: ProfilePhotoRepository, profileId: string): Promise<ProfilePhotoState> {
  const state = await repository.load(profileId);
  if (!state.eligible || state.role === null) {
    throw new ProfilePhotoError("An active mentor or startup membership is required.", 403);
  }
  return state;
}

async function cleanup(repository: ProfilePhotoRepository, paths: string[]): Promise<void> {
  try {
    await repository.remove(paths);
  } catch {
    // A failed compensating delete leaves an unreferenced private object; access remains RLS-protected.
  }
}

export function createProfilePhotoService(
  repository: ProfilePhotoRepository,
  randomId: () => string = () => crypto.randomUUID(),
) {
  return {
    async upload(profileId: string, file: File): Promise<{ photoUrl: string }> {
      const state = await requireEligible(repository, profileId);
      const sanitized = await sanitizeImage(file);
      const path = `${profileId}/${randomId()}.${sanitized.extension}`;
      await repository.upload(path, sanitized.file);

      let photoUrl: string;
      try {
        photoUrl = await repository.sign(path);
      } catch (cause) {
        await cleanup(repository, [path]);
        throw cause;
      }

      let replaced: boolean;
      try {
        replaced = await repository.replacePath(profileId, state.photoPath, path);
      } catch (cause) {
        await cleanup(repository, [path]);
        throw cause;
      }
      if (!replaced) {
        await cleanup(repository, [path]);
        throw new ProfilePhotoError("The profile photo changed while this upload was running. Please try again.", 409);
      }

      if (isManagedPhotoPath(profileId, state.photoPath)) await cleanup(repository, [state.photoPath]);
      return { photoUrl };
    },

    async remove(profileId: string): Promise<{ photoUrl: null }> {
      const state = await requireEligible(repository, profileId);
      if (state.role === "mentor") await repository.clearLegacyMentorPhoto(profileId);
      const replaced = await repository.replacePath(profileId, state.photoPath, null);
      if (!replaced) throw new ProfilePhotoError("The profile photo changed while this removal was running. Please try again.", 409);
      if (isManagedPhotoPath(profileId, state.photoPath)) await cleanup(repository, [state.photoPath]);
      return { photoUrl: null };
    },
  };
}
