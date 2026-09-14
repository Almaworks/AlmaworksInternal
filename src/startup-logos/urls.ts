export const STARTUP_LOGO_BUCKET = "startup-logos";
export const STARTUP_LOGO_URL_TTL_SECONDS = 60 * 60;

interface SignedUrlResult {
  data: { signedUrl: string } | null;
  error: { message: string } | null;
}

interface StartupLogoBucketClient {
  createSignedUrl(path: string, expiresIn: number): PromiseLike<SignedUrlResult>;
}

interface StartupLogoStorageClient {
  storage: {
    from(bucket: string): StartupLogoBucketClient;
  };
}

function bucketClient(client: StartupLogoStorageClient | StartupLogoBucketClient): StartupLogoBucketClient {
  return "storage" in client ? client.storage.from(STARTUP_LOGO_BUCKET) : client;
}

function safeLegacyLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createStartupLogoUrlResolver(
  client: StartupLogoStorageClient | StartupLogoBucketClient,
): (logoPath?: string | null, legacyLogoUrl?: string | null) => Promise<string | null> {
  const bucket = bucketClient(client);
  const cache = new Map<string, Promise<string | null>>();

  return async (logoPath, legacyLogoUrl) => {
    if (!logoPath) return safeLegacyLogoUrl(legacyLogoUrl);
    let pending = cache.get(logoPath);
    if (!pending) {
      pending = Promise.resolve()
        .then(async () => await bucket.createSignedUrl(logoPath, STARTUP_LOGO_URL_TTL_SECONDS))
        .then(({ data, error }) => error ? null : data?.signedUrl ?? null)
        .catch(() => null);
      cache.set(logoPath, pending);
    }
    return (await pending) ?? safeLegacyLogoUrl(legacyLogoUrl);
  };
}
