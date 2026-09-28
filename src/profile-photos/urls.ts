export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const PROFILE_PHOTO_URL_TTL_SECONDS = 60 * 60;

interface SignedUrlResult {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
}

interface SignedUrlsResult {
  data: { error: string | null; path: string | null; signedUrl: string | null }[] | null;
  error: { message: string } | null;
}

interface ProfilePhotoBucketClient {
  createSignedUrl(path: string, expiresIn: number): PromiseLike<SignedUrlResult>;
  createSignedUrls?(paths: string[], expiresIn: number): PromiseLike<SignedUrlsResult>;
}

interface ProfilePhotoStorageClient {
  storage: {
    from(bucket: string): ProfilePhotoBucketClient;
  };
}

function bucketClient(client: ProfilePhotoStorageClient | ProfilePhotoBucketClient): ProfilePhotoBucketClient {
  return "storage" in client ? client.storage.from(PROFILE_PHOTO_BUCKET) : client;
}

function safeLegacyPhotoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface ProfilePhotoUrlInput {
  legacyPhotoUrl?: string | null;
  photoPath?: string | null;
}

export interface ProfilePhotoUrlResolver {
  (photoPath?: string | null, legacyPhotoUrl?: string | null): Promise<string | null>;
  resolveMany(inputs: readonly ProfilePhotoUrlInput[]): Promise<(string | null)[]>;
}

export function createProfilePhotoUrlResolver(
  client: ProfilePhotoStorageClient | ProfilePhotoBucketClient,
): ProfilePhotoUrlResolver {
  const bucket = bucketClient(client);
  const cache = new Map<string, Promise<string | null>>();

  const resolveOne = (async (photoPath?: string | null, legacyPhotoUrl?: string | null) => {
    if (!photoPath) return safeLegacyPhotoUrl(legacyPhotoUrl);
    let pending = cache.get(photoPath);
    if (!pending) {
      pending = Promise.resolve()
        .then(async () => await bucket.createSignedUrl(photoPath, PROFILE_PHOTO_URL_TTL_SECONDS))
        .then(({ data, error }) => error ? null : data?.signedUrl ?? null)
        .catch(() => null);
      cache.set(photoPath, pending);
    }
    return await pending;
  }) as ProfilePhotoUrlResolver;

  resolveOne.resolveMany = async (inputs: readonly ProfilePhotoUrlInput[]) => {
    const uncachedPaths = [...new Set(inputs.flatMap(({ photoPath }) => (
      photoPath && !cache.has(photoPath) ? [photoPath] : []
    )))];
    if (uncachedPaths.length > 0 && bucket.createSignedUrls) {
      const batch = Promise.resolve()
        .then(async () => await bucket.createSignedUrls!(uncachedPaths, PROFILE_PHOTO_URL_TTL_SECONDS))
        .then(({ data, error }) => {
          if (error || !data) return new Map<string, string | null>();
          return new Map(data.map((entry, index) => [
            entry.path ?? uncachedPaths[index] ?? "",
            entry.error ? null : entry.signedUrl,
          ]));
        })
        .catch(() => new Map<string, string | null>());
      for (const photoPath of uncachedPaths) {
        cache.set(photoPath, batch.then((urls) => urls.get(photoPath) ?? null));
      }
    }
    return await Promise.all(inputs.map(({ photoPath, legacyPhotoUrl }) => (
      resolveOne(photoPath, legacyPhotoUrl)
    )));
  };

  return resolveOne;
}
