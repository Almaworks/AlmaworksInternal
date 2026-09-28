import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sendPersonalGmail, validateSendInput, startConnection, finishConnection } from "../../src/outreach-gmail/service.ts";
import { encryptRefreshToken } from "../../src/calendar/token-crypto.ts";
import { beginGmailOAuth, exchangeGmailCode } from "../../src/outreach-gmail/oauth.ts";
import type { GmailConfiguration } from "../../src/outreach-gmail/config.ts";
import type { GmailAccount, GmailMessage, GmailStore, GmailTransaction } from "../../src/outreach-gmail/store.ts";

const config: GmailConfiguration = { appOrigin: "http://localhost:3000", oauth: { clientId: "test", clientSecret: "test", callbackUrl: "http://localhost:3000/api/admin/outreach/gmail/callback" }, encryptionKey: Buffer.alloc(32, 5), workerEmail: "worker@example.test", workerPassword: "test", supabase: { url: "https://layjdjfvxkowxidwuvbs.supabase.co", anonKey: "test" } };
function fixture() {
  const actor = { profileId: randomUUID(), semesterId: randomUUID() };
  const connectionId = randomUUID();
  const input = { opportunityId: randomUUID(), requestKey: randomUUID(), recipient: "recipient@example.test", sender: "admin@example.test", subject: "Invitation", body: "Hello there" };
  let account: GmailAccount | null = { profile_id: actor.profileId, connection_id: connectionId, email: input.sender, provider_subject: "google-owner", encrypted_token: encryptRefreshToken("refresh", config.encryptionKey, { profileId: `outreach-gmail:${actor.profileId}`, connectionId }), connected_at: new Date().toISOString() };
  const messages = new Map<string, GmailMessage>();
  let transaction: GmailTransaction | null = null;
  let sends = 0;
  let sendFails = false;
  const store: GmailStore = {
    account: async id => id === actor.profileId ? account : null,
    saveAccount: async a => { account = a; }, disconnect: async () => { account = null; },
    begin: async tx => { transaction = tx; }, consume: async (hash, id, semester) => {
      if (!transaction || transaction.state_hash !== hash || transaction.profile_id !== id || transaction.semester_id !== semester || transaction.consumed_at || Date.parse(transaction.expires_at) <= Date.now()) return null;
      transaction.consumed_at = new Date().toISOString(); return transaction;
    },
    messages: async () => [...messages.values()],
    find: async (_id, key) => messages.get(key) ?? null,
    byId: async (_id, _semester, id) => [...messages.values()].find(m=>m.id===id)??null,
    unresolved: async (id, opportunity) => [...messages.values()].find(m=>m.profile_id===id && m.opportunity_id===opportunity && ["sending","unknown"].includes(m.status))??null,
    review: async ()=>false,
    reserve: async m => { if (messages.has(m.request_key)) return false; messages.set(m.request_key, m); return true; },
    finish: async (id, result) => { for (const [key, message] of messages) if (message.id === id) messages.set(key, { ...message, ...result }); },
  };
  const fetcher: typeof fetch = async url => {
    if (String(url).includes("/token")) return Response.json({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/gmail.send" });
    if (String(url).includes("userinfo")) return Response.json({ sub: "google-owner", email: input.sender, email_verified: true });
    if (String(url).endsWith("messages/send")) { sends++; if (sendFails) throw new Error("network secret"); return Response.json({ id: "a123", threadId: "b123" }); }
    throw new Error("Unexpected endpoint");
  };
  return { actor, input, store, fetcher, sends: () => sends, failSend: () => { sendFails = true; }, resolve: async () => ({ email: input.recipient, ownerProfileId: actor.profileId }) };
}
test("personal sender accepted once; repeating the request and concurrent sends never resubmit", async () => {
  const f = fixture();
  const results = await Promise.all([sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher),sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher)]);
  assert.equal(f.sends(),1); assert.equal(results[0].status,"sent");
  assert.equal((await sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher)).status,"sent"); assert.equal(f.sends(),1);
  await assert.rejects(sendPersonalGmail(config,f.store,f.actor,{...f.input,body:"Changed"},f.resolve,f.fetcher),/different draft/);
});
test("request identity ignores circular authentication context and remains stable across requests", async () => {
  const f = fixture();
  const client: { self?: unknown } = {};
  client.self = client;
  const actor = { ...f.actor, userClient: client, accessToken: "first-request" };
  assert.equal((await sendPersonalGmail(config, f.store, actor, f.input, f.resolve, f.fetcher)).status, "sent");
  const refreshedActor = { ...actor, accessToken: "refreshed-request" };
  assert.equal((await sendPersonalGmail(config, f.store, refreshedActor, f.input, f.resolve, f.fetcher)).status, "sent");
  assert.equal(f.sends(), 1);
});
test("uncertain send is durable and never retried", async () => {
  const f=fixture(); f.failSend();
  assert.equal((await sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher)).status,"unknown");
  await sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher); assert.equal(f.sends(),1);
  await assert.rejects(sendPersonalGmail(config,f.store,f.actor,{...f.input,requestKey:randomUUID()},f.resolve,f.fetcher),/previous email needs review/); assert.equal(f.sends(),1);
});
test("a process dying after claim cannot cause resubmission", async () => {
  const f=fixture(); f.store.finish=async()=>{throw new Error("database unavailable");};
  await assert.rejects(sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher));
  assert.equal((await sendPersonalGmail(config,f.store,f.actor,f.input,f.resolve,f.fetcher)).status,"sending"); assert.equal(f.sends(),1);
});
test("owner, recipient, and mailbox checks reject without sending",async()=>{
  for (const kind of ["owner","recipient","sender"]){const f=fixture();
    await assert.rejects(sendPersonalGmail(config,f.store,f.actor,{...f.input,...(kind==="sender"?{sender:"other@example.test"}:{})},async()=>({email:kind==="recipient"?"changed@example.test":f.input.recipient,ownerProfileId:kind==="owner"?randomUUID():f.actor.profileId}),f.fetcher)); assert.equal(f.sends(),0);
  }
});
test("Gmail consent binds state to admin and semester and is single use",async()=>{
  const f=fixture();const url=new URL(await startConnection(config,f.store,f.actor)); const state=url.searchParams.get("state")!;
  await assert.rejects(finishConnection(config,f.store,{...f.actor,profileId:randomUUID()},state,"code",f.fetcher));
  await assert.rejects(finishConnection(config,f.store,{...f.actor,semesterId:randomUUID()},state,"code",f.fetcher));
  await finishConnection(config,f.store,f.actor,state,"code",f.fetcher);
  await assert.rejects(finishConnection(config,f.store,f.actor,state,"code",f.fetcher)); assert.equal(f.sends(),0);
});
test("OAuth requests only send scope and rejects partial grants",async()=>{
  const start=beginGmailOAuth(config.oauth); const url=new URL(start.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("scope"),"openid email https://www.googleapis.com/auth/gmail.send");
  await assert.rejects(exchangeGmailCode(config.oauth,"code",start.verifier,async()=>Response.json({access_token:"a",refresh_token:"r",token_type:"Bearer",scope:"openid email"})));
});
test("unresolved variables, header injection, and scheduling fail validation",()=>{
  const f=fixture();
  for(const changes of [{subject:"x\r\nBcc: x@example.test"},{body:"Hi {{contact_name}}"},{scheduledAt:"tomorrow"},{requestKey:"invalid"}]) assert.throws(()=>validateSendInput({...f.input,...changes}));
  assert.deepEqual(validateSendInput(f.input),f.input);
});
