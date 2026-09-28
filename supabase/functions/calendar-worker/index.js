// supabase/functions/calendar-worker/entry.ts
import { Buffer as Buffer2 } from "node:buffer";

// src/calendar/config.ts
var ALMAWORKS_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
function calendarAvailabilityEnabled(env = process.env) {
  const value = env.CALENDAR_AVAILABILITY_ENABLED;
  if (value === void 0 || value === "false") return false;
  if (value !== "true") throw new Error("Calendar availability deployment configuration is invalid.");
  return true;
}
function calendarSupabaseEnvironment(env = process.env) {
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("Calendar Supabase public configuration is missing.");
  return { url: ALMAWORKS_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
function calendarConfiguration(env = process.env) {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!calendarAvailabilityEnabled(env)) return null;
  const appOrigin = env.CALENDAR_APP_ORIGIN;
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const encryption = env.GOOGLE_CALENDAR_ENCRYPTION_KEY;
  const workerEmail = env.CALENDAR_WORKER_EMAIL, workerPassword = env.CALENDAR_WORKER_PASSWORD;
  const cronSecret = env.CALENDAR_CRON_SECRET;
  if (!appOrigin || !clientId || !clientSecret || !encryption || !workerEmail || !workerPassword || !cronSecret || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const origin = new URL(appOrigin);
  if (origin.origin !== appOrigin || origin.username || origin.password || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new Error("Calendar application origin must be an HTTPS origin or local development origin.");
  const encryptionKey = Buffer.from(encryption, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== encryption) throw new Error("Calendar encryption configuration is invalid.");
  if (cronSecret.length < 32) throw new Error("Calendar worker secret must have at least 32 characters.");
  return {
    appOrigin,
    oauth: { clientId, clientSecret, callbackUrl: new URL("/api/calendar/callback", appOrigin).toString() },
    encryptionKey,
    workerEmail,
    workerPassword,
    cronSecret,
    supabase: calendarSupabaseEnvironment(env)
  };
}

// src/calendar/http-error.ts
var CalendarHttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.name = "CalendarHttpError";
    this.status = status;
  }
};

// src/calendar/repository.ts
var unavailable = () => new Error("Calendar storage is unavailable. Please try again.");
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value;
}
function text(value) {
  if (typeof value !== "string" || !value) throw unavailable();
  return value;
}
function nullableText(value) {
  return value === null ? null : text(value);
}
function singleRow(value) {
  if (!Array.isArray(value) || value.length > 1) throw unavailable();
  return value.length ? record(value[0]) : null;
}
function boolean(value) {
  if (typeof value !== "boolean") throw unavailable();
  return value;
}
function generation(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}
async function createCalendarRepositories(config, options = {}) {
  if (config.supabase.url !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!config.supabase.anonKey || !config.workerEmail || !config.workerPassword) throw unavailable();
  const fetcher = options.fetch ?? fetch;
  const timeout = options.timeoutMilliseconds ?? 1e4;
  if (!Number.isFinite(timeout) || timeout <= 0) throw unavailable();
  async function request2(path, body, token2) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(`${config.supabase.url}${path}`, {
            method: "POST",
            cache: "no-store",
            redirect: "error",
            signal: controller.signal,
            headers: { apikey: config.supabase.anonKey, "Content-Type": "application/json", ...token2 ? { Authorization: `Bearer ${token2}` } : {} },
            body: JSON.stringify(body)
          });
          if (!response.ok) {
            if (path === "/rest/v1/rpc/calendar_complete_oauth") {
              const failure = await response.json();
              if (failure && typeof failure === "object" && "code" in failure && failure.code === "PGC01") {
                throw new CalendarHttpError(409, "Disconnect your current Google Calendar and wait for cleanup to finish before connecting a different account.");
              }
            }
            if (path === "/rest/v1/rpc/calendar_begin_oauth") {
              const failure = await response.json();
              if (failure && typeof failure === "object" && "code" in failure && failure.code === "PGC02") {
                throw new CalendarHttpError(409, "Your Google Calendar connection is still finishing. Please wait before trying again.");
              }
            }
            throw unavailable();
          }
          return await response.json();
        })(),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(unavailable());
          }, timeout);
        })
      ]);
    } catch (error) {
      if (error instanceof CalendarHttpError) throw error;
      throw unavailable();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const session = record(await request2("/auth/v1/token?grant_type=password", { email: config.workerEmail, password: config.workerPassword }));
  if (typeof session.token_type !== "string" || session.token_type.toLowerCase() !== "bearer") throw unavailable();
  const token = text(session.access_token);
  const rpc = (name, body) => request2(`/rest/v1/rpc/${name}`, body, token);
  return {
    disconnect: {
      async lease() {
        const row = singleRow(await rpc("calendar_lease_disconnect_jobs", { p_limit: 1 }));
        return row ? { connectionId: text(row.connection_id), leaseToken: text(row.lease_token), credentialGeneration: generation(row.credential_generation) } : null;
      },
      async finish(input) {
        return boolean(await rpc("calendar_finish_disconnect_job", { p_connection_id: input.connectionId, p_lease_token: input.leaseToken, p_credential_generation: input.credentialGeneration }));
      }
    },
    holds: {
      async lease() {
        const row = singleRow(await rpc("calendar_lease_hold_jobs", { p_limit: 1 }));
        if (!row) return null;
        if (row.desired_state !== "present" && row.desired_state !== "absent") throw unavailable();
        return { jobId: text(row.job_id), leaseToken: text(row.lease_token), bookingId: text(row.request_id), eventId: text(row.event_id), generation: generation(row.generation), credentialGeneration: generation(row.credential_generation), profileId: text(row.profile_id), connectionId: text(row.connection_id), calendarId: text(row.calendar_id), desiredState: row.desired_state, start: text(row.starts_at), end: text(row.ends_at), refreshTokenCiphertext: text(row.refresh_token_ciphertext), accessTokenCiphertext: nullableText(row.access_token_ciphertext), accessExpiresAt: nullableText(row.access_expires_at) };
      },
      async finish(input) {
        return boolean(await rpc("calendar_finish_hold_job", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_generation: input.generation, p_credential_generation: input.credentialGeneration, p_success: input.success, p_error: input.error, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt }));
      }
    },
    connection: {
      async abortOAuth(input) {
        return boolean(await rpc("calendar_abort_oauth", { p_transaction_id: input.transactionId }));
      },
      async beginOAuth(input) {
        const row = singleRow(await rpc("calendar_begin_oauth", { p_profile_id: input.profileId, p_semester_id: input.semesterId, p_state_hash: input.stateHash, p_verifier_ciphertext: input.verifierCiphertext, p_expires_at: input.expiresAt }));
        if (!row) throw unavailable();
        text(row.transaction_id);
        text(row.connection_id);
      },
      async consumeOAuth(input) {
        const row = singleRow(await rpc("calendar_consume_oauth", { p_profile_id: input.profileId, p_semester_id: input.semesterId, p_state_hash: input.stateHash }));
        return row ? { transactionId: text(row.transaction_id), connectionId: text(row.connection_id), verifierCiphertext: text(row.verifier_ciphertext) } : null;
      },
      async completeOAuth(input) {
        return text(await rpc("calendar_complete_oauth", { p_transaction_id: input.transactionId, p_provider_subject: input.providerSubject, p_account_email: input.accountEmail, p_calendar_id: input.calendarId, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: null, p_access_expires_at: null }));
      }
    },
    sync: {
      async lease() {
        const row = singleRow(await (options.bookingTarget ? rpc("calendar_lease_booking_sync", { p_semester_id: options.bookingTarget.semesterId, p_mentor_semester_id: options.bookingTarget.mentorSemesterId }) : rpc("calendar_lease_sync_jobs", { p_limit: 1 })));
        return row ? { jobId: text(row.job_id), leaseToken: text(row.lease_token), credentialGeneration: generation(row.credential_generation), profileId: text(row.profile_id), connectionId: text(row.connection_id), calendarId: text(row.calendar_id), refreshTokenCiphertext: text(row.refresh_token_ciphertext), accessTokenCiphertext: nullableText(row.access_token_ciphertext), accessExpiresAt: nullableText(row.access_expires_at) } : null;
      },
      async apply(input) {
        return boolean(await rpc("calendar_apply_sync_result", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_credential_generation: input.credentialGeneration, p_coverage_start: input.coverageStart, p_coverage_end: input.coverageEnd, p_busy: input.busy.map((interval) => ({ starts_at: interval.start, ends_at: interval.end })), p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt }));
      },
      async fail(input) {
        return boolean(await rpc("calendar_finish_sync_job", { p_job_id: input.jobId, p_lease_token: input.leaseToken, p_credential_generation: input.credentialGeneration, p_success: false, p_error: input.error, p_refresh_token_ciphertext: input.refreshTokenCiphertext, p_access_token_ciphertext: input.accessTokenCiphertext, p_access_expires_at: input.accessExpiresAt }));
      }
    }
  };
}

// src/calendar/google-provider.ts
import { createHash } from "node:crypto";
var GoogleCalendarError = class extends Error {
  constructor(kind) {
    super(`Google Calendar ${kind}`);
    this.name = "GoogleCalendarError";
    this.kind = kind;
  }
};
function holdEventId(bookingId, connectionId) {
  if (!bookingId || !connectionId) throw new GoogleCalendarError("invalid");
  return `a${createHash("sha256").update(JSON.stringify(["almaworks-hold-v1", bookingId, connectionId])).digest("hex")}`;
}
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new GoogleCalendarError("invalid");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new GoogleCalendarError("invalid");
  return time;
}
function range(start, end) {
  const a = timestamp(start), b = timestamp(end);
  if (a >= b) throw new GoogleCalendarError("invalid");
  return [a, b];
}
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleCalendarError("retryable");
  return value;
}
function auth(accessToken) {
  if (!accessToken) throw new GoogleCalendarError("invalid");
  return new Headers({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" });
}
function urlFor(calendarId, eventId) {
  if (!calendarId) throw new GoogleCalendarError("invalid");
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}
async function statusError(response) {
  let reason;
  if (response.status === 403) {
    try {
      const body = await response.json();
      reason = body.error?.errors?.[0]?.reason;
    } catch {
    }
  }
  const retry = response.status === 429 || response.status === 408 || response.status === 409 || response.status === 412 || response.status >= 500 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  return new GoogleCalendarError(retry ? "retryable" : response.status === 401 || response.status === 403 ? "reconnect" : "invalid");
}
async function request(fetcher, url, init, timeoutMilliseconds, read) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GoogleCalendarError("retryable"));
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([
      (async () => read(await fetcher(url, { ...init, cache: "no-store", signal: controller.signal })))(),
      deadline
    ]);
  } catch (error) {
    if (error instanceof GoogleCalendarError) throw error;
    throw new GoogleCalendarError("retryable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function json(response) {
  try {
    return object(await response.json());
  } catch {
    throw new GoogleCalendarError("retryable");
  }
}
function owned(event, id) {
  const properties = event.extendedProperties;
  if (!properties || typeof properties !== "object") return false;
  const marker = properties.private?.almaworksHold;
  return event.id === id && marker === id && event.status !== "cancelled";
}
function createGoogleCalendarProvider(options = {}) {
  const fetcher = options.fetch ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 1e4;
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) throw new GoogleCalendarError("invalid");
  async function getHold(input, id, forDeletion) {
    return request(fetcher, urlFor(input.calendarId, id), { method: "GET", headers: auth(input.accessToken) }, timeoutMilliseconds, async (response) => {
      if (response.status === 404 || response.status === 410) {
        if (forDeletion || response.status === 404) return null;
        throw new GoogleCalendarError("ownership");
      }
      if (!response.ok) throw await statusError(response);
      const event = await json(response);
      if (event.status === "cancelled") {
        if (forDeletion && event.id === id) return null;
        throw new GoogleCalendarError("ownership");
      }
      if (!owned(event, id)) throw new GoogleCalendarError("ownership");
      return event;
    });
  }
  const provider = {
    async queryBusy(input) {
      const [from, to] = range(input.from, input.to);
      if (!input.calendarId) throw new GoogleCalendarError("invalid");
      const result = await request(fetcher, "https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: auth(input.accessToken), body: JSON.stringify({ timeMin: input.from, timeMax: input.to, timeZone: "UTC", items: [{ id: input.calendarId }] }) }, timeoutMilliseconds, async (response) => {
        if (!response.ok) throw await statusError(response);
        return json(response);
      });
      if (result.groups !== void 0 && Object.keys(object(result.groups)).length) throw new GoogleCalendarError("retryable");
      if (result.kind !== "calendar#freeBusy" || timestamp(result.timeMin) !== from || timestamp(result.timeMax) !== to) throw new GoogleCalendarError("retryable");
      const calendars = object(result.calendars);
      const calendar = object(calendars[input.calendarId]);
      if (calendar.errors !== void 0 && (!Array.isArray(calendar.errors) || calendar.errors.length) || !Array.isArray(calendar.busy)) throw new GoogleCalendarError("retryable");
      const intervals = calendar.busy.map((entry) => {
        const item = object(entry);
        const [start, end] = range(item.start, item.end);
        if (start < from || end > to) {
          if (end <= from || start >= to) throw new GoogleCalendarError("retryable");
        }
        return { start: Math.max(start, from), end: Math.min(end, to) };
      }).sort((a, b) => a.start - b.start);
      const merged = [];
      for (const interval of intervals) {
        const last = merged[merged.length - 1];
        if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
        else merged.push(interval);
      }
      return merged.map((interval) => ({ start: new Date(interval.start).toISOString(), end: new Date(interval.end).toISOString() }));
    },
    async upsertHold(input) {
      const [start, end] = range(input.start, input.end);
      const id = holdEventId(input.bookingId, input.connectionId);
      const current = await getHold(input, id, false);
      let needsAvailabilityCheck = !current;
      if (current) {
        const existingStart = current.start?.dateTime;
        const existingEnd = current.end?.dateTime;
        const sameInterval = Boolean(existingStart && existingEnd && timestamp(existingStart) === start && timestamp(existingEnd) === end);
        if (sameInterval && current.visibility === "private" && current.transparency === "opaque" && current.summary === "Almaworks mentorship" && current.reminders?.useDefault === false) return { eventId: id, status: "current" };
        if (typeof current.etag !== "string") throw new GoogleCalendarError("retryable");
        needsAvailabilityCheck = !sameInterval || current.transparency !== "opaque";
      }
      if (needsAvailabilityCheck) {
        const busy = await provider.queryBusy({ accessToken: input.accessToken, calendarId: input.calendarId, from: input.start, to: input.end });
        if (busy.length) throw new GoogleCalendarError("conflict");
      }
      const event = { ...!current ? { id } : {}, summary: "Almaworks mentorship", visibility: "private", transparency: "opaque", reminders: { useDefault: false }, start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(end).toISOString() }, ...!current ? { extendedProperties: { private: { almaworksHold: id } } } : {} };
      const headers = auth(input.accessToken);
      if (current) headers.set("If-Match", current.etag);
      const result = await request(fetcher, `${urlFor(input.calendarId, current ? id : void 0)}?sendUpdates=none`, { method: current ? "PATCH" : "POST", headers, body: JSON.stringify(event) }, timeoutMilliseconds, async (response) => {
        if (!response.ok) throw await statusError(response);
        return json(response);
      });
      if (result.id !== id) throw new GoogleCalendarError("retryable");
      return { eventId: id, status: current ? "updated" : "created" };
    },
    async deleteHold(input) {
      const id = holdEventId(input.bookingId, input.connectionId);
      const current = await getHold(input, id, true);
      if (!current) return { eventId: id, status: "absent" };
      if (typeof current.etag !== "string") throw new GoogleCalendarError("retryable");
      const headers = auth(input.accessToken);
      headers.set("If-Match", current.etag);
      return request(fetcher, `${urlFor(input.calendarId, id)}?sendUpdates=none`, { method: "DELETE", headers }, timeoutMilliseconds, async (response) => {
        if (response.status === 404 || response.status === 410) return { eventId: id, status: "absent" };
        if (!response.ok) throw await statusError(response);
        return { eventId: id, status: "deleted" };
      });
    }
  };
  return provider;
}

// src/calendar/oauth.ts
var GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events.freebusy", "https://www.googleapis.com/auth/calendar.events.owned"];
var GoogleOAuthError = class extends Error {
  constructor(kind) {
    super(`Google OAuth ${kind}`);
    this.name = "GoogleOAuthError";
    this.kind = kind;
  }
};
var GoogleOAuthPermissionsError = class extends GoogleOAuthError {
  constructor() {
    super("invalid");
    this.name = "GoogleOAuthPermissionsError";
  }
};
var GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
async function bounded(milliseconds, operation) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new GoogleOAuthError("invalid");
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GoogleOAuthError("retryable"));
    }, milliseconds);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } catch (error) {
    if (error instanceof GoogleOAuthError) throw error;
    throw new GoogleOAuthError("retryable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function tokenRequest(form, fetcher, oldRefreshToken, requireRefresh = false, timeoutMilliseconds = 1e4) {
  return bounded(timeoutMilliseconds, async (signal) => {
    let response;
    try {
      response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store", signal });
    } catch {
      throw new GoogleOAuthError("retryable");
    }
    if (!response.ok) {
      let error;
      try {
        error = (await response.json()).error;
      } catch {
      }
      throw new GoogleOAuthError(error === "invalid_grant" ? "reconnect" : response.status === 429 || response.status >= 500 ? "retryable" : "invalid");
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new GoogleOAuthError("retryable");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new GoogleOAuthError("invalid");
    if (typeof body.access_token !== "string" || !body.access_token || body.token_type !== "Bearer" || typeof body.expires_in !== "number" || body.expires_in <= 0) throw new GoogleOAuthError("invalid");
    const scopes = typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [];
    if (scopes.includes(GOOGLE_EMAIL_SCOPE) && !scopes.includes("email")) scopes.push("email");
    if (requireRefresh && !GOOGLE_CALENDAR_SCOPES.every((scope) => scopes.includes(scope))) throw new GoogleOAuthPermissionsError();
    if (requireRefresh && (typeof body.refresh_token !== "string" || !body.refresh_token)) throw new GoogleOAuthError("invalid");
    return { accessToken: body.access_token, refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : oldRefreshToken ?? "", expiresIn: body.expires_in, scopes };
  });
}
function refreshGoogleTokens(input) {
  if (!input.refreshToken || !input.clientSecret) throw new GoogleOAuthError("invalid");
  return tokenRequest(new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, refresh_token: input.refreshToken, grant_type: "refresh_token" }), input.fetch ?? fetch, input.refreshToken, false, input.timeoutMilliseconds);
}

// src/calendar/token-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function aad(context) {
  if (!context.profileId || !context.connectionId) throw new Error("Invalid token record context");
  return Buffer.from(JSON.stringify(["almaworks-google-refresh-token", 1, context.profileId, context.connectionId]));
}
function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Invalid encryption key");
}
function encryptRefreshToken(token, key, context) {
  assertKey(key);
  if (!token) throw new Error("Empty refresh token");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { version: 1, nonce: nonce.toString("base64url"), ciphertext: ciphertext.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}
function decryptRefreshToken(record2, key, context) {
  assertKey(key);
  if (record2.version !== 1 || !/^[A-Za-z0-9_-]+$/.test(record2.nonce) || !/^[A-Za-z0-9_-]+$/.test(record2.ciphertext) || !/^[A-Za-z0-9_-]+$/.test(record2.tag)) throw new Error("Invalid encrypted token");
  const nonce = Buffer.from(record2.nonce, "base64url");
  const tag = Buffer.from(record2.tag, "base64url");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted token");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(record2.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Token authentication failed");
  }
}

// src/calendar/sync-worker.ts
async function runCalendarSyncBatch(input) {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid Calendar batch limit");
  const now = input.now ?? Date.now;
  const queryBusy = input.queryBusy ?? createGoogleCalendarProvider({ fetch: input.fetch }).queryBusy;
  const result = { applied: 0, failed: 0, superseded: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await input.repository.lease();
    if (!job) break;
    const context = { profileId: job.profileId, connectionId: job.connectionId };
    let stage = "credentials";
    let publication;
    let refreshTokenCiphertext = null;
    let accessTokenCiphertext = null;
    let accessExpiresAt = null;
    try {
      const decrypt = (ciphertext) => decryptRefreshToken(JSON.parse(ciphertext), input.encryptionKey, context);
      const encrypt = (token) => JSON.stringify(encryptRefreshToken(token, input.encryptionKey, context));
      let accessToken;
      if (job.accessTokenCiphertext && job.accessExpiresAt && Date.parse(job.accessExpiresAt) > now() + 6e4) {
        accessToken = decrypt(job.accessTokenCiphertext);
      } else {
        const refreshToken = decrypt(job.refreshTokenCiphertext);
        stage = "provider";
        const refreshedAt = now();
        const tokens = await refreshGoogleTokens({ ...input.oauth, refreshToken, fetch: input.fetch });
        accessToken = tokens.accessToken;
        refreshTokenCiphertext = encrypt(tokens.refreshToken);
        accessTokenCiphertext = encrypt(accessToken);
        accessExpiresAt = new Date(refreshedAt + tokens.expiresIn * 1e3).toISOString();
      }
      stage = "provider";
      const start = Math.floor(now() / 864e5) * 864e5 - 864e5;
      const coverageStart = new Date(start).toISOString();
      const coverageEnd = new Date(start + 89 * 864e5).toISOString();
      const busy = await queryBusy({ accessToken, calendarId: job.calendarId, from: coverageStart, to: coverageEnd });
      publication = { jobId: job.jobId, leaseToken: job.leaseToken, credentialGeneration: job.credentialGeneration, coverageStart, coverageEnd, busy, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt };
    } catch (error) {
      const category = error instanceof GoogleCalendarError || error instanceof GoogleOAuthError ? error.kind : stage === "credentials" ? "credentials" : "retryable";
      const acknowledged = await input.repository.fail({ jobId: job.jobId, leaseToken: job.leaseToken, credentialGeneration: job.credentialGeneration, error: category, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt });
      if (acknowledged) result.failed++;
      else result.superseded++;
      continue;
    }
    if (await input.repository.apply(publication)) result.applied++;
    else result.superseded++;
  }
  return result;
}

// src/calendar/hold-worker.ts
async function runCalendarHoldBatch(input) {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid Calendar batch limit");
  const now = input.now ?? Date.now;
  const provider = input.provider ?? createGoogleCalendarProvider({ fetch: input.fetch });
  const counts = { applied: 0, failed: 0, superseded: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await input.repository.lease();
    if (!job) break;
    const context = { profileId: job.profileId, connectionId: job.connectionId };
    let refreshTokenCiphertext = null, accessTokenCiphertext = null, accessExpiresAt = null;
    let success = false, errorCategory = null;
    let stage = "credentials";
    try {
      if (job.eventId !== holdEventId(job.bookingId, job.connectionId) || !["present", "absent"].includes(job.desiredState)) throw new GoogleCalendarError("ownership");
      const decrypt = (ciphertext) => decryptRefreshToken(JSON.parse(ciphertext), input.encryptionKey, context);
      const encrypt = (token) => JSON.stringify(encryptRefreshToken(token, input.encryptionKey, context));
      let accessToken;
      if (job.accessTokenCiphertext && job.accessExpiresAt && Date.parse(job.accessExpiresAt) > now() + 6e4) {
        accessToken = decrypt(job.accessTokenCiphertext);
      } else {
        const refreshToken = decrypt(job.refreshTokenCiphertext);
        stage = "provider";
        const refreshedAt = now();
        const tokens = await refreshGoogleTokens({ ...input.oauth, refreshToken, fetch: input.fetch });
        accessToken = tokens.accessToken;
        refreshTokenCiphertext = encrypt(tokens.refreshToken);
        accessTokenCiphertext = encrypt(accessToken);
        accessExpiresAt = new Date(refreshedAt + tokens.expiresIn * 1e3).toISOString();
      }
      stage = "provider";
      const operation = { accessToken, calendarId: job.calendarId, bookingId: job.bookingId, connectionId: job.connectionId, start: job.start, end: job.end };
      const result = job.desiredState === "present" ? await provider.upsertHold(operation) : await provider.deleteHold(operation);
      if (result.eventId !== job.eventId) throw new GoogleCalendarError("ownership");
      success = true;
    } catch (error) {
      errorCategory = error instanceof GoogleCalendarError || error instanceof GoogleOAuthError ? error.kind : stage === "credentials" ? "credentials" : "retryable";
    }
    const acknowledged = await input.repository.finish({ jobId: job.jobId, leaseToken: job.leaseToken, generation: job.generation, credentialGeneration: job.credentialGeneration, success, error: errorCategory, refreshTokenCiphertext, accessTokenCiphertext, accessExpiresAt });
    if (!acknowledged) counts.superseded++;
    else if (success) counts.applied++;
    else counts.failed++;
  }
  return counts;
}

// src/calendar/disconnect-worker.ts
async function runCalendarDisconnectBatch(input) {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid Calendar batch limit");
  const counts = { applied: 0, failed: 0, superseded: 0 };
  for (let index = 0; index < limit; index++) {
    const job = await input.repository.lease();
    if (!job) break;
    const acknowledged = await input.repository.finish({ connectionId: job.connectionId, leaseToken: job.leaseToken, credentialGeneration: job.credentialGeneration });
    if (!acknowledged) counts.superseded++;
    else counts.applied++;
  }
  return counts;
}

// src/calendar/worker-endpoint.ts
import { createHash as createHash2, timingSafeEqual } from "node:crypto";

// src/auth/request.ts
function readBearerToken(header) {
  if (header === null) return null;
  const match = /^bearer\s+([^\s]+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

// src/calendar/worker-endpoint.ts
var empty = () => ({ applied: 0, failed: 0, superseded: 0 });
var count = (value) => value.applied + value.failed + value.superseded;
var hash = (value) => createHash2("sha256").update(value).digest();
async function drainCalendarWork(input) {
  const now = input.now ?? Date.now;
  const budget = input.budgetMilliseconds ?? 15e4;
  if (!Number.isFinite(budget) || budget <= 0 || budget > 15e4) throw new Error("Invalid Calendar worker budget");
  const deadline = now() + budget;
  const result = { sync: empty(), holds: empty(), ...input.disconnect ? { disconnect: empty() } : {} };
  let failed = false;
  const outcomes = await Promise.allSettled(Array.from({ length: 3 }, async () => {
    for (let round = 0; round < 20 && now() < deadline && !failed; round++) {
      const batch = await Promise.allSettled([input.holds(), input.sync(), ...input.disconnect ? [input.disconnect()] : []]);
      if (batch.some((item) => item.status === "rejected")) {
        failed = true;
        throw new Error("Calendar worker batch failed");
      }
      let processed = 0;
      for (const [index, item] of batch.entries()) {
        if (item.status !== "fulfilled") continue;
        const target = index === 0 ? result.holds : index === 1 ? result.sync : result.disconnect;
        target.applied += item.value.applied;
        target.failed += item.value.failed;
        target.superseded += item.value.superseded;
        processed += count(item.value);
      }
      if (!processed) break;
    }
  }));
  if (outcomes.some((item) => item.status === "rejected")) throw new Error("Calendar worker batch failed");
  return result;
}
async function handleCalendarWorker(request2, input) {
  const headers = { "Cache-Control": "no-store" };
  const supplied = readBearerToken(request2.headers.get("authorization"));
  if (!input.secret || input.secret.length < 32) return Response.json({ error: "Calendar worker is not configured." }, { status: 503, headers });
  if (!supplied || !timingSafeEqual(hash(supplied), hash(input.secret))) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    return Response.json(await input.run(), { headers });
  } catch {
    return Response.json({ error: "Calendar worker could not complete. Queued work will be retried." }, { status: 503, headers });
  }
}

// supabase/functions/calendar-worker/entry.ts
Object.assign(globalThis, { Buffer: Buffer2 });
Deno.serve(async (request2) => {
  if (request2.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const env = Deno.env.toObject();
  return handleCalendarWorker(request2, { secret: env.CALENDAR_CRON_SECRET ?? null, run: async () => {
    const config = calendarConfiguration(env);
    if (!config) throw new Error("Calendar setup unavailable");
    const repositories = await createCalendarRepositories(config);
    const common = { oauth: config.oauth, encryptionKey: config.encryptionKey, limit: 1 };
    return drainCalendarWork({
      budgetMilliseconds: 45e3,
      sync: () => runCalendarSyncBatch({ ...common, repository: repositories.sync }),
      holds: () => runCalendarHoldBatch({ ...common, repository: repositories.holds }),
      disconnect: () => runCalendarDisconnectBatch({ limit: 1, repository: repositories.disconnect })
    });
  } });
});
