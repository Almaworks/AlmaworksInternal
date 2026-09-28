import { NextResponse } from "next/server";

import { legacyAssignmentRetiredPayload } from "./retired-payload";

export function legacyAssignmentRetiredResponse() {
  return NextResponse.json(legacyAssignmentRetiredPayload, { status: 410 });
}
