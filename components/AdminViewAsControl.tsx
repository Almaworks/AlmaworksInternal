"use client";

import type { AdminView } from "@/src/dashboard/participant-preview";

export function AdminViewAsControl({
  current,
  onChange,
  className = "px-3 pt-3 pb-1",
  disabled = false,
}: {
  current: AdminView;
  onChange: (view: AdminView) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <p className="px-1 text-[9px] font-semibold tracking-widest uppercase text-white/30 mb-1.5">View as</p>
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        {(["admin", "startup", "mentor"] as AdminView[]).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            disabled={disabled}
            aria-current={current === view ? "page" : undefined}
            className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${
              current === view
                ? "bg-white/20 text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/10"
            } disabled:cursor-wait disabled:pointer-events-none`}
          >
            {view === "admin" ? "Admin" : view === "startup" ? "Startup" : "Mentor"}
          </button>
        ))}
      </div>
    </div>
  );
}
