import { OutreachEmailWorkspace } from "@/components/outreach-email/OutreachEmailWorkspace";

export default async function OutreachEmailPage({ searchParams }: { searchParams: Promise<{ semesterId?: string; opportunityId?: string }> }) {
  const query = await searchParams;
  if (!query.semesterId) return <main className="mx-auto max-w-5xl"><p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Choose a semester from Outreach before opening the email library.</p></main>;
  return <main className="mx-auto max-w-5xl"><OutreachEmailWorkspace key={`${query.semesterId}:${query.opportunityId ?? "library"}`} semesterId={query.semesterId} opportunityId={query.opportunityId} /></main>;
}
