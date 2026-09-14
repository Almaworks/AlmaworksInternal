import { ProfileImageError, processProfileImage } from "../profile-images/process-profile-image.ts";

export interface StartupLogoState {
  eligible: boolean;
  organizationId: string | null;
  logoPath: string | null;
  legacyLogoUrl: string | null;
}

export interface StartupLogoRepository {
  loadForProfile(profileId: string): Promise<StartupLogoState>;
  upload(path: string, file: File): Promise<void>;
  sign(path: string): Promise<string>;
  replacePath(organizationId: string, expectedPath: string | null, nextPath: string | null): Promise<boolean>;
  remove(paths: string[]): Promise<void>;
}

export class StartupLogoError extends Error {
  readonly status: 400 | 403 | 409 | 500;

  constructor(message: string, status: 400 | 403 | 409 | 500) {
    super(message);
    this.name = "StartupLogoError";
    this.status = status;
  }
}

async function requireEligible(repository: StartupLogoRepository, profileId: string) {
  const state = await repository.loadForProfile(profileId);
  if (!state.eligible || !state.organizationId) {
    throw new StartupLogoError("An active assigned startup membership is required.", 403);
  }
  return { ...state, organizationId: state.organizationId };
}

function isManagedLogoPath(organizationId: string, path: string | null): path is string {
  if (!path?.startsWith(`${organizationId}/`)) return false;
  return /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/u.test(path.slice(organizationId.length + 1));
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function cleanup(repository: StartupLogoRepository, paths: string[]): Promise<void> {
  try {
    await repository.remove(paths);
  } catch {
    // A failed compensating delete leaves an unreferenced private object.
  }
}

export function createStartupLogoService(
  repository: StartupLogoRepository,
  randomId: () => string = () => crypto.randomUUID(),
) {
  return {
    async upload(profileId: string, file: File): Promise<{ logoUrl: string }> {
      const state = await requireEligible(repository, profileId);
      let processed: Awaited<ReturnType<typeof processProfileImage>>;
      try {
        processed = await processProfileImage(file, "Startup logos");
      } catch (cause) {
        if (cause instanceof ProfileImageError) throw new StartupLogoError(cause.message, 400);
        throw cause;
      }
      const path = `${state.organizationId}/${randomId()}.${processed.extension}`;
      await repository.upload(path, processed.file);
      let logoUrl: string;
      try {
        logoUrl = await repository.sign(path);
      } catch (cause) {
        await cleanup(repository, [path]);
        throw cause;
      }
      let replaced: boolean;
      try {
        replaced = await repository.replacePath(state.organizationId, state.logoPath, path);
      } catch (cause) {
        await cleanup(repository, [path]);
        throw cause;
      }
      if (!replaced) {
        await cleanup(repository, [path]);
        throw new StartupLogoError("The startup logo changed while this upload was running. Please try again.", 409);
      }
      if (isManagedLogoPath(state.organizationId, state.logoPath)) await cleanup(repository, [state.logoPath]);
      return { logoUrl };
    },

    async remove(profileId: string): Promise<{ logoUrl: string | null }> {
      const state = await requireEligible(repository, profileId);
      const replaced = await repository.replacePath(state.organizationId, state.logoPath, null);
      if (!replaced) throw new StartupLogoError("The startup logo changed while this removal was running. Please try again.", 409);
      if (isManagedLogoPath(state.organizationId, state.logoPath)) await cleanup(repository, [state.logoPath]);
      return { logoUrl: safeHttpsUrl(state.legacyLogoUrl) };
    },
  };
}
