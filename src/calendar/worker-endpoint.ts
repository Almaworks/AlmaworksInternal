import { createHash, timingSafeEqual } from "node:crypto";
import { readBearerToken } from "../auth/request.ts";

interface Counts { applied: number; failed: number; superseded: number }
interface WorkResult { sync: Counts; holds: Counts; disconnect?: Counts }
const empty = (): Counts => ({ applied: 0, failed: 0, superseded: 0 });
const count = (value: Counts) => value.applied + value.failed + value.superseded;
const hash = (value: string) => createHash("sha256").update(value).digest();

/** Bounded parallelism; each operation leases a single job just before processing it. */
export async function drainCalendarWork(input: { sync(): Promise<Counts>; holds(): Promise<Counts>; disconnect?(): Promise<Counts>; now?: () => number; budgetMilliseconds?: number }): Promise<WorkResult> {
  const now = input.now ?? Date.now;
  const budget = input.budgetMilliseconds ?? 150_000;
  if (!Number.isFinite(budget) || budget <= 0 || budget > 150_000) throw new Error("Invalid Calendar worker budget");
  const deadline = now() + budget;
  const result: WorkResult = { sync: empty(), holds: empty(), ...(input.disconnect?{disconnect:empty()}:{}) };
  let failed = false;
  const outcomes = await Promise.allSettled(Array.from({ length: 3 }, async () => {
    for (let round = 0; round < 20 && now() < deadline && !failed; round++) {
      const batch = await Promise.allSettled([input.holds(), input.sync(), ...(input.disconnect?[input.disconnect()]:[])]);
      if (batch.some(item => item.status === "rejected")) { failed = true; throw new Error("Calendar worker batch failed"); }
      let processed = 0;
      for (const [index, item] of batch.entries()) {
        if (item.status !== "fulfilled") continue;
        const target = index === 0 ? result.holds : index===1 ? result.sync : result.disconnect!;
        target.applied += item.value.applied; target.failed += item.value.failed; target.superseded += item.value.superseded;
        processed += count(item.value);
      }
      if (!processed) break;
    }
  }));
  if (outcomes.some(item => item.status === "rejected")) throw new Error("Calendar worker batch failed");
  return result;
}

export async function handleCalendarWorker(request: Request, input: { secret: string | null; run(): Promise<WorkResult> }): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const supplied = readBearerToken(request.headers.get("authorization"));
  if (!input.secret || input.secret.length < 32) return Response.json({ error: "Calendar worker is not configured." }, { status: 503, headers });
  if (!supplied || !timingSafeEqual(hash(supplied), hash(input.secret))) return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  try { return Response.json(await input.run(), { headers }); }
  catch { return Response.json({ error: "Calendar worker could not complete. Queued work will be retried." }, { status: 503, headers }); }
}
