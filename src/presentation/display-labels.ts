const ACRONYMS = new Map<string, string>([
  ["ai", "AI"],
  ["api", "API"],
  ["id", "ID"],
  ["mvp", "MVP"],
  ["rls", "RLS"],
  ["url", "URL"],
]);

export function formatEnumLabel(value: string): string {
  return value
    .trim()
    .split(/[_\s-]+/u)
    .filter(Boolean)
    .map((word) => ACRONYMS.get(word.toLowerCase()) ?? `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

export function formatTimeZoneLabel(value: string): string {
  return value.replace(/_/gu, " ");
}
