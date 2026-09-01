"use client";

import type { MembershipVisibility } from "@/src/lifecycle/membership-presentation";

interface MembershipVisibilitySwitchProps {
  value: MembershipVisibility;
  onChange: (visibility: MembershipVisibility) => void;
}

export function MembershipVisibilitySwitch({ value, onChange }: MembershipVisibilitySwitchProps) {
  const optionClass = (selected: boolean) => `flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75AADB] focus-visible:ring-offset-2 ${
    selected ? "bg-[#002147] text-white" : "text-gray-700 hover:bg-gray-100"
  }`;
  const pipClass = (selected: boolean) => `h-2.5 w-2.5 rounded-full ${selected ? "bg-white" : "border border-current"}`;

  return (
    <div role="group" aria-label="Member visibility" className="inline-flex rounded-full border border-gray-300 bg-white p-1 shadow-sm">
      <button
        type="button"
        aria-label="Show all members"
        aria-pressed={value === "all"}
        className={optionClass(value === "all")}
        onClick={() => onChange("all")}
      >
        <span aria-hidden="true" className={pipClass(value === "all")} />
        All
      </button>
      <button
        type="button"
        aria-label="Show active members only"
        aria-pressed={value === "active"}
        className={optionClass(value === "active")}
        onClick={() => onChange("active")}
      >
        <span aria-hidden="true" className={pipClass(value === "active")} />
        Active only
      </button>
    </div>
  );
}
