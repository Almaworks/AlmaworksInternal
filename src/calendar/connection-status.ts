import { ALMAWORKS_SUPABASE_URL } from "./config.ts";
export interface CalendarConnectionStatus {
  enabled: boolean;
  availabilityEnabled?: boolean;
  connection: { id: string; accountEmail: string; status: "connected" | "reconnect_required" | "disconnecting" | "disconnected"; cleanupIncomplete:boolean } | null;
}
export async function readCalendarConnectionStatus(input: { enabled: boolean; availabilityEnabled?: boolean; environment: { url: string; anonKey: string }; profileId: string; token: string; fetch?: typeof fetch }): Promise<CalendarConnectionStatus> {
  if (input.environment.url !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  const flags = { enabled: input.enabled, ...(input.availabilityEnabled === undefined ? {} : { availabilityEnabled: input.availabilityEnabled }) };
  if (!input.enabled && !input.availabilityEnabled) return { ...flags, connection: null };
  const url = new URL("/rest/v1/google_calendar_connections", input.environment.url);
  url.searchParams.set("select", "id,account_email,status,disconnect_cleanup_incomplete"); url.searchParams.set("profile_id", `eq.${input.profileId}`); url.searchParams.set("limit", "1");
  try {
    const response = await (input.fetch ?? fetch)(new Request(url, { headers: { apikey: input.environment.anonKey, Authorization: `Bearer ${input.token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) }));
    if (!response.ok) throw new Error();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error();
    if (!rows.length) return { ...flags, connection: null };
    const row = rows[0] as Record<string, unknown>;
    if (!row || typeof row.id !== "string" || typeof row.account_email !== "string" || typeof row.disconnect_cleanup_incomplete!=="boolean" || !["connected", "reconnect_required", "disconnecting", "disconnected"].includes(String(row.status))) throw new Error();
    return { ...flags, connection: { id: row.id, accountEmail: row.account_email, status: row.status as NonNullable<CalendarConnectionStatus["connection"]>["status"], cleanupIncomplete:row.disconnect_cleanup_incomplete } };
  } catch { throw new Error("Your Calendar connection could not be loaded. Please try again."); }
}
