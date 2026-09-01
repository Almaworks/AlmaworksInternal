import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ResolveResult = { shortCircuit?: boolean; url: string };
type NextResolve = (specifier: string, context: unknown) => ResolveResult;
type RegisterHooks = (hooks: {
  resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult;
}) => void;

const registerHooks = (nodeModule as unknown as { registerHooks: RegisterHooks }).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolve("node_modules/next/server.js")).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

test("mentor creation uses the hardened service RPC with the requesting admin identity", async () => {
  const { POST } = await import("../../app/api/admin/mentors/create/route.ts");
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; authorization: string | null; body: unknown }> = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-almaworks.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-service-key";

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (request.url.endsWith("/auth/v1/user")) {
      return Response.json({
        id: "c2000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "admin@example.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-09-01T12:00:00Z",
      });
    }

    if (request.url.endsWith("/rest/v1/rpc/can_manage_semester")) {
      return Response.json(true);
    }

    if (new URL(request.url).pathname === "/auth/v1/admin/generate_link") {
      return Response.json({
        action_link: "https://local-almaworks.test/auth/verify?token=fake",
        email_otp: "123456",
        hashed_token: "fake-hash",
        redirect_to: "https://almaworks.test/auth/callback",
        verification_type: "magiclink",
        id: "c2000000-0000-0000-0000-000000000011",
        aud: "authenticated",
        role: "authenticated",
        email: "mentor@example.test",
        app_metadata: {},
        user_metadata: { full_name: "Mentor Example" },
        created_at: "2026-09-01T12:00:00Z",
      });
    }

    if (request.url.endsWith("/rest/v1/rpc/create_mentor_records")) {
      return Response.json("c4000000-0000-0000-0000-000000000011");
    }

    return Response.json({ message: `Unexpected request: ${request.method} ${request.url}` }, { status: 500 });
  };

  try {
    const response = await POST(new Request("https://almaworks.test/api/admin/mentors/create", {
      method: "POST",
      headers: {
        authorization: "Bearer admin-access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        semesterId: "c1000000-0000-0000-0000-000000000001",
        email: "mentor@example.test",
        fullName: "Mentor Example",
        company: "Northstar Labs",
        roleTitle: "Founder",
        linkedinUrl: "https://www.linkedin.com/in/mentor-example",
        expertiseTags: ["Product strategy"],
        bio: "Mentors early-stage founders.",
        generalAvailability: "Friday afternoons",
        preferredFormat: "online",
        openingTalk: "Can deliver an opening talk",
      }),
    }));

    const responseBody = await response.json();
    assert.equal(response.status, 200, JSON.stringify({ responseBody, requests }));
    assert.deepEqual(responseBody, {
      ok: true,
      mentorId: "c4000000-0000-0000-0000-000000000011",
      magicLink: "https://local-almaworks.test/auth/verify?token=fake",
    });

    const rpcRequest = requests.find((request) => request.url.endsWith("/rest/v1/rpc/create_mentor_records"));
    assert.ok(rpcRequest, "the route must call the database revamp's hardened mentor RPC");
    assert.equal(rpcRequest.authorization, "Bearer local-service-key");
    assert.deepEqual(rpcRequest.body, {
      p_actor_profile_id: "c2000000-0000-0000-0000-000000000001",
      p_profile_id: "c2000000-0000-0000-0000-000000000011",
      p_semester_id: "c1000000-0000-0000-0000-000000000001",
      p_email: "mentor@example.test",
      p_biography: "Mentors early-stage founders.",
      p_company: "Northstar Labs",
      p_expertise_tags: ["Product strategy"],
      p_is_active: false,
      p_linkedin_url: "https://www.linkedin.com/in/mentor-example",
      p_title: "Founder",
      p_general_availability: "Friday afternoons",
      p_opening_talk: "Can deliver an opening talk",
      p_preferred_format: "online",
    });
    const authorizationRequest = requests.find((request) => request.url.endsWith("/rest/v1/rpc/can_manage_semester"));
    assert.ok(authorizationRequest, "the route must authorize against the target semester");
    assert.equal(authorizationRequest.authorization, "Bearer admin-access-token");
    assert.deepEqual(authorizationRequest.body, {
      target_semester_id: "c1000000-0000-0000-0000-000000000001",
      candidate_id: "c2000000-0000-0000-0000-000000000001",
    });
    assert.equal(
      requests.some((request) => request.url.includes("/rest/v1/profiles?")),
      false,
      "the route must not authorize with the legacy profile role",
    );
    assert.equal(
      requests.some((request) => request.url.includes("/rest/v1/mentors")),
      false,
      "the route must not write through the legacy mentors view",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousAnonKey;
    if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
  }
});
