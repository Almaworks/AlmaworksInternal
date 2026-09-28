export const MAX_CARRY_FORWARD_CONTACTS = 250;

export function selectedVisibleContacts(selected: readonly string[], rows: readonly { contactId: string; semesterId: string }[], sourceSemesterId: string): string[] {
  const visible = new Set(rows.filter((row) => row.semesterId === sourceSemesterId).map((row) => row.contactId));
  return [...new Set(selected)].filter((id) => visible.has(id));
}

interface CarryForwardInput { sourceSemesterId: string; targetSemesterId: string; contactIds: string[] }
export interface CarryForwardResult { addedCount: number; skippedCount: number; targetSemesterId: string }

export async function submitCarryForward(request: (url: string, init?: RequestInit) => Promise<Response>, input: CarryForwardInput): Promise<CarryForwardResult> {
  const response = await request("/api/admin/outreach/carry-forward", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  const payload: unknown = await response.json().catch(() => null);
  const fallback = "We could not confirm the import. You can retry safely; existing contacts will be skipped.";
  if (!payload || typeof payload !== "object") throw new Error(fallback);
  if (!response.ok) {
    const error = "error" in payload ? payload.error : null;
    throw new Error(error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback);
  }
  const result = "data" in payload ? payload.data : null;
  if (!result || typeof result !== "object" || !("addedCount" in result) || !("skippedCount" in result) || !("targetSemesterId" in result)
    || typeof result.addedCount !== "number" || !Number.isInteger(result.addedCount) || result.addedCount < 0
    || typeof result.skippedCount !== "number" || !Number.isInteger(result.skippedCount) || result.skippedCount < 0
    || result.addedCount + result.skippedCount !== input.contactIds.length || result.targetSemesterId !== input.targetSemesterId) throw new Error(fallback);
  return { addedCount: result.addedCount, skippedCount: result.skippedCount, targetSemesterId: input.targetSemesterId };
}
