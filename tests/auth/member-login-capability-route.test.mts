import assert from "node:assert/strict";
import test from "node:test";

test("capability endpoint authorizes a restored super-admin by durable profile ID", async () => {
  const profileIds: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
    );
    if (url.pathname === "/auth/v1/user") {
      return Response.json({ id: "auth-user-replacement", aud: "authenticated", role: "authenticated" });
    }
    if (url.pathname === "/rest/v1/profiles") {
      assert.equal(url.searchParams.get("auth_user_id"), "eq.auth-user-replacement");
      return Response.json([{ id: "profile-restored-admin" }]);
    }
    if (url.pathname === "/rest/v1/platform_roles") {
      profileIds.push(url.searchParams.get("profile_id") ?? "");
      return Response.json({ role: "super_admin" });
    }
    return Response.json({ message: "unexpected request" }, { status: 404 });
  };

  try {
    const subject = await import("../../app/api/auth/capabilities/route.ts");
    const response = await subject.GET(new Request("https://almaworks.test/api/auth/capabilities", {
      headers: { authorization: "Bearer restored-auth-token" },
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: { canManageAdmin: true, canRemoveMemberLogin: true, isSuperAdmin: true },
    });
    assert.deepEqual(profileIds, ["eq.profile-restored-admin"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  }
});
