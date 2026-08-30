import { createClient } from "@/utils/supabase/client";

export async function outreachFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const client = createClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error !== null || session?.access_token === undefined) {
    throw new Error("Your session has expired. Sign out and sign in again.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return await fetch(input, { ...init, headers });
}
