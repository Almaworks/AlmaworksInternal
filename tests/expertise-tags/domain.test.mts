import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeTagName, rankTagSuggestions } from '../../src/expertise-tags/domain.ts'

test('normalizes separator and whitespace variants', () => {
  assert.equal(normalizeTagName('  Go-to-market '), 'go to market')
  assert.equal(normalizeTagName('GO   TO market'), 'go to market')
})

test('ranks a generated acronym above a fuzzy result', () => {
  const results = rankTagSuggestions('gtm', [
    { id: 'go', name: 'Go-to-market', aliases: [] },
    { id: 'growth', name: 'Growth strategy', aliases: [] },
  ])

  assert.deepEqual(results[0], { id: 'go', name: 'Go-to-market', score: 900, reason: 'acronym' })
})

test('labels close typos as advisory fuzzy suggestions', () => {
  assert.equal(
    rankTagSuggestions('fundraizing', [{ id: 'fund', name: 'Fundraising strategy', aliases: [] }])[0]?.reason,
    'fuzzy',
  )
})
