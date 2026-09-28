import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { calendarSupabaseEnvironment } from "@/src/calendar/config";
import { gmailConfiguration } from "@/src/outreach-gmail/config";
import { authorizeGmail } from "@/src/outreach-gmail/server";
import { createGmailStore } from "@/src/outreach-gmail/store";
import { finishConnection } from "@/src/outreach-gmail/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const config = gmailConfiguration();
  if (!config) return NextResponse.json({ error: "Gmail is not configured." }, { status: 503 });
  const target = new URL("/dashboard/admin/outreach/email", config.appOrigin);
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const cookieName = `outreach_gmail_tx_${createHash("sha256").update(state).digest("hex")}`;
  try {
    const environment = calendarSupabaseEnvironment();
    const client = createServerClient(environment.url, environment.anonKey, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => pending.push(...cookies) } });
    const { data } = await client.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in again.");
    // Semester is taken from an HttpOnly cookie set by the connection UI endpoint.
    const semesterId = request.cookies.get(cookieName)?.value ?? "";
    const actor = await authorizeGmail(new Request(request.url, { headers: { Authorization: `Bearer ${data.session.access_token}` } }), semesterId);
    target.searchParams.set("semesterId", semesterId);
    if (request.nextUrl.searchParams.has("error")) throw new Error("Consent declined.");
    const opportunityId = await finishConnection(config, await createGmailStore(config), actor, state, request.nextUrl.searchParams.get("code") ?? "");
    if (opportunityId) target.searchParams.set("opportunityId", opportunityId);
    target.searchParams.set("gmail", "connected");
  } catch { target.searchParams.set("gmail", "failed"); }
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.cookies.set(cookieName, "", { path: "/api/admin/outreach/gmail", maxAge: 0 });
  return response;
}
