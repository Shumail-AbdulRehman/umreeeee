function positive(value, fallback = 1) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

export function estimateAttackLoad({ plugins = [], strategies = [], testsPerPlugin = 1, catalog = [] }) {
  const byId = new Map(catalog.map((strategy) => [strategy.id, strategy]))
  const selected = [...new Set(['basic', ...strategies.filter((id) => id !== 'basic')])]
  const perSeed = selected.reduce((totals, id) => {
    const strategy = byId.get(id) ?? {}
    const cases = positive(strategy.cases_per_seed)
    return {
      cases: totals.cases + cases,
      calls: totals.calls + cases * positive(strategy.target_calls_per_test),
    }
  }, { cases: 0, calls: 0 })
  const seeds = new Set(plugins).size * positive(testsPerPlugin, 0)
  return {
    generatedTests: seeds * perSeed.cases,
    targetCalls: seeds * perSeed.calls,
    selectedStrategies: selected,
  }
}
