import { requireAuthenticatedUserWithRls, AuthorizationError } from "../auth/server.ts";
import { createHash } from "node:crypto";
import { calendarSupabaseEnvironment } from "../calendar/config.ts";
import { GoogleOAuthError } from "../calendar/oauth.ts";
import { gmailConfiguration } from "./config.ts";
import { createGmailStore, type GmailMessage } from "./store.ts";
import { GmailError, gmailUuid, sendPersonalGmail, startConnection, validateSendInput } from "./service.ts";
import { advanceStageAfterSend } from "./stage.ts";

export async function authorizeGmail(request: Request, semesterId: string) {
  calendarSupabaseEnvironment();
  if (!gmailUuid(semesterId)) throw new GmailError(400, "Choose a semester.");
  const auth = await requireAuthenticatedUserWithRls(request);
  const access = await auth.userClient.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: auth.user.id });
  if (access.error || access.data !== true) throw new GmailError(403, "Semester administrator access is required.");
  return { ...auth, semesterId };
}
export function gmailFailure(error: unknown) {
  const message = error instanceof GoogleOAuthError ? "Gmail authorization is unavailable. Reconnect Gmail, then try again." : error instanceof GmailError || error instanceof AuthorizationError ? error.message : "Gmail could not complete this action. Check email history before composing another message.";
  return Response.json({ error: { message } }, { status: error instanceof GmailError || error instanceof AuthorizationError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
const summary = (row: GmailMessage) => ({ id: row.id, sender: row.sender, recipient: row.recipient, subject: row.subject, status: row.status, createdAt: row.created_at, threadId: row.google_thread_id });

export async function gmailGet(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const actor = await authorizeGmail(request, query.get("semesterId") ?? "");
    const opportunityId = query.get("opportunityId") ?? undefined;
    if (opportunityId && !gmailUuid(opportunityId)) throw new GmailError(400, "Choose a contact.");
    let ownsConversation = false;
    if (opportunityId) {
      const opportunity = await actor.userClient.from("outreach_opportunities").select("owner_profile_id").eq("semester_id", actor.semesterId).eq("id", opportunityId).maybeSingle();
      if (opportunity.error || !opportunity.data) throw new GmailError(404, "This outreach conversation is unavailable.");
      ownsConversation = opportunity.data.owner_profile_id === actor.profileId;
    }
    const config = gmailConfiguration();
    if (!config) return Response.json({ configured: false, profileId: actor.profileId, ownsConversation, email: null, messages: [] }, { headers: { "Cache-Control": "no-store" } });
    const store = await createGmailStore(config);
    const [account, messages, unresolved] = await Promise.all([store.account(actor.profileId), store.messages(actor.semesterId, opportunityId), opportunityId ? store.unresolved(actor.profileId, opportunityId) : null]);
    return Response.json({ configured: true, profileId: actor.profileId, ownsConversation, email: account?.email ?? null, unresolved: unresolved ? summary(unresolved) : null, messages: messages.map(summary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return gmailFailure(error); }
}

export async function gmailPost(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || "0") > 40000) throw new GmailError(413, "Email is too large.");
    const raw = await request.text();
    if (raw.length > 40000) throw new GmailError(413, "Email is too large.");
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || !("semesterId" in body) || typeof body.semesterId !== "string" || !("action" in body)) throw new GmailError(400, "Invalid Gmail request.");
    const actor = await authorizeGmail(request, body.semesterId);
    const config = gmailConfiguration();
    if (!config) throw new GmailError(503, "Gmail sending requires server setup before you can connect.");
    const store = await createGmailStore(config);
    if (body.action === "connect") {
      const opportunityId = "opportunityId" in body && gmailUuid(body.opportunityId) ? body.opportunityId : undefined;
      const authorizationUrl = await startConnection(config, store, actor, opportunityId);
      const hash = createHash("sha256").update(new URL(authorizationUrl).searchParams.get("state")!).digest("hex");
      return Response.json({ authorizationUrl }, { headers: { "Cache-Control": "no-store", "Set-Cookie": `outreach_gmail_tx_${hash}=${actor.semesterId}; HttpOnly; SameSite=Lax; Path=/api/admin/outreach/gmail; Max-Age=600${config.appOrigin.startsWith("https:") ? "; Secure" : ""}` } });
    }
    if (body.action === "disconnect") { await store.disconnect(actor.profileId); return Response.json({ disconnected: true }); }
    if (body.action === "review") {
      if (!("messageId" in body) || !gmailUuid(body.messageId)) throw new GmailError(400, "Choose the email to review.");
      const message = await store.byId(actor.profileId, actor.semesterId, body.messageId);
      if (!message || !await store.review(actor.profileId, message.id)) throw new GmailError(409, "This request is still processing or is no longer awaiting review. Wait two minutes, then refresh history.");
      return Response.json({ reviewed: true });
    }
    if (body.action !== "send") throw new GmailError(400, "Unknown Gmail action.");
    const input = validateSendInput(body);
    const result = await sendPersonalGmail(config, store, actor, input, async () => {
      // Re-authorize to detect an admin whose membership was removed during token refresh.
      const fresh = await authorizeGmail(request, actor.semesterId);
      const opportunity = await fresh.userClient.from("outreach_opportunities").select("contact_id,owner_profile_id,is_silenced,stage,archived_at").eq("semester_id", actor.semesterId).eq("id", input.opportunityId).maybeSingle();
      if (opportunity.error || !opportunity.data || opportunity.data.archived_at || opportunity.data.is_silenced || ["closed", "declined"].includes(opportunity.data.stage)) throw new GmailError(409, "This conversation is no longer eligible for outreach.");
      const contact = await fresh.userClient.from("outreach_contacts").select("email,archived_at").eq("id", opportunity.data.contact_id).maybeSingle();
      if (contact.error || !contact.data?.email || contact.data.archived_at) throw new GmailError(409, "The contact needs an active email address.");
      return { email: contact.data.email, ownerProfileId: opportunity.data.owner_profile_id };
    });
    const stageUpdate = await advanceStageAfterSend(result.status, {
      read: async () => {
        const { data, error } = await actor.userClient.from("outreach_opportunities")
          .select("stage,updated_at,archived_at").eq("semester_id", actor.semesterId).eq("id", result.opportunity_id).maybeSingle();
        if (error) throw error;
        return data ? { stage: data.stage, updatedAt: data.updated_at, archived: data.archived_at !== null } : null;
      },
      advance: async expectedUpdatedAt => {
        const { error } = await actor.userClient.rpc("log_outreach_activity", {
          p_opportunity_id: result.opportunity_id,
          p_activity_kind: "note",
          p_stage: "contacted",
          p_expected_updated_at: expectedUpdatedAt,
          p_summary: "Stage changed to contacted after Gmail accepted outreach",
          p_details: { type: "stage_change", stage: "contacted", gmail_message_id: result.id },
        });
        return !error;
      },
    });
    return Response.json({ message: summary(result), stageUpdate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return gmailFailure(error); }
}
