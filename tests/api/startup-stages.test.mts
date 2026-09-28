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

test("stage suggestions use the caller token, paginate and normalize visible tags", async () => {
  const { GET } = await import("../../app/api/startup-stages/route.ts");
  const savedFetch = globalThis.fetch;
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-almaworks.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-publishable";
  let pages = 0;
  let authenticated = true;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.headers.get("authorization"), "Bearer qa-token");
    if (url.pathname === "/auth/v1/user") return authenticated ? Response.json({ id: "actor", aud: "authenticated", role: "authenticated", email: "qa@example.test" }) : Response.json({ message: "Invalid session" }, { status: 401 });
    if (url.pathname.endsWith("/profiles")) return Response.json([{ id: "profile" }]);
    if (url.pathname.endsWith("/startup_semesters")) {
      pages++;
      return Response.json(pages === 1 ? Array.from({ length: 500 }, (_, i) => ({ id: String(i), stage: "Building" })) : [{ id: "last", stage: " PIVOTING " }, { id: "empty", stage: null }]);
    }
    return Response.json({ message: "Unexpected request" }, { status: 500 });
  };
  try {
    const request = () => new Request("https://almaworks.test/api/startup-stages", { headers: { authorization: "Bearer qa-token" } });
    const response = await GET(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { stages: ["building", "pivoting"] });
    assert.equal(pages, 2);
    authenticated = false;
    assert.equal((await GET(request())).status, 401);
    assert.equal(pages, 2, "unauthenticated caller cannot query stage rows");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
  }
});
