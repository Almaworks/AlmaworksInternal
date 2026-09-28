export const STARTUP_STAGES = [
  { value: "idea", label: "Idea" },
  { value: "mvp", label: "MVP" },
  { value: "pilot", label: "Pilot" },
  { value: "growth", label: "Growth" },
  { value: "fundraising", label: "Fundraising" },
] as const;

export type StartupStage = string;

export function normalizeStartupStage(value: string): string {
  return value.trim().replace(/ +/gu, " ").toLowerCase();
}

export function isStartupStage(value: unknown): value is StartupStage {
  return typeof value === "string" && /^[\p{L}\p{N}][\p{L}\p{N} &'’()/_-]{0,39}$/u.test(value.trim());
}

export function startupStageOrDefault(value: unknown): StartupStage {
  return isStartupStage(value) ? normalizeStartupStage(value) : "mvp";
}
