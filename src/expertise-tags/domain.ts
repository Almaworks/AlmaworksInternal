export type ExpertiseTagSearchRow = {
  id: string
  name: string
  aliases: readonly string[]
}

export type TagSuggestionReason = 'exact' | 'prefix' | 'alias' | 'acronym' | 'fuzzy'

export type TagSuggestion = {
  id: string
  name: string
  score: number
  reason: TagSuggestionReason
}

export function normalizeTagName(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\-_]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tagSearchTerms(name: string): readonly string[] {
  const normalized = normalizeTagName(name)
  const words = normalized.split(' ').filter(Boolean)
  const acronym = words.map((word) => word[0]).join('')

  return [...new Set([normalized, acronym].filter(Boolean))]
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}

function scoreSuggestion(query: string, tag: ExpertiseTagSearchRow): TagSuggestion | null {
  const normalizedName = normalizeTagName(tag.name)
  const aliases = tag.aliases.map(normalizeTagName)

  if (normalizedName === query) return { id: tag.id, name: tag.name, score: 1000, reason: 'exact' }
  if (normalizedName.startsWith(query)) return { id: tag.id, name: tag.name, score: 950, reason: 'prefix' }
  if (aliases.includes(query)) return { id: tag.id, name: tag.name, score: 925, reason: 'alias' }
  if (tagSearchTerms(tag.name).includes(query)) return { id: tag.id, name: tag.name, score: 900, reason: 'acronym' }

  const fuzzyTerms = normalizedName.split(' ')
  const isCloseMatch = fuzzyTerms.some((term) => {
    const threshold = Math.max(1, Math.floor(Math.max(query.length, term.length) / 4))
    return editDistance(query, term) <= threshold
  })
  if (isCloseMatch) {
    return { id: tag.id, name: tag.name, score: 500, reason: 'fuzzy' }
  }

  return null
}

export function rankTagSuggestions(
  rawQuery: string,
  tags: readonly ExpertiseTagSearchRow[],
): readonly TagSuggestion[] {
  const query = normalizeTagName(rawQuery)
  if (!query) return []

  return tags
    .map((tag) => scoreSuggestion(query, tag))
    .filter((suggestion): suggestion is TagSuggestion => suggestion !== null)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
}
