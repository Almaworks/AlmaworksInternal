import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json({ error: "This legacy endpoint was replaced by the outreach opportunity command API." }, { status: 410 });
}

