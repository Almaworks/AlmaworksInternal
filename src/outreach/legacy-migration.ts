import type { Json } from "../db/types.ts";
import type { OutreachChannel } from "./types.ts";

type LegacyRecord = Record<string, unknown>;

export interface LegacyOutreachMetadata {
  notes: string | null;
  sourceChannel: OutreachChannel | null;
  referredBy: string | null;
  expertiseTags: readonly string[];
  conversionDetails: Record<string, Json>;
  lastContactedAt: string | null;
  issues: readonly string[];
}

export interface LegacyActivity {
  kind: "email" | "note" | "stage_change";
  channel: OutreachChannel | null;
  occurredAt: string;
  actorProfileId: string | null;
  summary: string | null;
  details: Record<string, Json>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function sourceChannel(value: string | null): OutreachChannel | null {
  if (value === null) return null;
  const normalized = value.toLowerCase().replace(/[\s-]+/gu, "_");
  if (normalized === "warm_intro" || normalized === "warmintro") return "warm_intro";
  if (["email", "linkedin", "referral", "event", "other"].includes(normalized)) {
    return normalized as OutreachChannel;
  }
  return null;
}

function jsonRecord(value: unknown): Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

export function normalizeLegacyOutreachMetadata(row: LegacyRecord): LegacyOutreachMetadata {
  const originalSourceChannel = text(row.source_channel);
  const normalizedChannel = sourceChannel(originalSourceChannel);
  const legacyOutreachId = text(row.id) ?? "unknown";
  const conversionDetails: Record<string, Json> = { legacyOutreachId };
  const convertedMentorId = text(row.converted_mentor_id);
  if (convertedMentorId !== null) conversionDetails.legacyConvertedMentorId = convertedMentorId;
  if (originalSourceChannel !== null && normalizedChannel === null) {
    conversionDetails.legacySourceChannel = originalSourceChannel;
  }
  return {
    notes: text(row.notes),
    sourceChannel: normalizedChannel,
    referredBy: text(row.referred_by),
    expertiseTags: Array.isArray(row.expertise_tags)
      ? row.expertise_tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    conversionDetails,
    lastContactedAt: text(row.last_contacted_at),
    issues: originalSourceChannel !== null && normalizedChannel === null ? ["source_channel_invalid"] : [],
  };
}

export function normalizeLegacyActivity(row: LegacyRecord): LegacyActivity {
  const actionType = text(row.action_type) ?? "unknown";
  const detail = jsonRecord(row.detail);
  const legacy = { id: text(row.id) ?? "unknown", actionType, detail };
  const base = {
    occurredAt: text(row.created_at) ?? new Date(0).toISOString(),
    actorProfileId: text(row.admin_id),
  };
  if (actionType === "note_added") {
    return { ...base, kind: "note", channel: null, summary: text(detail.text), details: { legacy } };
  }
  if (actionType === "status_changed") {
    return { ...base, kind: "stage_change", channel: null, summary: "Legacy status changed", details: { legacy } };
  }
  return {
    ...base,
    kind: "note",
    channel: null,
    summary: `Legacy activity: ${actionType}`,
    details: { legacy },
  };
}
