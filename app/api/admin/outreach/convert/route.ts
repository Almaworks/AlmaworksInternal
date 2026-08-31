import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Direct outreach-to-profile conversion was retired; outreach contacts remain independent from program profiles." }, { status: 410 });
}

