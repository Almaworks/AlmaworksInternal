import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({ error: "This legacy endpoint was replaced by semester-scoped outreach activities." }, { status: 410 });
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }

