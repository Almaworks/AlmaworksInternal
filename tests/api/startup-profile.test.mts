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

test("startup save requires returned rows from both caller-scoped writes", async () => {
  const { PATCH } = await import("../../app/api/startup-profile/route.ts");
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fetch: globalThis.fetch };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-almaworks.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
  let missing: "organization" | "semester" | null = null;
  let member = true;
  const writes: { table: string; authorization: string | null; select: string | null; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const table = url.pathname.split("/").at(-1)!;
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "actor", aud: "authenticated", role: "authenticated", email: "qa@example.test", app_metadata: {}, user_metadata: {} });
    if (request.method === "PATCH") {
      writes.push({ table, authorization: request.headers.get("authorization"), select: url.searchParams.get("select"), body: await request.json() });
      const hidden = table === "startup_organizations" ? missing === "organization" : missing === "semester";
      const single = request.headers.get("accept")?.includes("vnd.pgrst.object");
      if (hidden && single) return Response.json({ code: "PGRST116", details: "The result contains 0 rows", message: "Cannot coerce the result to a single JSON object" }, { status: 406 });
      const row = { id: table === "startup_organizations" ? "organization" : "startup-semester" };
      return Response.json(hidden ? [] : single ? row : [row]);
    }
    if (table === "profiles") return Response.json([{ id: "profile" }]);
    if (table === "semesters") return Response.json([{ id: "semester" }]);
    if (table === "semester_memberships") return Response.json(member ? [{ id: "membership" }] : []);
    if (table === "startup_team_memberships") return Response.json([{ startup_semester_id: "startup-semester" }]);
    if (table === "startup_semesters") return Response.json([{ startup_organization_id: "organization" }]);
    return Response.json({ message: "Unexpected test request" }, { status: 500 });
  };
  const call = (stage = "pilot") => PATCH(new Request("https://almaworks.test/api/startup-profile", {
    method: "PATCH", headers: { authorization: "Bearer qa-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "QA startup", industry: "Testing", stage, description: "Fixture", websiteUrl: "" }),
  }));
  try {
    missing = "organization";
    assert.equal((await call()).status, 409, "an RLS-hidden organization must not report saved");
    assert.equal(writes.length, 1, "do not proceed to stage after denied organization update");
    writes.length = 0;
    missing = "semester";
    assert.equal((await call()).status, 409, "an RLS-hidden startup semester must not report saved");
    missing = null;
    writes.length = 0;
    assert.equal((await call()).status, 200);
    assert.equal(writes.length, 2);
    assert.ok(writes.every(write => write.authorization === "Bearer qa-token" && write.select === "id"));
    assert.deepEqual(writes[1]?.body, { stage: "pilot" });
    writes.length = 0;
    assert.equal((await call("  Pivoting  ")).status, 200);
    assert.deepEqual(writes[1]?.body, { stage: "pivoting" });
    writes.length = 0;
    assert.equal((await call("idea,growth")).status, 422);
    assert.equal(writes.length, 0);
    member = false;
    writes.length = 0;
    assert.equal((await call()).status, 403);
    assert.equal(writes.length, 0);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  }
});
