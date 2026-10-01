"use client";

import {
  CalendarDays,
  LayoutDashboard,
  Megaphone,
  Target,
  Users,
} from "lucide-react";

import { AdminViewAsControl } from "@/components/AdminViewAsControl";
import { AdminViewLoadingScreen } from "@/components/AdminViewLoadingScreen";
import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import type { AdminView } from "@/src/dashboard/participant-preview";

const adminItems = [
  { label: "Overview", Icon: LayoutDashboard },
  { label: "Schedule", Icon: CalendarDays },
  { label: "Semesters", Icon: CalendarDays },
  { label: "Outreach", Icon: Megaphone },
  { label: "Mentor Needs", Icon: Target },
  { label: "Mentors", Icon: Users },
  { label: "Notify", Icon: Megaphone },
] as const;

export function AdminViewTransitionShell({
  destination,
  adminName,
}: {
  destination: AdminView;
  adminName?: string | null;
}) {
  return (
    <div className="flex h-screen bg-[#f8fafb]">
      <aside
        className="hidden w-56 shrink-0 flex-col bg-[#002147] md:flex"
        aria-label="Admin sidebar loading"
        aria-busy="true"
      >
        <div className="border-b border-white/10 px-5 py-5">
          <AlmaworksBrand tone="white" iconSize={30} />
          <span className="mt-1 inline-block rounded-full bg-[#75AADB]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#75AADB]/80">
            Admin
          </span>
        </div>

        <AdminViewAsControl
          current={destination}
          onChange={() => undefined}
          disabled
          className="px-3 pt-3 pb-1"
        />

        <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Disabled admin navigation">
          {adminItems.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              className="flex w-full cursor-wait items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/35"
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="truncate text-xs text-white/35">{adminName ?? "Admin workspace"}</p>
          <p className="mt-2 text-xs font-medium text-white/25">Navigation paused</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-[#002147] md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <AlmaworksBrand tone="white" iconSize={28} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ac7e2]">Admin</span>
          </div>
          <AdminViewAsControl
            current={destination}
            onChange={() => undefined}
            disabled
            className="border-t border-white/10 px-3 py-2"
          />
        </header>
        <main className="min-h-0 flex-1">
          <AdminViewLoadingScreen destination={destination} className="h-full min-h-[28rem]" />
        </main>
      </div>
    </div>
  );
}
