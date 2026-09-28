import { LoaderCircle } from "lucide-react";

/** A visible, accessible state while remote data is being loaded. */
export function DataLoading({ label = "Loading workspace…", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" aria-live="polite" aria-busy="true" className={compact ? "flex items-center gap-2 py-3 text-sm text-slate-600" : "rounded-2xl border border-slate-200 bg-white p-6"}>
    <div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle size={18} aria-hidden="true" className="shrink-0 animate-spin text-[#75AADB] motion-reduce:animate-none" /><span>{label}</span></div>
    {!compact && <div aria-hidden="true" className="mt-5 space-y-3 animate-pulse motion-reduce:animate-none"><div className="h-4 w-1/3 rounded bg-slate-100" /><div className="h-4 w-2/3 rounded bg-slate-100" /><div className="h-20 rounded-lg bg-slate-50" /></div>}
  </div>;
}
