export type MentorNeedsDisplayState = "initial-loading" | "updating" | "empty" | "content" | "error";

export function getMentorNeedsDisplayState(input: {
  isLoading: boolean;
  hasLoaded: boolean;
  hasError: boolean;
  rowCount: number;
}): MentorNeedsDisplayState {
  if (input.hasError && !input.hasLoaded) return "error";
  if (input.isLoading && !input.hasLoaded) return "initial-loading";
  if (input.isLoading) return "updating";
  if (input.rowCount === 0) return "empty";
  return "content";
}
