import { gmailGet, gmailPost } from "@/src/outreach-gmail/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = gmailGet;
export const POST = gmailPost;
