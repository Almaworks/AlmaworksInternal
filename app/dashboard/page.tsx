"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { createClient } from "@/utils/supabase/client";

export default function DashboardRoot() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }
      try {
        const capabilityResponse = await authenticatedFetch("/api/auth/capabilities");
        const capabilityPayload = await capabilityResponse.json() as { data?: { canManageAdmin?: boolean } };
        if (capabilityResponse.ok && capabilityPayload.data?.canManageAdmin) { router.replace("/dashboard/admin"); return; }
      } catch {
        // Participant routing still works when the optional admin capability check is unavailable.
      }
      const { data: semester } = await supabase.from("semesters").select("id").eq("is_active", true).maybeSingle();
      if (!semester) { router.replace("/pending"); return; }
      const { data: membership } = await supabase.from("semester_memberships")
        .select("role,status")
        .eq("semester_id", semester.id)
        .eq("profile_id", user.id)
        .in("status", ["invited", "onboarding", "active"])
        .maybeSingle();
      if (membership?.role === "mentor") router.replace("/dashboard/mentor");
      else if (membership?.role === "startup") router.replace("/dashboard/startup");
      else router.replace("/pending");
    });
  }, [router]);

  return <div className="flex h-40 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[#002147] border-t-transparent" /></div>;
}
