/**
 * Live summary for the Red Team test editor. Pure: no React, no fetch, no clock.
 *
 * Attacks = plugins x (strategies + basic) x tests per plugin. `basic` is always
 * implied, so the strategies passed in must not include it (it is ignored if present).
 */

const DEFAULTS = {
  max_attacks: 100,
  max_tests_per_plugin: 10,
  requests_per_minute: 6,
  control_count: 5,
}

function positiveInt(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value !== 'basic'))]
}

function frameworkList(capabilities, plugins) {
  if (Array.isArray(capabilities.frameworks) && capabilities.frameworks.length) {
    return capabilities.frameworks.map(framework => ({
      id: framework.id,
      name: framework.name ?? framework.id,
      total: Number.isFinite(Number(framework.total)) ? Number(framework.total) : 0,
    }))
  }
  // Tolerant fallback: derive framework ids from the plugin mappings, with unknown totals.
  const ids = new Set()
  for (const plugin of plugins) {
    Object.keys(plugin.frameworks ?? {}).forEach(id => ids.add(id))
  }
  return [...ids].map(id => ({ id, name: id, total: 0 }))
}

/**
 * @param {object} input
 * @param {string[]} input.plugins selected plugin ids
 * @param {string[]} input.strategies selected strategy ids (without basic)
 * @param {number} input.testsPerPlugin attacks per plugin and strategy
 * @param {boolean} input.judge whether the LLM judge is enabled
 * @param {object} input.capabilities the capabilities response (may be partial)
 * @returns {{
 *   attacks: number, controls: number, modelCalls: number, judgeCalls: number,
 *   minutes: number, coverage: {id: string, name: string, covered: number, total: number}[],
 *   blocking: string | null, maxAttacks: number, maxTestsPerPlugin: number
 * }}
 */
export function computeEditorSummary({ plugins = [], strategies = [], testsPerPlugin, judge = false, capabilities = {} } = {}) {
  const caps = capabilities ?? {}
  const maxAttacks = positiveInt(caps.max_attacks, DEFAULTS.max_attacks)
  const maxTestsPerPlugin = positiveInt(caps.max_tests_per_plugin, DEFAULTS.max_tests_per_plugin)
  const requestsPerMinute = positiveInt(caps.requests_per_minute, DEFAULTS.requests_per_minute)
  const controls = positiveInt(caps.control_count, DEFAULTS.control_count)

  const catalog = Array.isArray(caps.plugins) ? caps.plugins : []
  const selectedPlugins = uniqueIds(plugins)
  const selectedStrategies = uniqueIds(strategies)
  const byId = new Map(catalog.map(plugin => [plugin.id, plugin]))

  const requestedTests = Number(testsPerPlugin)
  const testsInRange = Number.isInteger(requestedTests) && requestedTests >= 1 && requestedTests <= maxTestsPerPlugin
  const tests = Math.min(maxTestsPerPlugin, Math.max(1, Math.round(Number(testsPerPlugin)) || 1))

  const attacks = selectedPlugins.length * (selectedStrategies.length + 1) * tests
  const modelCalls = attacks + controls
  const judgeCalls = judge ? Math.ceil(attacks / 4) : 0
  const minutes = Math.ceil((attacks + controls + judgeCalls) / requestsPerMinute)

  const coverage = frameworkList(caps, catalog).map(framework => {
    const covered = new Set()
    for (const id of selectedPlugins) {
      const mapped = byId.get(id)?.frameworks?.[framework.id]
      for (const control of Array.isArray(mapped) ? mapped : []) covered.add(control)
    }
    return { id: framework.id, name: framework.name, covered: covered.size, total: framework.total }
  })

  let blocking = null
  if (selectedPlugins.length === 0) {
    blocking = 'Choose at least one plugin to attack.'
  } else if (attacks > maxAttacks) {
    blocking = `This is ${attacks} attacks. Reduce to ${maxAttacks} or fewer by lowering attacks per plugin or choosing fewer plugins or strategies.`
  } else if (!testsInRange) {
    blocking = `Attacks per plugin must be from 1 to ${maxTestsPerPlugin}.`
  }

  return { attacks, controls, modelCalls, judgeCalls, minutes, coverage, blocking, maxAttacks, maxTestsPerPlugin }
}
