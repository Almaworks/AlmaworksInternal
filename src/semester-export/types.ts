export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type SemesterExportScope = "semester" | "outreach";
export type SemesterExportFormat = "manifest" | "zip";

export interface SemesterExportDataset {
  id: string;
  columns: readonly string[];
  rows: readonly Readonly<Record<string, JsonValue>>[];
}

export interface SemesterExportMetadata {
  scope: SemesterExportScope;
  semesterId: string;
  semesterName: string;
  exportedAt: string;
  exclusions: readonly string[];
  unresolvedProfileIds: readonly string[];
}

export interface SemesterExportInput {
  metadata: SemesterExportMetadata;
  datasets: readonly SemesterExportDataset[];
}

export interface SemesterExportArchive {
  archive: Buffer;
  fileName: string;
}

export interface SemesterExportManifestDataset {
  id: string;
  file: string;
  jsonFile: string;
  columns: string[];
  rowCount: number;
}

export interface SemesterExportManifest {
  formatVersion: 1;
  scope: SemesterExportScope;
  semester: { id: string; name: string };
  exportedAt: string;
  datasets: SemesterExportManifestDataset[];
  exclusions: string[];
  unresolvedReferences: { profiles: string[] };
}

export interface SemesterExportManifestResponse {
  data: SemesterExportManifest;
}

export interface SemesterExportErrorResponse {
  error: { message: string };
}

export interface SemesterExportLoadedData {
  datasets: readonly SemesterExportDataset[];
  semesterId: string;
  semesterName: string;
}
