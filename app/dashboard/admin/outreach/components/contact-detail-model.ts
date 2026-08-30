import type { EditableOutreachContact } from "./edit-contact-form";
import type { ActivityItem } from "./types";

export interface ContactDetail { contact: EditableOutreachContact; activities: readonly ActivityItem[]; }

function isEditableContact(value: unknown): value is EditableOutreachContact {
  if (typeof value !== "object" || value === null) return false;
  const contact = value as Record<string, unknown>;
  return typeof contact.id === "string" && typeof contact.fullName === "string"
    && (typeof contact.email === "string" || contact.email === null)
    && (typeof contact.linkedinUrl === "string" || contact.linkedinUrl === null)
    && (typeof contact.phone === "string" || contact.phone === null)
    && (typeof contact.biography === "string" || contact.biography === null)
    && Array.isArray(contact.expertiseTags) && contact.expertiseTags.every((tag) => typeof tag === "string")
    && (typeof contact.notes === "string" || contact.notes === null) && typeof contact.updatedAt === "string";
}

function isActivity(value: unknown): value is ActivityItem {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Record<string, unknown>;
  return typeof activity.id === "string" && typeof activity.activityKind === "string"
    && (typeof activity.channel === "string" || activity.channel === null) && typeof activity.occurredAt === "string"
    && (typeof activity.summary === "string" || activity.summary === null)
    && (typeof activity.actorProfileId === "string" || activity.actorProfileId === null);
}

/** Validates the browser-facing shape of the existing contact detail API. */
export function contactDetailFromResponse(payload: unknown): ContactDetail | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return null;
  const detail = data as Record<string, unknown>;
  if (!isEditableContact(detail.contact) || !Array.isArray(detail.activities) || !detail.activities.every(isActivity)) return null;
  return { contact: detail.contact, activities: detail.activities };
}
