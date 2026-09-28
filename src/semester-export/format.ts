import JSZip from "jszip";
import type {
  JsonValue,
  SemesterExportArchive,
  SemesterExportDataset,
  SemesterExportInput,
  SemesterExportManifest,
  SemesterExportMetadata,
} from "./types.ts";

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]*$/u;

function requireText(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} is required.`);
}

function requireSafeIdentifier(value: string, field: string): void {
  requireText(value, field);
  if (!SAFE_IDENTIFIER.test(value) || value.includes("..")) {
    throw new Error(`${field} must be a safe identifier.`);
  }
}

function requireUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} must be unique.`);
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Export values must contain finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const objectValue = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key]!)}`).join(",")}}`;
}

function neutralizeFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) || /^[\t\r]/u.test(value) ? `'${value}` : value;
}

function csvCell(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  const rendered = typeof value === "string"
    ? neutralizeFormula(value)
    : typeof value === "number"
      ? stableJson(value)
      : typeof value === "boolean"
        ? String(value)
        : stableJson(value);
  return /[",\r\n]/u.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

export function formatCsv(columns: readonly string[], rows: readonly Readonly<Record<string, JsonValue>>[]): string {
  requireUnique(columns, "CSV columns");
  for (const column of columns) requireText(column, "CSV column");
  return `${columns.map((column) => csvCell(column)).join(",")}\r\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}${rows.length > 0 ? "\r\n" : ""}`;
}

function assertInput(input: SemesterExportInput): void {
  requireSafeIdentifier(input.metadata.semesterId, "Semester ID");
  requireText(input.metadata.semesterName, "Semester name");
  if (input.metadata.scope !== "semester" && input.metadata.scope !== "outreach") throw new Error("Export scope is not supported.");
  requireText(input.metadata.exportedAt, "Export timestamp");
  if (Number.isNaN(Date.parse(input.metadata.exportedAt))) throw new Error("Export timestamp must be a valid date.");
  requireUnique(input.datasets.map((dataset) => dataset.id), "Dataset IDs");
  for (const dataset of input.datasets) {
    requireSafeIdentifier(dataset.id, "Dataset ID");
    requireUnique(dataset.columns, "CSV columns");
    for (const column of dataset.columns) requireText(column, "CSV column");
  }
}

export function createSemesterExportManifest(input: SemesterExportInput): SemesterExportManifest {
  assertInput(input);
  return {
    formatVersion: 1,
    scope: input.metadata.scope,
    semester: { id: input.metadata.semesterId, name: input.metadata.semesterName },
    exportedAt: input.metadata.exportedAt,
    datasets: input.datasets.map((dataset) => ({
      id: dataset.id,
      file: `tables/${dataset.id}.csv`,
      jsonFile: `tables/${dataset.id}.json`,
      columns: [...dataset.columns],
      rowCount: dataset.rows.length,
    })),
    exclusions: [...input.metadata.exclusions],
    unresolvedReferences: { profiles: [...input.metadata.unresolvedProfileIds] },
  };
}

function projectRows(dataset: SemesterExportDataset): Array<Record<string, JsonValue>> {
  return dataset.rows.map((row) => Object.fromEntries(
    dataset.columns
      .filter((column) => Object.hasOwn(row, column))
      .map((column) => [column, row[column]!]),
  ));
}

function markdownRecordValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/[`*_{}\[\]<>()#+\-.!|]/gu, "\\$&");
}

function readme(metadata: SemesterExportMetadata, manifest: SemesterExportManifest): string {
  const contents = manifest.datasets.length === 0
    ? "- No datasets were selected."
    : manifest.datasets.map((dataset) => `- \`${dataset.file}\` and \`${dataset.jsonFile}\` — ${dataset.rowCount} row${dataset.rowCount === 1 ? "" : "s"}`).join("\n");
  const exclusions = metadata.exclusions.length === 0
    ? "- No additional exclusions were recorded."
    : metadata.exclusions.map((exclusion) => `- ${markdownRecordValue(exclusion)}`).join("\n");
  return `# Almaworks semester export\n\nSemester: **${markdownRecordValue(metadata.semesterName)}** (${metadata.semesterId})\n\nScope: **${metadata.scope}**\nGenerated: ${metadata.exportedAt}\n\n## Contents\n${contents}\n\n## Import into Notion\nImport the CSV files as databases and README.md as a page. Source IDs are preserved for reference; Notion does not automatically rebuild relationships from CSV values. CSV uses empty cells for null values; the matching JSON files preserve exact values.\n\n## Limitations and exclusions\n${exclusions}\n`;
}

export async function createSemesterExportArchive(input: SemesterExportInput): Promise<SemesterExportArchive> {
  assertInput(input);
  const zip = new JSZip();
  const manifest = createSemesterExportManifest(input);

  for (const dataset of input.datasets) {
    zip.file(`tables/${dataset.id}.csv`, formatCsv(dataset.columns, dataset.rows));
    zip.file(`tables/${dataset.id}.json`, `${stableJson(projectRows(dataset))}\n`);
  }
  zip.file("README.md", readme(input.metadata, manifest));
  zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    archive: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    fileName: `semester-export-${input.metadata.semesterId}-${input.metadata.scope}.zip`,
  };
}
