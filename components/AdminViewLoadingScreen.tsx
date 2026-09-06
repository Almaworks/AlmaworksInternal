import { LoaderCircle } from "lucide-react";

import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import type { AdminView } from "@/src/dashboard/participant-preview";

export function AdminViewLoadingScreen({
  destination,
  className = "min-h-full",
}: {
  destination: AdminView;
  className?: string;
}) {
  const label = destination === "admin" ? "admin" : `${destination} preview`;

  return (
    <section
      className={`flex items-center justify-center bg-[#f8fafb] px-6 py-16 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <AlmaworksBrand compact iconSize={46} className="mb-7" />
        <LoaderCircle
          className="mb-5 animate-spin text-[#75AADB] motion-reduce:animate-none"
          size={30}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <h1 className="text-xl font-semibold text-[#002147]">Loading {label}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Preparing the {destination === "admin" ? "program workspace" : "fictional participant experience"}.
        </p>
      </div>
    </section>
  );
}
