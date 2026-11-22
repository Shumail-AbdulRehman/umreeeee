import { describe, expect, test } from 'vitest'
import { computeEditorSummary } from './editorSummary.js'

const FRAMEWORKS = [
  { id: 'owasp', name: 'OWASP LLM Top 10', total: 10 },
  { id: 'atlas', name: 'MITRE ATLAS tactics', total: 14 },
  { id: 'nist', name: 'NIST AI RMF · Measure', total: 21 },
  { id: 'eu', name: 'EU AI Act', total: 14 },
]

const PLUGIN_IDS = ['prompt-extraction', 'pii', 'direct-injection', 'indirect-injection', 'tool-injection', 'hijacking', 'harmful', 'excessive-agency']

const PLUGINS = [
  { id: 'prompt-extraction', frameworks: { owasp: ['LLM07', 'LLM01'], atlas: ['recon'], nist: [], eu: [] } },
  { id: 'pii', frameworks: { owasp: ['LLM02', 'LLM07'], atlas: ['exfil'], nist: ['2.1'], eu: ['bio'] } },
  { id: 'direct-injection', frameworks: { owasp: ['LLM01'], atlas: ['impact'], nist: [], eu: [] } },
  { id: 'indirect-injection', frameworks: { owasp: ['LLM01'], atlas: ['exfil'], nist: [], eu: [] } },
  { id: 'tool-injection', frameworks: { owasp: ['LLM05', 'LLM06'], atlas: ['initial'], nist: ['2.7'], eu: ['infra'] } },
  { id: 'hijacking', frameworks: { owasp: [], atlas: ['impact'], nist: [], eu: ['exploit'] } },
  { id: 'harmful', frameworks: { owasp: ['LLM01'], atlas: ['resource'], nist: ['2.6'], eu: [] } },
  { id: 'excessive-agency', frameworks: { owasp: ['LLM06'], atlas: ['impact'], nist: ['2.3', '2.4'], eu: ['infra'] } },
]

const CAPABILITIES = {
  plugins: PLUGINS,
  frameworks: FRAMEWORKS,
  max_attacks: 100,
  max_tests_per_plugin: 10,
  requests_per_minute: 6,
  control_count: 5,
}

const coverageOf = summary => Object.fromEntries(summary.coverage.map(row => [row.id, row.covered]))

describe('computeEditorSummary', () => {
  test('8 plugins, 3 strategies, 3 tests with judge gives 96 attacks, 101 calls, an estimate of 24 judge calls and 21 minutes', () => {
    const summary = computeEditorSummary({
      plugins: PLUGIN_IDS,
      strategies: ['base64', 'rot13', 'hex'],
      testsPerPlugin: 3,
      judge: true,
      capabilities: CAPABILITIES,
    })
    expect(summary.attacks).toBe(96)
    expect(summary.controls).toBe(5)
    expect(summary.modelCalls).toBe(101)
    expect(summary.judgeCalls).toBe(24)
    expect(summary.minutes).toBe(21)
    expect(summary.blocking).toBeNull()
  })

  test('without a judge the judge estimate is 0 and minutes drop accordingly', () => {
    const summary = computeEditorSummary({
      plugins: PLUGIN_IDS,
      strategies: ['base64', 'rot13', 'hex'],
      testsPerPlugin: 3,
      judge: false,
      capabilities: CAPABILITIES,
    })
    expect(summary.judgeCalls).toBe(0)
    expect(summary.minutes).toBe(Math.ceil(101 / 6))
  })

  test('judge estimate rounds a quarter of attacks up', () => {
    const summary = computeEditorSummary({
      plugins: ['pii'],
      strategies: [],
      testsPerPlugin: 3,
      judge: true,
      capabilities: CAPABILITIES,
    })
    expect(summary.attacks).toBe(3)
    expect(summary.judgeCalls).toBe(1)
  })

  test('no plugins gives zero coverage and the choose-a-plugin block', () => {
    const summary = computeEditorSummary({
      plugins: [],
      strategies: ['base64'],
      testsPerPlugin: 2,
      judge: true,
      capabilities: CAPABILITIES,
    })
    expect(summary.attacks).toBe(0)
    expect(summary.judgeCalls).toBe(0)
    expect(summary.blocking).toBe('Choose at least one plugin to attack.')
    expect(summary.coverage.every(row => row.covered === 0)).toBe(true)
    expect(summary.coverage.map(row => row.total)).toEqual([10, 14, 21, 14])
  })

  test('8 plugins, 7 strategies, 10 tests gives 640 attacks and the over-maximum block naming 640', () => {
    const summary = computeEditorSummary({
      plugins: PLUGIN_IDS,
      strategies: ['base64', 'rot13', 'leetspeak', 'hex', 'roleplay', 'hypothetical', 'authority'],
      testsPerPlugin: 10,
      judge: false,
      capabilities: CAPABILITIES,
    })
    expect(summary.attacks).toBe(640)
    expect(summary.blocking).toContain('This is 640 attacks.')
    expect(summary.blocking).toContain('Reduce to 100 or fewer')
  })

  test('the maximum is read from capabilities, not hard-coded', () => {
    const summary = computeEditorSummary({
      plugins: ['pii'],
      strategies: [],
      testsPerPlugin: 3,
      capabilities: { ...CAPABILITIES, max_attacks: 2 },
    })
    expect(summary.blocking).toContain('This is 3 attacks.')
    expect(summary.blocking).toContain('Reduce to 2 or fewer')
  })

  test('tests per plugin outside 1 to the maximum is blocked', () => {
    const tooHigh = computeEditorSummary({ plugins: ['pii'], strategies: [], testsPerPlugin: 11, capabilities: CAPABILITIES })
    expect(tooHigh.blocking).toBe('Attacks per plugin must be from 1 to 10.')
    const zero = computeEditorSummary({ plugins: ['pii'], strategies: [], testsPerPlugin: 0, capabilities: CAPABILITIES })
    expect(zero.blocking).toBe('Attacks per plugin must be from 1 to 10.')
  })

  test('coverage counts distinct controls per framework, not plugin-control pairs', () => {
    // prompt-extraction and pii both map LLM07; the distinct set is LLM07, LLM01, LLM02.
    const summary = computeEditorSummary({
      plugins: ['prompt-extraction', 'pii'],
      strategies: [],
      testsPerPlugin: 1,
      capabilities: CAPABILITIES,
    })
    expect(coverageOf(summary).owasp).toBe(3)
    expect(coverageOf(summary).atlas).toBe(2)
    expect(coverageOf(summary).nist).toBe(1)
    expect(coverageOf(summary).eu).toBe(1)
    expect(summary.coverage.find(row => row.id === 'owasp').total).toBe(10)
  })

  test('falls back to documented defaults when capability fields are missing', () => {
    const summary = computeEditorSummary({
      plugins: PLUGIN_IDS,
      strategies: ['base64', 'rot13', 'hex'],
      testsPerPlugin: 3,
      judge: true,
      capabilities: { plugins: PLUGINS },
    })
    expect(summary.maxAttacks).toBe(100)
    expect(summary.maxTestsPerPlugin).toBe(10)
    expect(summary.attacks).toBe(96)
    expect(summary.minutes).toBe(21)
    expect(summary.blocking).toBeNull()
  })

  test('is deterministic for the same input', () => {
    const input = { plugins: ['hijacking', 'harmful'], strategies: ['hex'], testsPerPlugin: 2, judge: true, capabilities: CAPABILITIES }
    expect(computeEditorSummary(input)).toEqual(computeEditorSummary(input))
  })
})
