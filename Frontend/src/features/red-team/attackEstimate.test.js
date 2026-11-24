import { describe, expect, it } from 'vitest'
import { estimateAttackLoad } from './attackEstimate.js'

const catalog = [
  { id: 'basic', cases_per_seed: 1, target_calls_per_test: 1 },
  { id: 'base64', cases_per_seed: 1, target_calls_per_test: 1 },
  { id: 'goat', cases_per_seed: 1, target_calls_per_test: 4 },
]

describe('estimateAttackLoad', () => {
  it('counts implicit basic once and applies target-call multipliers', () => {
    expect(estimateAttackLoad({
      plugins: ['a', 'b'], strategies: ['basic', 'base64', 'goat'], testsPerPlugin: 3, catalog,
    })).toEqual({ generatedTests: 18, targetCalls: 36, selectedStrategies: ['basic', 'base64', 'goat'] })
  })

  it('deduplicates plugin and strategy ids', () => {
    expect(estimateAttackLoad({
      plugins: ['a', 'a'], strategies: ['base64', 'base64'], testsPerPlugin: 2, catalog,
    }).targetCalls).toBe(4)
  })
})
