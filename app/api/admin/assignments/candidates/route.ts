import { legacyAssignmentRetiredResponse } from "@/src/assignments/retired";

export async function GET() {
  return legacyAssignmentRetiredResponse();
}
