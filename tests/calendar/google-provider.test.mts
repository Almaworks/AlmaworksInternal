import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleCalendarProvider, GoogleCalendarError, holdEventId } from "../../src/calendar/google-provider.ts";

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const busy = { kind: "calendar#freeBusy", timeMin: "2026-10-01T12:00:00Z", timeMax: "2026-10-01T16:00:00Z", groups: {}, calendars: { primary: { busy: [{ start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" }] } } };
const query = { accessToken: "secret", calendarId: "primary", from: "2026-10-01T12:00:00Z", to: "2026-10-01T16:00:00Z" };

test("freebusy returns only bounded intervals, and requests only the chosen calendar", async () => {
  let sent: Record<string, unknown> = {};
  const provider = createGoogleCalendarProvider({ fetch: async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return response(200, { ...busy, calendars: { primary: { busy: [{ start: "2026-10-01T11:00:00Z", end: "2026-10-01T13:00:00Z", summary: "private" }, { start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" }] } } });
  } });
  assert.deepEqual(await provider.queryBusy(query), [{ start: "2026-10-01T12:00:00.000Z", end: "2026-10-01T14:00:00.000Z" }]);
  assert.deepEqual(sent, { timeMin: query.from, timeMax: query.to, timeZone: "UTC", items: [{ id: "primary" }] });
});

test("freebusy accepts an omitted groups field for a direct calendar query", async () => {
  const directResult: Record<string, unknown> = { ...busy };
  delete directResult.groups;
  const provider = createGoogleCalendarProvider({ fetch: async () => response(200, directResult) });
  assert.deepEqual(await provider.queryBusy(query), [{ start: "2026-10-01T13:00:00.000Z", end: "2026-10-01T14:00:00.000Z" }]);
});

test("freebusy fails closed on partial coverage, provider errors, malformed intervals or response", async () => {
  const invalid = [
    { ...busy, timeMin: "2026-10-01T12:01:00Z" },
    { ...busy, calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } } },
    { ...busy, groups: { group: { errors: [{ reason: "internalError" }] } } },
    { ...busy, groups: null },
    { ...busy, calendars: {} },
    { ...busy, calendars: { primary: { busy: [{ start: "bad", end: query.to }] } } },
    { ...busy, calendars: { primary: { errors: { reason: "internalError" }, busy: [] } } },
  ];
  for (const item of invalid) {
    const provider = createGoogleCalendarProvider({ fetch: async () => response(200, item) });
    await assert.rejects(provider.queryBusy(query), (error: unknown) => error instanceof GoogleCalendarError);
  }
});

const hold = { accessToken: "secret", calendarId: "primary", bookingId: "booking-1", connectionId: "connection-1", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" };

test("new holds check current Google busy time and never write over a known conflict", async () => {
  for(const failedRead of [false,true]){
    let writes=0,checks=0;
    const provider=createGoogleCalendarProvider({fetch:async(url,init)=>{
      if(init?.method==="GET")return response(404,{});
      if(String(url).endsWith("/freeBusy")){
        checks++;
        const sent=JSON.parse(String(init?.body));
        assert.equal(sent.timeMin,hold.start);assert.equal(sent.timeMax,hold.end);
        return failedRead?response(503,{}):response(200,{kind:"calendar#freeBusy",timeMin:hold.start,timeMax:hold.end,calendars:{primary:{busy:[{start:hold.start,end:hold.end}]}}});
      }
      writes++;return response(200,{id:holdEventId(hold.bookingId,hold.connectionId)});
    }});
    await assert.rejects(provider.upsertHold(hold),(error:unknown)=>error instanceof GoogleCalendarError && error.kind===(failedRead?"retryable":"conflict"));
    assert.equal(checks,1);assert.equal(writes,0);
  }
});

test("an unchanged existing app hold is not mistaken for a fresh Google conflict",async()=>{
  const id=holdEventId(hold.bookingId,hold.connectionId);
  let reads=0;
  const provider=createGoogleCalendarProvider({fetch:async(_url,init)=>{
    assert.equal(init?.method,"GET");reads++;
    return response(200,{id,etag:'"v1"',status:"confirmed",summary:"Almaworks mentorship",visibility:"private",transparency:"opaque",reminders:{useDefault:false},start:{dateTime:hold.start},end:{dateTime:hold.end},extendedProperties:{private:{almaworksHold:id}}});
  }});
  assert.equal((await provider.upsertHold(hold)).status,"current");assert.equal(reads,1);
});

test("moving a hold or making it blocking checks fresh availability before patching", async () => {
  const id = holdEventId(hold.bookingId, hold.connectionId);
  for (const repair of ["moved", "transparent"] as const) {
    for (const failedRead of [false, true]) {
      let checks = 0, writes = 0;
      const provider = createGoogleCalendarProvider({ fetch: async (url, init) => {
        if (init?.method === "GET") return response(200, {
          id, etag: '"v1"', status: "confirmed", transparency: repair === "transparent" ? "transparent" : "opaque",
          start: { dateTime: repair === "moved" ? "2026-10-01T12:00:00Z" : hold.start },
          end: { dateTime: repair === "moved" ? "2026-10-01T13:00:00Z" : hold.end },
          extendedProperties: { private: { almaworksHold: id } },
        });
        if (String(url).endsWith("/freeBusy")) {
          checks++;
          const requestBody = JSON.parse(String(init?.body));
          assert.deepEqual(requestBody.items, [{ id: hold.calendarId }]);
          assert.equal(requestBody.timeMin, hold.start);
          assert.equal(requestBody.timeMax, hold.end);
          return failedRead ? response(503, {}) : response(200, {
            kind: "calendar#freeBusy", timeMin: hold.start, timeMax: hold.end,
            calendars: { primary: { busy: [{ start: hold.start, end: hold.end }] } },
          });
        }
        writes++;
        return response(200, { id });
      } });
      await assert.rejects(provider.upsertHold(hold), (error: unknown) =>
        error instanceof GoogleCalendarError && error.kind === (failedRead ? "retryable" : "conflict"));
      assert.equal(checks, 1);
      assert.equal(writes, 0);
    }
  }
});

test("metadata repair at the same blocking interval does not conflict with its own hold", async () => {
  const id = holdEventId(hold.bookingId, hold.connectionId);
  const methods: string[] = [];
  const provider = createGoogleCalendarProvider({ fetch: async (_url, init) => {
    methods.push(String(init?.method));
    if (init?.method === "GET") return response(200, {
      id, etag: '"v3"', status: "confirmed", summary: "Changed", visibility: "public", transparency: "opaque",
      start: { dateTime: hold.start }, end: { dateTime: hold.end },
      extendedProperties: { private: { almaworksHold: id } },
    });
    assert.equal(init?.method, "PATCH");
    assert.equal(new Headers(init?.headers).get("If-Match"), '"v3"');
    return response(200, { id });
  } });
  assert.equal((await provider.upsertHold(hold)).status, "updated");
  assert.deepEqual(methods, ["GET", "PATCH"]);
});

test("a hold uses a deterministic Google-valid ID and opaque private event", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = createGoogleCalendarProvider({ fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    if(String(url).endsWith("/freeBusy"))return response(200,{kind:"calendar#freeBusy",timeMin:hold.start,timeMax:hold.end,calendars:{primary:{busy:[]}}});
    return calls.length === 1 ? response(404, { error: { code: 404 } }) : response(200, { id: holdEventId(hold.bookingId, hold.connectionId) });
  } });
  assert.match(holdEventId(hold.bookingId, hold.connectionId), /^[a-v0-9]{5,1024}$/);
  assert.deepEqual(await provider.upsertHold(hold), { eventId: holdEventId(hold.bookingId, hold.connectionId), status: "created" });
  const event = JSON.parse(String(calls[2]?.init?.body));
  assert.deepEqual(event, { id: holdEventId(hold.bookingId, hold.connectionId), summary: "Almaworks mentorship", visibility: "private", transparency: "opaque", reminders: { useDefault: false }, start: { dateTime: "2026-10-01T13:00:00.000Z" }, end: { dateTime: "2026-10-01T14:00:00.000Z" }, extendedProperties: { private: { almaworksHold: holdEventId(hold.bookingId, hold.connectionId) } } });
  assert.equal(Object.hasOwn(event, "description"), false);
  assert.equal(Object.hasOwn(event, "attendees"), false);
});

test("existing foreign event cannot be overwritten or deleted", async () => {
  let calls = 0;
  const provider = createGoogleCalendarProvider({ fetch: async () => { calls++; return response(200, { id: holdEventId(hold.bookingId, hold.connectionId), etag: '"1"', extendedProperties: { private: {} } }); } });
  await assert.rejects(provider.upsertHold(hold), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "ownership");
  await assert.rejects(provider.deleteHold(hold), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "ownership");
  assert.equal(calls, 2);
});

test("owned hold reconciliation and cancellation use an etag condition", async () => {
  const calls: RequestInit[] = [];
  const id = holdEventId(hold.bookingId, hold.connectionId);
  const provider = createGoogleCalendarProvider({ fetch: async (url, init) => {
    calls.push(init ?? {});
    if (String(url).endsWith("/freeBusy")) return response(200, { kind: "calendar#freeBusy", timeMin: hold.start, timeMax: hold.end, calendars: { primary: { busy: [] } } });
    if (init?.method === "GET") return response(200, { id, etag: '"v1"', status: "confirmed", start: { dateTime: "2026-10-01T12:00:00Z" }, end: { dateTime: "2026-10-01T13:00:00Z" }, extendedProperties: { private: { almaworksHold: id } } });
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : response(200, { id });
  } });
  assert.deepEqual(await provider.upsertHold(hold), { eventId: id, status: "updated" });
  assert.deepEqual(await provider.deleteHold(hold), { eventId: id, status: "deleted" });
  assert.equal(new Headers(calls.find(call => call.method === "PATCH")?.headers).get("If-Match"), '"v1"');
  assert.equal(new Headers(calls.find(call => call.method === "DELETE")?.headers).get("If-Match"), '"v1"');
});

test("hold writes suppress guest updates and never add attendees", async () => {
  const urls: string[] = [];
  const id = holdEventId(hold.bookingId, hold.connectionId);
  const provider = createGoogleCalendarProvider({ fetch: async (url, init) => {
    if (String(url).endsWith("/freeBusy")) return response(200, { kind: "calendar#freeBusy", timeMin: hold.start, timeMax: hold.end, calendars: { primary: { busy: [] } } });
    urls.push(String(url));
    if (init?.method === "GET") return response(200, { id, etag: '"v1"', status: "confirmed", start: { dateTime: "2026-10-01T12:00:00Z" }, end: { dateTime: "2026-10-01T13:00:00Z" }, attendees: [{ email: "other@example.test" }], extendedProperties: { private: { almaworksHold: id } } });
    if (init?.method === "PATCH") {
      assert.equal(Object.hasOwn(JSON.parse(String(init.body)), "attendees"), false);
      return response(200, { id });
    }
    return new Response(null, { status: 204 });
  } });
  await provider.upsertHold(hold);
  await provider.deleteHold(hold);
  assert.equal(new URL(urls[1] ?? "").searchParams.get("sendUpdates"), "none");
  assert.equal(new URL(urls[3] ?? "").searchParams.get("sendUpdates"), "none");
});

test("canceled event tombstone is absent for deletion but blocks upsert", async () => {
  const id = holdEventId(hold.bookingId, hold.connectionId);
  const canceled = createGoogleCalendarProvider({ fetch: async () => response(200, { id, status: "cancelled" }) });
  assert.equal((await canceled.deleteHold(hold)).status, "absent");
  await assert.rejects(canceled.upsertHold(hold), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "ownership");
  const gone = createGoogleCalendarProvider({ fetch: async () => response(410, {}) });
  assert.equal((await gone.deleteHold(hold)).status, "absent");
});

test("provider calls abort within their configured deadline", async () => {
  let signal: AbortSignal | undefined;
  const provider = createGoogleCalendarProvider({ timeoutMilliseconds: 5, fetch: async (_url, init) => {
    signal = init?.signal ?? undefined;
    return await new Promise<Response>(() => {});
  } });
  await assert.rejects(provider.queryBusy(query), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "retryable");
  assert.equal(signal?.aborted, true);
});

test("same-time owned hold is repaired when changed to public or nonblocking", async () => {
  const id = holdEventId(hold.bookingId, hold.connectionId);
  let repair: Record<string, unknown> | undefined;
  const provider = createGoogleCalendarProvider({ fetch: async (url, init) => {
    if (String(url).endsWith("/freeBusy")) return response(200, { kind: "calendar#freeBusy", timeMin: hold.start, timeMax: hold.end, calendars: { primary: { busy: [] } } });
    if (init?.method === "GET") return response(200, { id, etag: '"v2"', status: "confirmed", visibility: "public", transparency: "transparent", summary: "Changed", start: { dateTime: hold.start }, end: { dateTime: hold.end }, extendedProperties: { private: { almaworksHold: id } } });
    repair = JSON.parse(String(init?.body));
    return response(200, { id });
  } });
  assert.deepEqual(await provider.upsertHold(hold), { eventId: id, status: "updated" });
  assert.equal(repair?.visibility, "private");
  assert.equal(repair?.transparency, "opaque");
  assert.equal(repair?.summary, "Almaworks mentorship");
});

test("missing hold deletion is idempotent and revoked tokens require reconnect", async () => {
  const missing = createGoogleCalendarProvider({ fetch: async () => response(404, {}) });
  assert.deepEqual((await missing.deleteHold(hold)).status, "absent");
  const revoked = createGoogleCalendarProvider({ fetch: async () => response(401, {}) });
  await assert.rejects(revoked.queryBusy(query), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "reconnect");
});

test("provider rate limit and precondition races stay retryable without token details", async () => {
  const rateLimited = createGoogleCalendarProvider({ fetch: async () => response(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }) });
  await assert.rejects(rateLimited.queryBusy(query), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "retryable" && !e.message.includes("secret"));
  const id = holdEventId(hold.bookingId, hold.connectionId);
  const race = createGoogleCalendarProvider({ fetch: async (_url, init) => init?.method === "GET"
    ? response(200, { id, etag: '"v1"', extendedProperties: { private: { almaworksHold: id } } })
    : response(412, { error: { code: 412 } }) });
  await assert.rejects(race.deleteHold(hold), (e: unknown) => e instanceof GoogleCalendarError && e.kind === "retryable");
});
