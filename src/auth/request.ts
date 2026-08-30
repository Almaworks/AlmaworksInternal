export function readBearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^bearer\s+([^\s]+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}
