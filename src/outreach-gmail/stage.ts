export interface StageStore {
  read(): Promise<{ stage: string; updatedAt: string; archived: boolean } | null>;
  /** The existing stage RPC locks the row and rejects a stale timestamp. */
  advance(expectedUpdatedAt: string): Promise<boolean>;
}

export async function advanceStageAfterSend(status: string, store: StageStore): Promise<"updated" | "unchanged" | "pending"> {
  if (status !== "sent") return "unchanged";
  try {
    const current = await store.read();
    if (!current) return "pending";
    if (current.archived || current.stage !== "not_contacted") return "unchanged";
    return await store.advance(current.updatedAt) ? "updated" : "pending";
  } catch {
    // Gmail already accepted the email: never turn a stage failure into a send retry.
    return "pending";
  }
}
