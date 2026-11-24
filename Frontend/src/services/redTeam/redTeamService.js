import { apiRequest, getAuthToken } from '../api/client'
import { beginTrackedRequest } from '../api/requestActivity'

/** @typedef {'raw' | 'protected'} RedTeamMode */
/** @typedef {'draft' | 'queued' | 'generating' | 'running' | 'cancelling' | 'completed' | 'partially_failed' | 'failed' | 'cancelled'} RedTeamStatus */
/** @typedef {'claimed' | 'generating' | 'evaluating' | 'importing' | 'finished'} RedTeamPhase */
/** @typedef {'allowed' | 'blocked_input' | 'blocked_output' | 'error'} RedTeamDecision */
/** @typedef {'pass' | 'fail' | 'error' | 'pending'} RedTeamVerdict */
/** @typedef {'policy' | 'grader' | 'none'} RedTeamVerdictSource */
/** @typedef {'critical' | 'high' | 'medium' | 'low'} RedTeamSeverity */
/** @typedef {{integration_id: string, model: string}} RedTeamGrader */
/** @typedef {{planned: number, executed: number, graded: number}} RedTeamCounts */
/** @typedef {RedTeamCounts & {phase: RedTeamPhase | null}} RedTeamProgress */

/**
 * @typedef {object} RedTeamTestConfig
 * @property {string} name
 * @property {string} purpose
 * @property {string} integration_id
 * @property {string} model
 * @property {RedTeamMode} mode
 * @property {string | null} [subject_user_id]
 * @property {string[]} plugins Catalog IDs.
 * @property {string[]} strategies Catalog IDs. Basic is implicit.
 * @property {number} tests_per_plugin
 * @property {RedTeamGrader} grader
 * @property {number} [threshold_score]
 */

/**
 * @typedef {object} RedTeamConfigPreview
 * @property {string} yaml Redacted configuration for display.
 * @property {number} estimated_target_calls
 * @property {number} generated_tests_estimate
 */

/**
 * @typedef {RedTeamTestConfig & {
 *   id: string, engine: 'promptfoo', promptfoo_version: string, suite_id: string | null,
 *   status: RedTeamStatus, counts: RedTeamCounts, progress: RedTeamProgress,
 *   version: number, execution_revision: number, comparison_group_id: string,
 *   failure_reason?: string | null, config_snapshot?: Record<string, unknown> | null,
 *   created_at: string, updated_at: string, finished_at?: string | null
 * }} RedTeamTest
 */

/**
 * @typedef {object} PromptfooRuntime
 * @property {string | null} version Detected version for display.
 * @property {boolean} available Server-reported runtime availability.
 * @property {boolean} cloud_key_configured Server-reported key presence.
 */

/**
 * @typedef {object} RedTeamCapabilities
 * @property {PromptfooRuntime} promptfoo
 * @property {Array<{id: string, name: string, group: string, severity: RedTeamSeverity, description: string}>} plugins
 * @property {Array<{id: string, name: string} & Record<string, unknown>>} strategies
 * @property {Array<{id: string, name: string} & Record<string, unknown>>} frameworks
 * @property {boolean} broker_transport_reachable
 * @property {boolean} worker_observed
 * @property {boolean} dispatcher_observed
 * @property {Record<string, string>} [observed_at]
 */

/**
 * @typedef {object} RedTeamAttack
 * @property {string} id
 * @property {string} test_id
 * @property {number} test_idx
 * @property {number} repeat_index
 * @property {string} plugin_id
 * @property {string} strategy_id
 * @property {RedTeamSeverity} severity
 * @property {string | null} [goal]
 * @property {RedTeamDecision} decision
 * @property {RedTeamVerdict} verdict
 * @property {RedTeamVerdictSource} verdict_source
 * @property {string | null} [grader_reason]
 * @property {string | null} [prevention_stage]
 * @property {number | null} [latency_ms]
 * @property {number | null} [estimated_cost_usd]
 * @property {Array<Record<string, unknown>>} [policy_evidence]
 */

/**
 * @typedef {object} RedTeamReport
 * @property {{name: 'promptfoo', version: string, suite_id: string | null, generated_tests: number | null}} engine
 * @property {{score: number, level: RedTeamSeverity | 'none'} | null} risk
 * @property {{rate: number | null, worked: number, decided: number}} attack_success
 * @property {Record<string, number>} decided
 * @property {Record<string, unknown> | null} threshold
 * @property {Array<Record<string, unknown>>} plugins
 * @property {Array<Record<string, unknown>>} strategies
 * @property {Array<Record<string, unknown>> | null} compliance
 * @property {({test_id: string} & Record<string, unknown>) | null} paired
 * @property {Record<string, unknown> | null} trend
 * @property {boolean} provisional
 */

/**
 * @template Item
 * @typedef {{items: Item[], page: number, page_size: number, total: number}} RedTeamPage
 */

const root = '/red-team'
const testsPath = `${root}/tests`
const testPath = (id) => `${testsPath}/${encodeURIComponent(id)}`
// Mirrors the normalisation in services/api/client.js (which does not export it).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/+$/, '')
const TEST_FILTERS = ['page', 'page_size', 'q', 'status', 'mode', 'integration_id', 'from', 'to']
const RESULT_FILTERS = ['plugin', 'strategy', 'verdict', 'verdict_source', 'category', 'case_kind', 'state', 'page', 'page_size']

// Accepts a legacy query string or an object. Only route filters reach the wire.
export function buildQuery(input = '', allowedKeys = [...TEST_FILTERS, ...RESULT_FILTERS]) {
  const entries = typeof input === 'string' ? new URLSearchParams(input) : Object.entries(input || {})
  const query = new URLSearchParams()
  for (const [key, value] of entries) {
    if (!allowedKeys.includes(key) || value == null || value === '') continue
    query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const buildResultsQuery = (filters = {}) => buildQuery(filters, RESULT_FILTERS)

/** @returns {Promise<RedTeamCapabilities>} */
export const redTeamCapabilities = () => apiRequest(`${root}/capabilities`)

/** @returns {Promise<RedTeamPage<RedTeamTest>>} */
export const listRedTeamTests = (params = '') => apiRequest(`${testsPath}${buildQuery(params, TEST_FILTERS)}`)

/** @param {RedTeamTestConfig} body @returns {Promise<{test: RedTeamTest}>} */
export const createRedTeamTest = (body) => apiRequest(testsPath, { method: 'POST', body: JSON.stringify(body) })

/** @returns {Promise<{test: RedTeamTest}>} */
export const getRedTeamTest = (id) => apiRequest(testPath(id))

/** @param {RedTeamTestConfig} values @returns {Promise<RedTeamConfigPreview>} */
export const previewRedTeamConfig = (values, testId) => apiRequest(`${root}/config-preview${testId ? '?' + new URLSearchParams({ test_id: testId }) : ''}`, {
  method: 'POST', body: JSON.stringify(values),
})

/** @param {string} id @returns {Promise<RedTeamConfigPreview>} */
export const getRedTeamTestConfigPreview = (id) => apiRequest(`${testPath(id)}/config-preview`)

/** @param {string} id @param {RedTeamTestConfig & {version: number}} body @returns {Promise<{test: RedTeamTest}>} */
export const updateRedTeamTest = (id, body) => apiRequest(testPath(id), { method: 'PUT', body: JSON.stringify(body) })

/**
 * @param {string} id
 * @param {number} version Draft version.
 * @param {string} key Caller-generated UUID. Reuse it when retrying this version.
 * @returns {Promise<{test: RedTeamTest}>}
 */
export const launchRedTeamTest = (id, version, key) => apiRequest(`${testPath(id)}/launch`, {
  method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ version }),
})

/** @returns {Promise<{test: RedTeamTest}>} */
export const cancelRedTeamTest = (id) => apiRequest(`${testPath(id)}/cancel`, { method: 'POST' })

/** @returns {Promise<{test: RedTeamTest}>} */
export const cloneRedTeamTest = (id, mode) => apiRequest(`${testPath(id)}/clone`, {
  method: 'POST', body: JSON.stringify({ mode }),
})

/** @returns {Promise<RedTeamPage<RedTeamAttack> & {counts: Record<string, number>}>} */
export const listRedTeamResults = (id, params = '') => apiRequest(`${testPath(id)}/results${buildResultsQuery(params)}`)

/** @returns {Promise<{result: RedTeamAttack & {prompt?: string | null, response_text?: string | null, content_expired?: boolean, paired?: Partial<RedTeamAttack> | null}}>} */
export const getRedTeamResult = (id, attackId) => apiRequest(`${testPath(id)}/results/${encodeURIComponent(attackId)}`)

/** @returns {Promise<RedTeamReport>} */
export const getRedTeamReport = (id) => apiRequest(`${testPath(id)}/report`)

/** @param {string} id @param {'json' | 'csv'} format */
export async function downloadRedTeamExport(id, format) {
  if (format !== 'json' && format !== 'csv') throw new Error('Use json or csv')
  const finish = beginTrackedRequest()
  try {
    const token = getAuthToken()
    const response = await fetch(`${API_BASE_URL}${testPath(id)}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      const detail = typeof body?.detail === 'string' ? body.detail : body?.detail?.message
      throw new Error(detail || body?.message || `Export failed (${response.status})`)
    }
    const blob = await response.blob()
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `red-team-${id}.${format}`
    try {
      link.click()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } finally { finish() }
}
