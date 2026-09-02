export type MemberLoginOperationMode = "remove" | "restore";

export type MemberLoginInteraction = {
  actionLink: string | null;
  completed: MemberLoginOperationMode | null;
  expectedAccountState: "enabled" | "removal_incomplete" | "removed" | null;
  mode: MemberLoginOperationMode;
  mustSendLink: boolean;
  pending: boolean;
  previewReady: boolean;
  primaryMessage: string | null;
  refreshMessage: string | null;
  refreshRequired: boolean;
};

export function createMemberLoginInteraction(mode: MemberLoginOperationMode): MemberLoginInteraction {
  return {
    actionLink: null,
    completed: null,
    expectedAccountState: null,
    mode,
    mustSendLink: false,
    pending: false,
    previewReady: false,
    primaryMessage: null,
    refreshMessage: null,
    refreshRequired: false,
  };
}

export function beginMemberLoginPreflight(state: MemberLoginInteraction): MemberLoginInteraction {
  return {
    ...state,
    previewReady: false,
    primaryMessage: null,
    refreshMessage: null,
    refreshRequired: false,
  };
}

export function acceptMemberLoginPreflight(state: MemberLoginInteraction): MemberLoginInteraction {
  return { ...state, previewReady: true };
}

export function beginMemberLoginMutation(
  state: MemberLoginInteraction,
  removalReady: boolean,
): MemberLoginInteraction {
  if (state.pending || !state.previewReady || (state.mode === "remove" && !removalReady)) return state;
  return { ...state, pending: true, refreshMessage: null, refreshRequired: false };
}

export function markMemberLoginPartialRemoval(state: MemberLoginInteraction): MemberLoginInteraction {
  return {
    ...state,
    mode: "remove",
    pending: false,
    expectedAccountState: "removal_incomplete",
    primaryMessage: "Program access is blocked, but login deletion needs to be retried",
  };
}

export function completeMemberLoginRemoval(state: MemberLoginInteraction): MemberLoginInteraction {
  return {
    ...state,
    completed: "remove",
    expectedAccountState: "removed",
    mode: "remove",
    pending: false,
    primaryMessage: "Login removed. Contact information and program history were retained.",
  };
}

export function completeMemberLoginRestoration(
  state: MemberLoginInteraction,
  result: { actionLink: string; mustSendLink: true },
): MemberLoginInteraction {
  return {
    ...state,
    actionLink: result.actionLink,
    completed: "restore",
    expectedAccountState: "enabled",
    mode: "restore",
    mustSendLink: result.mustSendLink,
    pending: false,
    primaryMessage: "Sign-in is restored. Semester membership remains suspended until you restore it separately.",
  };
}

export function failMemberLoginMutation(state: MemberLoginInteraction): MemberLoginInteraction {
  return { ...state, pending: false };
}

export function recordMemberLoginRefresh(
  state: MemberLoginInteraction,
  succeeded: boolean,
): MemberLoginInteraction {
  return succeeded
    ? { ...state, refreshMessage: null, refreshRequired: false }
    : {
        ...state,
        refreshMessage: "Login updated, but the Members list could not refresh",
        refreshRequired: true,
      };
}

export function synchronizeMemberLoginPresentation(
  state: MemberLoginInteraction,
  mode: MemberLoginOperationMode,
  controlledState: string,
  dialogOpen: boolean,
): MemberLoginInteraction {
  if (
    state.expectedAccountState !== null
    && (dialogOpen || controlledState !== state.expectedAccountState)
  ) return state;
  if (dialogOpen) return { ...state, mode };
  return createMemberLoginInteraction(mode);
}

export class LatestMemberLoginPreflight {
  #controller: AbortController | null = null;
  #id = 0;

  begin(): { id: number; signal: AbortSignal } {
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#id += 1;
    return { id: this.#id, signal: this.#controller.signal };
  }

  isCurrent(id: number): boolean {
    return this.#controller !== null && !this.#controller.signal.aborted && id === this.#id;
  }

  invalidate(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#id += 1;
  }
}

export function memberLoginRequestHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export function containFocusIndex(currentIndex: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  return (currentIndex + direction + count) % count;
}
