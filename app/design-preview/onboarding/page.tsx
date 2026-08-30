import { notFound } from "next/navigation";

import OnboardingFlow from "@/app/dashboard/onboarding/onboarding-flow";

export default function OnboardingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="p-4 md:p-8"><OnboardingFlow /></div>;
}
