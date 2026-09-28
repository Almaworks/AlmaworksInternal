import { createDefaultSemesterExportHandlers } from "@/src/semester-export/server";

export const dynamic = "force-dynamic";

const handlers = createDefaultSemesterExportHandlers();

export const GET = handlers.GET;
