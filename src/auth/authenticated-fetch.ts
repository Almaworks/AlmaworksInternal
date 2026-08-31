import { createClient } from "../../utils/supabase/client.ts";

interface AuthSessionClient {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token: string } | null };
      error: unknown | null;
    }>;
  };
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AuthenticatedFetch = FetchImplementation;

const SESSION_EXPIRED_MESSAGE = "Your session has expired. Sign out and sign in again.";

export function createAuthenticatedFetch(
  createBrowserClient: () => AuthSessionClient,
  fetchImplementation: FetchImplementation,
): AuthenticatedFetch {
  return async (input, init = {}) => {
    let token: string | undefined;
    try {
      const { data, error } = await createBrowserClient().auth.getSession();
      if (error === null) token = data.session?.access_token;
    } catch {
      token = undefined;
    }
    if (token === undefined || token.length === 0) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return await fetchImplementation(input, { ...init, headers });
  };
}

export const authenticatedFetch = createAuthenticatedFetch(
  createClient,
  async (input, init) => await fetch(input, init),
);
