import { redirect } from "next/navigation";

export default function AdminImportPage() {
  redirect("/dashboard/admin/outreach?view=imports");
}
