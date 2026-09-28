/** Only an explicitly configured public HTTPS origin is suitable for invitations. */
export function mentorOnboardingUrl(origin: string | undefined): string | null {
  if (!origin?.trim()) return null;
  try {
    const url = new URL(origin.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || !url.hostname.includes(".") || /^[\d.]+$/u.test(url.hostname) || url.hostname.includes(":")) return null;
    return new URL("/request-access", url.origin).href;
  } catch { return null; }
}
