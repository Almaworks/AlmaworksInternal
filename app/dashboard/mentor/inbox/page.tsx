import { redirect } from "next/navigation";

export default function MentorInboxPage() {
  redirect("/dashboard/mentor?tab=sessions");
}
