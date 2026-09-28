import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "../auth/server.ts";
import type { Database } from "../db/types.ts";
import { readOutreachEmailConfiguration } from "../outreach-email/server.ts";
import { exportExclusions } from "./catalog.ts";
import { createSemesterExportArchive, createSemesterExportManifest } from "./format.ts";
import { createSemesterExportStore, createSupabaseSemesterExportDataSource, SemesterExportStoreError, type SemesterExportStore } from "./store.ts";
import type { SemesterExportArchive, SemesterExportFormat, SemesterExportInput, SemesterExportScope } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALLOWED_QUERY_PARAMETERS = new Set(["semesterId", "scope", "format"]);
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;

export class SemesterExportHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SemesterExportHttpError";
    this.status = status;
  }
}

export type AuthorizeSemesterExport = (request: Request, semesterId: string) => Promise<SemesterExportStore>;

interface SemesterExportHandlerDependencies {
  authorize: AuthorizeSemesterExport;
  createArchive?: (input: SemesterExportInput) => Promise<SemesterExportArchive>;
  now?: () => Date;
}

interface ParsedQuery {
  format: SemesterExportFormat;
  scope: SemesterExportScope;
  semesterId: string;
}

function parseQuery(request: Request): ParsedQuery {
  const parameters = new URL(request.url).searchParams;
  for (const key of parameters.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key)) throw new SemesterExportHttpError(400, `Unsupported query parameter: ${key}.`);
  }
  for (const key of ALLOWED_QUERY_PARAMETERS) {
    if (parameters.getAll(key).length > 1) throw new SemesterExportHttpError(400, `${key} must be provided once.`);
  }
  const semesterId = parameters.get("semesterId") ?? "";
  if (!UUID.test(semesterId)) throw new SemesterExportHttpError(400, "semesterId must be a UUID.");
  const scope = parameters.get("scope");
  if (scope !== "semester" && scope !== "outreach") throw new SemesterExportHttpError(400, "scope must be semester or outreach.");
  const requestedFormat = parameters.get("format") ?? "manifest";
  if (requestedFormat !== "manifest" && requestedFormat !== "zip") throw new SemesterExportHttpError(400, "format must be manifest or zip.");
  return { format: requestedFormat, scope, semesterId };
}

function noStoreHeaders(additional: HeadersInit = {}): Headers {
  const headers = new Headers(additional);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStoreHeaders() });
}

function failure(cause: unknown): Response {
  if (cause instanceof SemesterExportHttpError || cause instanceof SemesterExportStoreError || cause instanceof AuthorizationError) {
    return json({ error: { message: cause.message } }, cause.status);
  }
  return json({ error: { message: "Semester export could not be generated." } }, 500);
}

export function createSemesterExportHandlers(dependencies: SemesterExportHandlerDependencies) {
  const createArchive = dependencies.createArchive ?? createSemesterExportArchive;
  const now = dependencies.now ?? (() => new Date());
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const query = parseQuery(request);
        const store = await dependencies.authorize(request, query.semesterId);
        const loaded = await store.load(query.semesterId, query.scope);
        if (loaded.semesterId !== query.semesterId) throw new SemesterExportHttpError(500, "Export data did not match the authorized semester.");
        const input: SemesterExportInput = {
          metadata: {
            scope: query.scope,
            semesterId: loaded.semesterId,
            semesterName: loaded.semesterName,
            exportedAt: now().toISOString(),
            exclusions: exportExclusions,
            unresolvedProfileIds: (loaded.datasets.find(({ id }) => id === "unresolved_profile_references")?.rows ?? [])
              .map((row) => row.profile_id)
              .filter((profileId): profileId is string => typeof profileId === "string"),
          },
          datasets: loaded.datasets,
        };
        if (query.format === "manifest") return json({ data: createSemesterExportManifest(input) });
        const result = await createArchive(input);
        const expectedFileName = `semester-export-${query.semesterId}-${query.scope}.zip`;
        if (result.fileName !== expectedFileName) throw new SemesterExportHttpError(500, "Export formatter returned an invalid filename.");
        if (result.archive.byteLength > MAX_ARCHIVE_BYTES) throw new SemesterExportHttpError(413, "Export archive exceeds the supported size limit.");
        return new Response(new Uint8Array(result.archive), {
          headers: noStoreHeaders({
            "Content-Disposition": `attachment; filename="${result.fileName}"`,
            "Content-Length": String(result.archive.byteLength),
            "Content-Type": "application/zip",
          }),
          status: 200,
        });
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}

const authorizeSemesterExport: AuthorizeSemesterExport = async (request, semesterId) => {
  const auth = await requireAuthenticatedUserWithRls(request);
  const management = await auth.userClient.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: auth.user.id });
  if (management.error) throw management.error;
  if (management.data !== true) throw new SemesterExportHttpError(403, "Semester administrator access is required.");
  const { signer } = readOutreachEmailConfiguration();
  return createSemesterExportStore(createSupabaseSemesterExportDataSource(auth.userClient as SupabaseClient<Database>), signer);
};

export function createDefaultSemesterExportHandlers() {
  return createSemesterExportHandlers({ authorize: authorizeSemesterExport });
}
