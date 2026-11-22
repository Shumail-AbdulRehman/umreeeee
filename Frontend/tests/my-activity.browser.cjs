// Synthetic API fixtures only; no customer data or provider requests.
const { chromium } = require('playwright')
const AxeBuilder = require('@axe-core/playwright').default
const assert = require('node:assert/strict')
const fs = require('node:fs')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5193'
const id = value => String(value).padStart(24, '0')
let browser
;(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = [], unexpected = [], requests = [], violations = []
  let role = 'user', fail = false, empty = false, slow90 = false, unknownCost = false
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
  await page.route(base + '/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const send = (json, status = 200) => route.fulfill({ json, status })
    if (request.method() !== 'GET') { unexpected.push(request.method() + ' ' + path); return route.abort() }
    if (path === '/api/auth/me') return send({ id: id(10), first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.test', role, company: { id: id(90), name: 'Northstar Labs' } })
    if (path === '/api/notifications') return send({ items: [] })
    if (path.startsWith('/api/analytics/') || path === '/api/prompt-workspace/runs') {
      const from = url.searchParams.get('from'), to = url.searchParams.get('to')
      const days = from ? (Date.parse(to) - Date.parse(from)) / 86400000 : 7
      if (role === 'user') {
        assert.equal(url.searchParams.get('user_id'), id(10), 'Every report request must be explicitly scoped to the current member')
        assert.equal([7, 30, 90].includes(days), true)
        assert.equal(new Date(from).toISOString(), from)
        assert.equal(new Date(to).toISOString(), to)
      }
      requests.push({ path, from, to, days, userId: url.searchParams.get('user_id') })
      if (slow90 && days === 90) await new Promise(resolve => setTimeout(resolve, 850))
      if (fail) return send({ detail: { message: 'Personal analytics temporarily unavailable' } }, 503)
      const total = empty ? 0 : days === 30 ? 31 : days === 90 ? 99 : 18
      const summary = { filters: { from, to, user_id: id(10) }, generated_at: to, total_submissions: total, allowed: total ? total - 4 : 0, blocked: total ? 2 : 0, errors: { provider_error: total ? 1 : 0 }, processing: total ? 1 : 0, known_prompt_tokens: total * 180, known_completion_tokens: total * 60, unknown_usage_runs: total ? 1 : 0, unknown_cost_runs: unknownCost ? total : total ? 1 : 0, estimated_cost_usd: unknownCost ? '0' : total ? '0.064' : '0', violation_events: total ? 2 : 0, legacy_history_count: 1, latency: { total_latency_ms: { count: total, p50: total ? 1120 : null, p95: total ? 1850 : null } } }
      if (path.endsWith('/summary')) return send(summary)
      if (path.endsWith('/series')) return send({ items: total ? [
        { date: from.slice(0, 10) + 'T00:00:00Z', status: 'allowed', count: total - 4 },
        { date: to.slice(0, 10) + 'T00:00:00Z', status: 'blocked_input', count: 2 },
        { date: to.slice(0, 10) + 'T00:00:00Z', status: 'provider_error', count: 1 },
        { date: to.slice(0, 10) + 'T00:00:00Z', status: 'processing', count: 1 },
      ] : [] })
      if (path.endsWith('/models')) return send({ items: total ? [
        { provider: 'gemini', model: 'gemini-3-flash-preview', runs: total - 7 },
        { provider: 'openai', model: 'gpt-4.1-mini', runs: 4 },
        { provider: 'anthropic', model: 'claude-sonnet-with-an-extra-long-model-name-for-overflow-checking', runs: 3 },
      ] : [] })
      assert.equal(url.searchParams.get('page_size'), '5')
      return send({ items: total ? Array.from({ length: 5 }, (_, i) => ({ id: id(i + 50), created_at: new Date(Date.parse(to) - i * 3600000).toISOString(), provider: 'gemini', model: 'gemini-3-flash-preview', status: i === 1 ? 'blocked_input' : i === 2 ? 'provider_error' : 'allowed', total_tokens: i === 1 ? null : 240 })) : [], total, page: 1, page_size: 5 })
    }
    if (path === '/api/prompt-workspace/context') return send({ integrations: [], groups: [], enforcement_ready: true, require_active_policy: false })
    if (path === '/api/prompt-workspace/conversations') return send({ items: [], total: 0, page: 1, page_size: 20 })
    unexpected.push(path); return route.abort()
  })
  const ready = async () => {
    await page.locator('.my-activity-metrics').waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('.page-loading-content.is-pending'))
  }
  const count = () => page.locator('.my-activity-metrics .stat-value').first().innerText()
  const audit = async label => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    for (const finding of result.violations) violations.push({ label, id: finding.id, nodes: finding.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })
  }
  const captures = '.impeccable/review/my-activity'
  fs.mkdirSync(captures, { recursive: true })
  await page.goto(base + '/#my-activity'); await ready()
  assert.equal(await count(), '18')
  assert.equal(requests.length, 4)
  assert.equal(new Set(requests.map(row => row.from)).size, 1)
  assert.equal(new Set(requests.map(row => row.to)).size, 1)
  await page.getByRole('button', { name: 'My activity', exact: true }).waitFor()
  assert.equal(await page.locator('.my-activity-page .recharts-surface').count(), 3)
  assert.equal(await page.getByRole('link', { name: 'View run', exact: true }).count(), 5)
  assert.equal(await page.getByRole('link', { name: 'View run', exact: true }).first().getAttribute('href'), '#prompt-studio?run_id=' + id(50))
  const primaryAction = page.getByRole('link', { name: 'New conversation', exact: true })
  for (const state of ['default', 'hover', 'focus']) {
    if (state === 'hover') await primaryAction.hover()
    if (state === 'focus') await primaryAction.focus()
    const colors = await primaryAction.evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
    assert.notEqual(colors.foreground, colors.background, 'Primary action must remain readable in ' + state)
  }
  await primaryAction.evaluate(element => element.blur())
  await page.getByText('View chart data', { exact: true }).first().click()
  assert.equal(await page.locator('.chart-data[open] table').count(), 1)
  await page.getByText('View chart data', { exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Activity reporting period' }).selectOption('30'); await ready()
  assert.equal(await count(), '31')
  assert.equal(requests.slice(-4).every(row => row.days === 30 && row.userId === id(10)), true)
  assert.equal(new Set(requests.slice(-4).map(row => row.from)).size, 1)
  slow90 = true
  await page.getByRole('combobox', { name: 'Activity reporting period' }).selectOption('90')
  await page.getByText('Loading your activity…', { exact: true }).waitFor()
  assert.equal(await page.locator('.my-activity-metrics').count(), 0)
  await page.getByRole('combobox', { name: 'Activity reporting period' }).selectOption('7'); await ready()
  await page.waitForTimeout(1000); assert.equal(await count(), '18'); slow90 = false
  for (const [width, height, name] of [[1440, 1000, 'desktop'], [1920, 1000, 'user-1920'], [768, 1000, 'tablet'], [390, 844, 'mobile'], [320, 844, 'small-mobile']]) {
    await page.setViewportSize({ width, height })
    await page.mouse.move(5, 5)
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Page overflow at ' + width)
    await audit(name)
    await page.screenshot({ path: captures + '/' + name + '.png', fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  unknownCost = true
  await page.getByRole('button', { name: 'Refresh my activity', exact: true }).click(); await ready()
  assert.equal(await page.locator('.my-activity-metrics .stat-value').last().innerText(), 'Unknown')
  fail = true
  await page.getByRole('button', { name: 'Refresh my activity', exact: true }).click()
  await page.getByRole('heading', { name: 'Could not load your activity' }).waitFor()
  assert.equal(await page.locator('.my-activity-metrics').count(), 0)
  await audit('error')
  await page.screenshot({ path: captures + '/error.png', fullPage: true })
  fail = false; empty = true
  await page.getByRole('button', { name: 'Retry activity', exact: true }).click(); await ready()
  await page.getByRole('heading', { name: 'No activity in this period', exact: true }).waitFor()
  assert.equal(await page.locator('.my-activity-page .recharts-surface').count(), 0)
  await audit('empty')
  await page.screenshot({ path: captures + '/empty.png', fullPage: true })
  role = 'org_admin'; empty = false; unknownCost = false
  await page.goto(base + '/#spend'); await page.reload()
  await page.getByRole('heading', { name: 'Spend', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'My activity', exact: true }).count(), 0)
  const adminNavigation = await page.locator('.side .nav-item-label').allTextContents()
  assert.deepEqual(adminNavigation, ['Prompt Studio', 'Overview', 'Activity', 'Violations', 'Models', 'Latency', 'Spend', 'Users', 'User insights', 'Groups', 'Integrations', 'DLP policy', 'Guardrail policy', 'Red Team', 'Settings'])
  fs.writeFileSync(captures + '/a11y.json', JSON.stringify(violations, null, 2))
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []); assert.deepEqual(violations, [])
  console.log('PASS: member-only activity route, explicit own-user scope, matching report intervals, 7/30/90 days, stale-response isolation, real charts, table alternatives, recent-run links, unknown costs, error/retry, empty activity, five responsive widths, unchanged admin navigation, no JS errors and zero axe findings.')
  await browser.close()
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1 })
