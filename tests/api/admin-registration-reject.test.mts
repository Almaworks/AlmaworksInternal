import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ResolveResult = { shortCircuit?: boolean; url: string };
type NextResolve = (specifier: string, context: unknown) => ResolveResult;
const registerHooks = (nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult }) => void }).registerHooks;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") return { shortCircuit: true, url: pathToFileURL(resolve("node_modules/next/server.js")).href };
  if (specifier.startsWith("@/")) return { shortCircuit: true, url: pathToFileURL(resolve(specifier.slice(2) + ".ts")).href };
  return nextResolve(specifier, context);
} });

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";

test("registration rejection uses the caller's RLS client and allows only an active Super Admin", async () => {
  const { POST } = await import("../../app/api/admin/users/reject/route.ts");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  const requests: { path: string; method: string; authorization: string | null; body: unknown }[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-almaworks.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let superAdmin = true;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
    requests.push({ path: url.pathname, method: request.method, authorization: request.headers.get("authorization"), body: bodyText ? JSON.parse(bodyText) : null });
    if (url.pathname === "/auth/v1/user") return Response.json({ id: ACTOR_ID, aud: "authenticated", role: "authenticated", email: "admin@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T12:00:00Z" });
    if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("auth_user_id")) return Response.json([{ id: ACTOR_ID }]);
    if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("id") === `eq.${ACTOR_ID}`) return Response.json([{ status: "approved", is_active: true }]);
    if (url.pathname === "/rest/v1/platform_roles") return Response.json(superAdmin ? [{ role: "super_admin" }] : []);
    if (url.pathname === "/rest/v1/profiles" && request.method === "PATCH") return Response.json([{ id: TARGET_ID }]);
    return Response.json({ message: `Unexpected ${request.method} ${url.pathname}` }, { status: 500 });
  };

  try {
    const call = () => POST(new Request("https://almaworks.test/api/admin/users/reject", { method: "POST", headers: { authorization: "Bearer account-token", "content-type": "application/json" }, body: JSON.stringify({ userId: TARGET_ID }) }));
    const success = await call();
    assert.equal(success.status, 200, JSON.stringify(await success.clone().json()));
    const mutation = requests.find((entry) => entry.method === "PATCH");
    assert.ok(mutation);
    assert.equal(mutation.authorization, "Bearer account-token");
    assert.deepEqual(mutation.body, { status: "rejected" });
    assert.equal(requests.some((entry) => entry.path.includes("/rpc/")), false);

    superAdmin = false;
    requests.length = 0;
    const denied = await call();
    assert.equal(denied.status, 403);
    assert.equal(requests.some((entry) => entry.method === "PATCH"), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnon;
    if (previousService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousService;
  }
});
