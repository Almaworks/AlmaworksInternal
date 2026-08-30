import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { createImportPreview } from "./import-flow.ts";

type Client = SupabaseClient<Database>;

export async function previewLegacyMigration(args: {
  client: Client;
  userId: string;
  semesterId: string;
}) {
  const { data: rows, error } = await args.client
    .from("outreach")
    .select("*")
    .eq("semester_id", args.semesterId)
    .order("id", { ascending: true });
  if (error !== null) throw new Error("Unable to read legacy outreach rows.");
  return await createImportPreview({
    ...args,
    source: "legacy",
    sourceFilename: `public.outreach:${args.semesterId}`,
    rows: (rows ?? []).map((row) => ({ ...row })),
  });
}

export async function commitLegacyMigration(args: {
  client: Client;
  userId: string;
  semesterId: string;
  idempotencyKey: string;
}) {
  type AtomicLegacyCommit = (
    name: "commit_legacy_outreach_migration",
    rpcArgs: { p_semester_id: string; p_idempotency_key: string },
  ) => Promise<{
    data: {
      importId: string;
      status: "committed";
      summary: Record<string, unknown>;
    } | null;
    error: { message: string } | null;
  }>;

  // The generated database types gain this overload after the local migration
  // is applied and types are regenerated. Keeping the cast at this boundary
  // avoids weakening the rest of the typed Supabase client meanwhile.
  const rpc = args.client.rpc.bind(args.client) as unknown as AtomicLegacyCommit;
  const { data, error } = await rpc("commit_legacy_outreach_migration", {
    p_semester_id: args.semesterId,
    p_idempotency_key: args.idempotencyKey,
  });
  if (error !== null) throw new Error(error.message);
  if (data === null) throw new Error("Legacy migration commit returned no result.");
  return data;
}
