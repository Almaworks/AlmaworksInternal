export async function startCalendarConnection(input: { semesterId: string; returnTo: "onboarding" | "availability" | "bookings"; beforeConnect?: () => Promise<boolean>; fetch: typeof fetch }): Promise<string> {
  if (input.beforeConnect && !await input.beforeConnect()) throw new Error("Save your onboarding details before connecting Calendar.");
  const response = await input.fetch("/api/calendar/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId: input.semesterId, returnTo: input.returnTo }) });
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("Calendar connection response is invalid.");
  const payload = body as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Calendar could not connect. Please try again.");
  if (typeof payload.authorizationUrl !== "string") throw new Error("Calendar connection response is invalid.");
  const url = new URL(payload.authorizationUrl);
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) throw new Error("Calendar connection destination is invalid.");
  return url.toString();
}

export async function requestCalendarDisconnect(input:{semesterId:string;connectionId:string;keepManual:boolean;fetch:typeof fetch}):Promise<void>{
  const response=await input.fetch("/api/calendar/disconnect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({semesterId:input.semesterId,connectionId:input.connectionId,keepManual:input.keepManual}),signal:AbortSignal.timeout(20000)});
  const value:unknown=await response.json();
  if(!response.ok||!value||typeof value!=="object"||!("queued"in value)||value.queued!==true)throw new Error(value&&typeof value==="object"&&"error"in value&&typeof value.error==="string"?value.error:"Calendar disconnect was not confirmed. Please try again.");
}
