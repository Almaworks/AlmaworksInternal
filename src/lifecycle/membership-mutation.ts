export type MembershipMutationOutcome =
  | { status: "mutation_failed"; message: string }
  | { status: "updated_refresh_failed" }
  | { status: "updated" };

type RefreshResult = boolean | void;

interface PersistAndRefreshMembershipInput {
  persist: () => Promise<void>;
  refreshes: readonly (() => Promise<RefreshResult>)[];
}

export async function refreshMembershipReadModels(
  refreshes: readonly (() => Promise<RefreshResult>)[],
): Promise<boolean> {
  const refreshResults = await Promise.allSettled(refreshes.map((refresh) => refresh()));
  return refreshResults.every((result) => (
    result.status === "fulfilled" && result.value !== false
  ));
}

export async function persistAndRefreshMembership(
  input: PersistAndRefreshMembershipInput,
): Promise<MembershipMutationOutcome> {
  try {
    await input.persist();
  } catch (cause) {
    return {
      status: "mutation_failed",
      message: cause instanceof Error ? cause.message : "Unable to update semester membership.",
    };
  }

  const refreshed = await refreshMembershipReadModels(input.refreshes);
  return refreshed ? { status: "updated" } : { status: "updated_refresh_failed" };
}
