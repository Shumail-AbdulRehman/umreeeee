import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync(new URL('../../../backend/app/red_team/promptfoo_catalog.json', import.meta.url)))
const frameworkCatalog = JSON.parse(readFileSync(new URL('../../../backend/app/red_team/scheduler_frameworks.json', import.meta.url))).frameworks
export const id = (value) => String(value).padStart(24, '0')
export const ids = {
  raw: id(1), protected: id(2), running: id(3), generating: id(4), cancelled: id(5),
  failed: id(6), draft: id(7), target: id(80), grader: id(81), subject: id(82),
}
const stamp = '2026-11-23T14:32:00Z'
const plugins = catalog.plugins.filter((plugin) => ['prompt-extraction', 'pii:direct', 'sql-injection'].includes(plugin.id))
const strategies = catalog.strategies.filter((strategy) => ['basic', 'base64', 'hex'].includes(strategy.id))
const frameworks = frameworkCatalog.map((framework) => ({
  id: framework.id, name: framework.name, description: framework.description,
  controls: framework.controls.map((control) => ({
    id: control.id, name: control.name, plugins: control.plugins.map((plugin) => plugin.id),
  })),
}))

export const capabilities = {
  promptfoo: { version: '0.126.0', available: true, cloud_key_configured: true },
  plugins, strategies, frameworks,
  limits: { max_target_calls: 200, max_tests_per_plugin: 10 },
  requests_per_minute: 6, broker_transport_reachable: true, worker_observed: true,
  dispatcher_observed: true, observed_at: { worker: stamp, dispatcher: stamp },
}

function sampleTest(testId, status = 'completed', mode = 'raw') {
  return {
    id: testId, name: 'Support bot · weekly baseline', purpose: 'Test whether the support bot protects private customer records.',
    engine: 'promptfoo', promptfoo_version: '0.126.0', version: 1, status, mode,
    integration_id: ids.target, model: 'fake-model', subject_user_id: mode === 'protected' ? ids.subject : null,
    plugins: plugins.map((plugin) => plugin.id), strategies: ['base64'], tests_per_plugin: 1,
    grader: { integration_id: ids.grader, model: 'judge-model' }, threshold_score: .8,
    comparison_group_id: id(200), suite_id: id(300), created_at: stamp, updated_at: stamp,
    finished_at: ['completed', 'partially_failed', 'failed', 'cancelled'].includes(status) ? stamp : null,
    config_snapshot: { integration_name: 'Synthetic target', provider: 'ollama', grader: { model: 'judge-model' } },
    counts: { planned: 6, executed: status === 'running' ? 3 : status === 'generating' ? 0 : 6,
      graded: status === 'running' ? 2 : status === 'generating' ? 0 : 6 },
    progress: { planned: 6, executed: status === 'running' ? 3 : status === 'generating' ? 0 : 6,
      graded: status === 'running' ? 2 : status === 'generating' ? 0 : 6,
      phase: status === 'generating' ? 'generating' : status === 'running' ? 'evaluating' : 'finished' },
  }
}

export function sampleReport(test) {
  const provisional = ['queued', 'generating', 'running', 'cancelling'].includes(test.status)
  const controls = (framework) => framework.controls.slice(0, 2).map((control, index) => ({
    id: control.id, name: control.name, status: index ? 'not_tested' : 'failed',
    worked: index ? 0 : 1, decided: index ? 0 : 2,
    reason: index ? 'No selected plugin maps to this control.' : null,
  }))
  return {
    provisional,
    engine: { name: 'promptfoo', version: '0.126.0', suite_id: test.suite_id,
      generated_tests: test.counts.planned, grader_model: 'judge-model' },
    risk: provisional || test.status === 'cancelled' ? null : { score: 8.2, level: 'high' },
    attack_success: { rate: .333, worked: 2, decided: 6, proven: 1, judged: 1 },
    decided: { decided: 6, adversarial: 6, policy: 1, grader: 5, defended: 4, unsafe: 2, errors: 0, pending: 0 },
    threshold: provisional ? null : { threshold: .8, defended_rate: .667, verdict: 'below_threshold' },
    paired: { test_id: test.mode === 'raw' ? ids.protected : ids.raw, suite_id: test.suite_id,
      raw_rate: .5, protected_rate: .167, delta_pp: -33.3 },
    trend: { risk_score: 9.0, finished_at: '2026-11-01T12:00:00Z' },
    plugins: plugins.map((plugin, index) => ({ id: plugin.id, name: plugin.name, severity: plugin.severity,
      risk_score: index ? 0 : 8.2, level: index ? 'none' : 'high', worked: index ? 0 : 2,
      decided: 2, rate: index ? 0 : 1, worst_strategy: index ? null : 'base64', worst_strategy_name: 'Base64' })),
    strategies: [{ id: 'base64', name: 'Base64', worked: 2, decided: 3, rate: .667 },
      { id: 'basic', name: 'Plain', worked: 0, decided: 3, rate: 0 }],
    compliance: provisional ? null : frameworks.map((framework) => ({ framework: framework.id, name: framework.name,
      totals: { total: 2, failed: 1, passed: 0, not_tested: 1 }, controls: controls(framework) })),
  }
}

function result(index, detail = false) {
  const policy = index === 0
  return {
    id: id(500 + index), test_id: ids.raw, test_idx: index, repeat_index: 0,
    plugin_id: plugins[index % plugins.length].id, plugin_name: plugins[index % plugins.length].name,
    strategy_id: policy ? 'base64' : 'basic', strategy_name: policy ? 'Base64' : 'Plain',
    severity: 'high', decision: policy ? 'blocked_input' : 'allowed',
    verdict: policy ? 'pass' : 'fail', verdict_source: policy ? 'policy' : 'grader',
    grader_reason: policy ? null : 'The synthetic response violated the test criterion.',
    policy_evidence: policy ? [{ field: 'prompt', outcome: 'match', rule_id: 'synthetic-rule', policy_name: 'Synthetic policy' }] : [],
    latency_ms: 12, total_tokens: 9, cost_usd: .001,
    ...(detail ? { prompt: `Synthetic attack ${index}`, response_text: `Synthetic reply ${index}`,
      paired: { verdict: 'pass', verdict_source: 'policy', decision: 'blocked_input', prevention_stage: 'input' } } : {}),
  }
}

export async function redTeamFixture(page, options = {}) {
  const tests = {
    [ids.raw]: sampleTest(ids.raw), [ids.protected]: sampleTest(ids.protected, 'completed', 'protected'),
    [ids.running]: sampleTest(ids.running, 'running'), [ids.generating]: sampleTest(ids.generating, 'generating'),
    [ids.cancelled]: sampleTest(ids.cancelled, 'cancelled'), [ids.failed]: { ...sampleTest(ids.failed, 'failed'), failure_reason: 'no_tests_generated' },
    [ids.draft]: sampleTest(ids.draft, 'draft'),
  }
  if (options.empty) Object.keys(tests).forEach((key) => delete tests[key])
  const state = { tests, requests: [], launches: [], saves: [], cancels: 0, errors: [], failPreview: false,
    failLaunch: Boolean(options.failLaunch) }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:5192') return route.continue()
    if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
      return route.fulfill({ contentType: 'text/css', body: '' })
    }
    state.errors.push(`Unexpected external request: ${url.origin}${url.pathname}`)
    return route.abort()
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    state.requests.push({ path, method, query: Object.fromEntries(url.searchParams) })
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (url.origin !== 'http://127.0.0.1:5192') {
      state.errors.push(`Unexpected external API: ${url.origin}${path}`)
      return route.abort()
    }
    const preview = (body, suiteId) => respond({
      yaml: `${suiteId ? '# Reuses 6 stored test cases\n' : ''}redteam:\n  purpose: ${body.purpose}\n  plugins:\n${body.plugins.map((plugin) => `    - ${plugin}`).join('\n')}\n  strategies:\n${body.strategies.map((strategy) => `    - ${strategy}`).join('\n')}`,
      estimated_target_calls: 6, generated_tests_estimate: 6,
    })
    if (path === '/api/auth/me') return respond({ id: id(99), role: 'org_admin', first_name: 'Test', last_name: 'Admin', company: { id: id(100), name: 'Synthetic organization' } })
    if (path === '/api/notifications') return respond({ items: [] })
    if (path === '/api/integrations') return respond({ items: [
      { id: ids.target, provider: 'ollama', account_name: 'Synthetic target', status: 'active', models: ['fake-model'] },
      { id: ids.grader, provider: 'ollama', account_name: 'Synthetic grader', status: 'active', models: ['judge-model'] },
    ] })
    if (path === '/api/users') return respond({ items: [{ id: ids.subject, first_name: 'Policy', last_name: 'Subject', is_active: true, is_email_verified: true }] })
    if (path === '/api/red-team/capabilities') return respond({ ...capabilities, ...options.capabilities })
    if (path === '/api/red-team/config-preview') {
      if (state.failPreview) return respond({ detail: { message: 'Preview failed' } }, 503)
      const body = request.postDataJSON()
      return preview(body, state.tests[url.searchParams.get('test_id')]?.suite_id)
    }
    if (path === '/api/red-team/tests') {
      if (method === 'POST') {
        const body = request.postDataJSON()
        const allowed = ['name', 'purpose', 'integration_id', 'model', 'mode', 'subject_user_id',
          'plugins', 'strategies', 'tests_per_plugin', 'grader', 'threshold_score']
        if (Object.keys(body).some((field) => !allowed.includes(field))) {
          state.errors.push('Unexpected field in draft create payload')
          return respond({ detail: { message: 'Unexpected draft field' } }, 422)
        }
        const created = { ...sampleTest(id(20), 'draft'), ...body, suite_id: null, id: id(20) }
        state.saves.push(body); state.tests[created.id] = created
        return respond({ test: created }, 201)
      }
      let items = Object.values(state.tests)
      for (const key of ['status', 'mode']) if (url.searchParams.get(key)) items = items.filter((test) => test[key] === url.searchParams.get(key))
      if (url.searchParams.get('q')) items = items.filter((test) => test.name.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))
      return respond({ items, total: items.length, page: 1, page_size: 20 })
    }
    const match = path.match(/^\/api\/red-team\/tests\/([^/]+)(.*)$/)
    if (match) {
      const [, testId, tail] = match, current = state.tests[testId]
      if (!current) return respond({ detail: { message: 'Test not found' } }, 404)
      if (!tail) {
        if (method === 'PUT') {
          const body = request.postDataJSON(); state.saves.push(body)
          Object.assign(current, body, { version: current.version + 1 })
        }
        return respond({ test: current })
      }
      if (tail === '/config-preview') return preview(current, current.suite_id)
      if (tail === '/launch') {
        state.launches.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
        if (state.failLaunch) { state.failLaunch = false; return route.abort('failed') }
        current.status = current.suite_id ? 'running' : 'queued'
        current.progress = { planned: 6, executed: 0, graded: 0, phase: current.suite_id ? 'evaluating' : 'claimed' }
        current.counts = { planned: 6, executed: 0, graded: 0 }
        return respond({ test: current }, 202)
      }
      if (tail === '/cancel') { state.cancels += 1; current.status = 'cancelled'; return respond({ test: current }) }
      if (tail === '/clone') {
        const clone = { ...current, id: id(21), status: 'draft', mode: request.postDataJSON().mode, version: 1,
          subject_user_id: request.postDataJSON().mode === 'protected' ? ids.subject : null }
        state.tests[clone.id] = clone; return respond({ test: clone }, 201)
      }
      if (tail === '/report') {
        const report = sampleReport(current)
        if (options.noPair) report.paired = null
        return respond(report)
      }
      if (tail === '/results') {
        let items = [result(0), result(1), result(2)]
        for (const [param, key] of Object.entries({ verdict: 'verdict', plugin: 'plugin_id', strategy: 'strategy_id', verdict_source: 'verdict_source' })) {
          if (url.searchParams.get(param)) items = items.filter((row) => row[key] === url.searchParams.get(param))
        }
        return respond({ items, total: items.length, page: 1, page_size: 20,
          counts: { all: 3, unsafe: 2, defended: 1, pending: 0, errors: 0 } })
      }
      if (tail.startsWith('/results/')) {
        const index = Number(tail.split('/').at(-1)) - 500
        return respond({ result: { ...result(index, true), ...(options.detailFlags || {}) } })
      }
      if (tail === '/export') {
        const csv = url.searchParams.get('format') === 'csv'
        return route.fulfill({ contentType: csv ? 'text/csv' : 'application/json',
          body: csv ? "test_idx,plugin_id,verdict_source,prompt\n0,prompt-extraction,policy,'=safe\n" : JSON.stringify({ report: sampleReport(current), results: [result(0)] }) })
      }
    }
    state.errors.push(`Unexpected API: ${method} ${path}`)
    return respond({ detail: { message: 'Unexpected synthetic API request' } }, 500)
  })
  return state
}
