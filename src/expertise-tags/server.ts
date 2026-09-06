import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { normalizeTagName, rankTagSuggestions, tagSearchTerms, type TagSuggestion } from "./domain.ts";

export class ExpertiseTagRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpertiseTagRepositoryError";
  }
}

export type ExpertiseTag = { id: string; name: string };

export async function searchExpertiseTags(
  client: SupabaseClient<Database>,
  query: string,
): Promise<{ suggestions: readonly TagSuggestion[]; create: { name: string } | null }> {
  const [tagsResult, aliasesResult] = await Promise.all([
    client.from("expertise_tags").select("id, name").order("name").limit(250),
    client.from("expertise_tag_aliases").select("expertise_tag_id, normalized_alias"),
  ]);
  if (tagsResult.error !== null) throw new ExpertiseTagRepositoryError(tagsResult.error.message);
  if (aliasesResult.error !== null) throw new ExpertiseTagRepositoryError(aliasesResult.error.message);

  const aliasesByTagId = new Map<string, string[]>();
  for (const alias of aliasesResult.data ?? []) {
    const aliases = aliasesByTagId.get(alias.expertise_tag_id) ?? [];
    aliases.push(alias.normalized_alias);
    aliasesByTagId.set(alias.expertise_tag_id, aliases);
  }

  const tags = (tagsResult.data ?? []).map((tag) => ({ id: tag.id, name: tag.name, aliases: aliasesByTagId.get(tag.id) ?? [] }));
  const normalizedQuery = normalizeTagName(query);
  const suggestions = normalizedQuery.length === 0
    ? tags.slice(0, 12).map((tag) => ({ id: tag.id, name: tag.name, score: 0, reason: "prefix" as const }))
    : rankTagSuggestions(normalizedQuery, tags).slice(0, 12);
  const exactMatchExists = tags.some((tag) => normalizeTagName(tag.name) === normalizedQuery || tag.aliases.includes(normalizedQuery));

  return {
    suggestions,
    create: normalizedQuery.length > 0 && !exactMatchExists ? { name: query.trim() } : null,
  };
}

export async function createOrFindExpertiseTag(
  client: SupabaseClient<Database>,
  profileId: string,
  rawName: string,
): Promise<ExpertiseTag> {
  const name = rawName.trim();
  const normalizedName = normalizeTagName(name);
  if (normalizedName.length === 0) throw new ExpertiseTagRepositoryError("An expertise tag name is required.");

  const existing = await client
    .from("expertise_tags")
    .select("id, name")
    .eq("normalized_name", normalizedName)
    .maybeSingle();
  if (existing.error !== null) throw new ExpertiseTagRepositoryError(existing.error.message);
  if (existing.data !== null) return existing.data;

  const created = await client
    .from("expertise_tags")
    .insert({ name, normalized_name: normalizedName, created_by_profile_id: profileId })
    .select("id, name")
    .maybeSingle();
  if (created.error === null && created.data !== null) {
    const acronym = tagSearchTerms(name)[1];
    if (acronym !== undefined && acronym !== normalizedName) {
      const aliasResult = await client
        .from("expertise_tag_aliases")
        .insert({ expertise_tag_id: created.data.id, normalized_alias: acronym });
      if (aliasResult.error !== null && aliasResult.error.code !== "23505") {
        throw new ExpertiseTagRepositoryError(aliasResult.error.message);
      }
    }
    return created.data;
  }
  if (created.error?.code !== "23505") {
    throw new ExpertiseTagRepositoryError(created.error?.message ?? "Unable to create expertise tag.");
  }

  const winner = await client
    .from("expertise_tags")
    .select("id, name")
    .eq("normalized_name", normalizedName)
    .single();
  if (winner.error !== null) throw new ExpertiseTagRepositoryError(winner.error.message);
  return winner.data;
}
