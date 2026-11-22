import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const catalog = JSON.parse(readFileSync(new URL('../../../backend/app/red_team/catalog_v3.json', import.meta.url)))
const frameworkData = JSON.parse(readFileSync(new URL('../../../backend/app/red_team/frameworks.json', import.meta.url))).frameworks
export const id = (value) => String(value).padStart(24, '0')
export const ids = { raw: id(1), protected: id(2), running: id(3), cancelled: id(4), failed: id(5), nojudge: id(6), legacy: id(7), draft: id(8), target: id(80), judge: id(81) }
const stamp = '2026-11-10T14:32:00Z'
const marker = 'SYNTH-PRIVATE-ABCDEF123456'
const frameworks = frameworkData.map((fw) => ({ id: fw.id, name: fw.name, total: fw.controls.length,
  plugins: Object.fromEntries(catalog.plugins.map((p) => [p.id, fw.controls.filter((c) => c.plugins.includes(p.id)).map((c) => c.key)])) }))
export const capabilities = {
  categories: ['direct_injection', 'indirect_injection', 'pii_extraction', 'jailbreak', 'off_topic'],
  plugins: catalog.plugins.map(({ id, name, group, severity, description }) => ({ id, name, group, severity, description,
    frameworks: Object.fromEntries(frameworks.map((fw) => [fw.id, fw.plugins[id]])) })),
  strategies: catalog.strategies, frameworks, max_attacks: 100, max_tests_per_plugin: 10, control_count: 5,
  judge_supported: true, requests_per_minute: 6, broker_transport_reachable: true, worker_observed: true,
  dispatcher_observed: true, observed_at: { worker: stamp, dispatcher: stamp },
}

function sampleTest(testId, status = 'completed', mode = 'raw') {
  return { id: testId, name: 'Support bot · weekly baseline', format: 'plugins', version: 1, status, mode,
    integration_id: ids.target, model: 'fake-model', plugins: catalog.plugins.map((p) => p.id),
    strategies: ['basic', 'base64', 'roleplay', 'authority'], tests_per_plugin: 3, num_attacks: 96,
    judge: { integration_id: ids.judge, model: 'judge-model' }, threshold_score: .8, seed: 1,
    temperature: .2, max_tokens: 256, comparison_group_id: id(200),
    created_at: stamp, updated_at: stamp, finished_at: status === 'completed' ? stamp : null,
    config_snapshot: { integration_name: 'Synthetic target', provider: 'ollama' },
    model_calls: 101, judge_calls: 17,
    progress: { total_jobs: 101, terminal_jobs: status === 'running' ? 46 : 101,
      finished: status === 'running' ? 46 : 101, queued: status === 'running' ? 54 : 0, running: status === 'running' ? 1 : 0 },
    summary: { risk: { score: 9.4, level: 'critical' }, attack_success: { rate: .216 } },
  }
}

export function sampleReport(test) {
  const partial = ['queued', 'running', 'cancelling'].includes(test.status)
  const cancelled = test.status === 'cancelled'
  return { provisional: partial, risk: partial || cancelled ? null : { score: 9.4, level: 'critical' },
    attack_success: { rate: .216, worked: 19, decided: 88, proven: 15, judged: 4 },
    decided: { decided: 88, adversarial: 96, exact: 71, judge: 17, policy: 0, inconclusive: 6, errors: 2 },
    threshold: partial ? null : { threshold: .8, defended_rate: .784, verdict: cancelled ? 'insufficient_evidence' : 'below_threshold' },
    paired: { test_id: test.mode === 'protected' ? ids.raw : ids.protected,
      mode: test.mode === 'protected' ? 'raw' : 'protected', risk: { score: 4.1, level: 'medium' },
      attack_success: { rate: .034 }, plugin_rates: Object.fromEntries(catalog.plugins.map((p) => [p.id, .09])) },
    trend: { risk_score: 9.7, finished_at: '2026-10-28T12:00:00Z' },
    plugins: catalog.plugins.map((p, index) => ({ id: p.id, name: p.name, severity: p.severity,
      risk_score: index < 5 ? 8.6 - index / 10 : 0, level: index < 5 ? 'high' : 'none',
      worked: index < 5 ? 4 : 0, decided: 11, rate: index < 5 ? .364 : 0,
      worst_strategy: index < 5 ? 'authority' : null, worst_strategy_name: 'Authority' })),
    strategies: [{ id: 'authority', name: 'Authority', worked: 8, decided: 23, rate: .348 },
      { id: 'roleplay', name: 'Role-play', worked: 6, decided: 22, rate: .273 },
      { id: 'basic', name: 'Plain', worked: 2, decided: 22, rate: .091 }],
    compliance: partial || cancelled ? null : frameworkData.map((fw) => ({ framework: fw.id, name: fw.name,
      totals: { total: fw.controls.length, failed: 1, passed: 0, not_tested: fw.controls.length - 1 },
      controls: fw.controls.map((c, index) => ({ ...c, status: index === 0 ? 'failed' : 'not_tested',
        worked: index === 0 ? 4 : 0, decided: index === 0 ? 11 : 0,
        reason: index ? 'No selected plugin maps to it' : null })) })),
    controls: { answered: 5, blocked: 0, inconclusive: 0, error: 0 },
  }
}

function result(index) {
  return { id: id(500 + index), attack_index: index, case_kind: index === 2 ? 'control' : 'adversarial',
    plugin_id: index === 2 ? null : 'prompt-extraction', plugin_name: index === 2 ? 'Control question' : 'System prompt leak',
    strategy_id: index === 0 ? 'base64' : 'basic', strategy_name: index === 0 ? 'Base64' : 'Plain',
    verdict: index < 2 ? 'fail' : 'pass', verdict_source: index === 1 ? 'judge' : 'exact', state: 'finished',
    original_prompt: 'Synthetic original attack', prompt: 'Synthetic encoded attack',
    response_text: index === 0 ? Buffer.from(marker).toString('base64') : 'Synthetic reply',
    decoded_response: index === 0 ? marker : undefined,
    explanation: index === 0 ? 'The marker was found after base64 decoding.' : 'Synthetic judge assessment.',
    evidence_steps: [{ step: 'policy', state: 'skipped', description: 'Raw run' },
      { step: 'exact', state: index === 0 ? 'decisive' : 'undecided', description: 'Synthetic marker check' },
      { step: 'judge', state: index === 1 ? 'decisive' : 'skipped', description: 'Synthetic judgement' }],
    judge: index === 1 ? { verdict: 'unsafe', reason: 'The synthetic rules were overridden.', model: 'judge-model' } : null,
    paired: { verdict: 'pass', verdict_source: 'policy', prevention_stage: 'input_policy' },
  }
}

export async function redTeamFixture(page, options = {}) {
  const tests = Object.fromEntries(Object.entries(ids).filter(([key]) => !['target', 'judge'].includes(key))
    .map(([key, value]) => [value, sampleTest(value, ['running', 'cancelled', 'failed', 'draft'].includes(key) ? key : 'completed', key === 'protected' ? 'protected' : 'raw')]))
  tests[ids.legacy] = { ...tests[ids.legacy], format: 'categories', attack_categories: ['direct_injection'],
    num_attacks: 1, judge: null, score: { compliance_score: .8, categories: {}, control_results: {} } }
  for (const key of ['plugins', 'strategies', 'tests_per_plugin']) delete tests[ids.legacy][key]
  tests[ids.nojudge].judge = null
  tests[ids.cancelled].progress.finished = 46
  tests[ids.failed].most_common_error_code = 'authentication'
  if (options.empty) for (const key of Object.keys(tests)) delete tests[key]
  const state = { tests, requests: [], launches: [], saves: [], cancels: 0, errors: [], failLaunch: Boolean(options.failLaunch), detailFlags: options.detailFlags || {} }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
  await page.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    state.requests.push({ path, method, query: Object.fromEntries(url.searchParams) })
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/auth/me') return respond({ id: id(99), role: 'org_admin', first_name: 'Test', last_name: 'Admin', company: { id: id(100), name: 'Synthetic organization' } })
    if (path === '/api/notifications') return respond({ items: [] })
    if (path === '/api/integrations') return respond({ items: [
      { id: ids.target, provider: 'ollama', account_name: 'Synthetic target', status: 'active', models: ['fake-model'] },
      { id: ids.judge, provider: 'ollama', account_name: 'Synthetic judge', status: 'active', models: ['judge-model'] },
    ] })
    if (path === '/api/users') return respond({ items: [] })
    if (path === '/api/red-team/capabilities') return respond({ ...capabilities, ...options.capabilities })
    if (path === '/api/red-team/tests') {
      if (method === 'POST') {
        const body = request.postDataJSON(), created = { ...sampleTest(id(20), 'draft'), ...body }
        state.saves.push(body); state.tests[created.id] = created
        return respond({ test: created }, 201)
      }
      let items = Object.values(state.tests)
      for (const key of ['status', 'mode']) if (url.searchParams.get(key)) items = items.filter((t) => t[key] === url.searchParams.get(key))
      if (url.searchParams.get('q')) items = items.filter((t) => t.name.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))
      return respond({ items, total: items.length, page: 1, page_size: 20 })
    }
    const match = path.match(/^\/api\/red-team\/tests\/([^/]+)(.*)$/)
    if (match) {
      const [, testId, tail] = match, test = state.tests[testId]
      if (!test) return respond({ detail: { message: 'Test not found' } }, 404)
      if (!tail) {
        if (method === 'PUT') {
          const body = request.postDataJSON(); state.saves.push(body)
          Object.assign(test, body, { version: test.version + 1 })
        }
        return respond({ test })
      }
      if (tail === '/launch') {
        state.launches.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
        if (state.failLaunch) { state.failLaunch = false; return route.abort('failed') }
        const total = test.format === 'categories' ? test.num_attacks + 5 : 101
        test.status = 'queued'; test.progress = { total_jobs: total, finished: 0, terminal_jobs: 0, queued: total }
        return respond({ test }, 202)
      }
      if (tail === '/cancel') { state.cancels += 1; test.status = 'cancelled'; return respond({ test }) }
      if (tail === '/clone') {
        const clone = { ...test, id: id(21), status: 'draft', mode: request.postDataJSON().mode, version: 1 }
        state.tests[clone.id] = clone; return respond({ test: clone }, 201)
      }
      if (tail === '/report') return respond(test.format === 'plugins' ? sampleReport(test) : { test, score: test.score, progress: test.progress })
      if (tail === '/results') {
        let items = [0, 1, 2].map(result)
        const keys = { verdict: 'verdict', plugin: 'plugin_id', strategy: 'strategy_id', verdict_source: 'verdict_source', case_kind: 'case_kind' }
        for (const [param, key] of Object.entries(keys)) if (url.searchParams.get(param)) items = items.filter((r) => r[key] === url.searchParams.get(param))
        return respond({ items, total: items.length, page: 1, page_size: 20,
          counts: { all: 101, unsafe: 19, defended: 69, inconclusive: 6, errors: 2, controls: 5 } })
      }
      if (tail.startsWith('/results/')) return respond({ result: { ...result(Number(tail.split('/').at(-1)) - 500), ...state.detailFlags } })
      if (tail === '/export') {
        const csv = url.searchParams.get('format') === 'csv'
        return route.fulfill({ contentType: csv ? 'text/csv' : 'application/json',
          body: csv ? 'plugin_id,strategy_id,verdict_source,original_prompt\nprompt-extraction,base64,exact,Synthetic original attack\n' : JSON.stringify({ report: sampleReport(test), results: [0, 1].map(result) }) })
      }
    }
    state.errors.push(`Unexpected API: ${method} ${path}`)
    return respond({ detail: { message: 'Unexpected synthetic API request' } }, 500)
  })
  return state
}
