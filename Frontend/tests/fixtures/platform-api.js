/** Synthetic browser-only records matching the approved v3 composition. */
export const NOW = '2026-11-25T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const id = (number) => number.toString(16).padStart(24, '0')
export const ids = { northstar: id(1), meridian: id(2), atlas: id(3), studio: id(4), solace: id(5), cinder: id(6), field: id(7), orbit: id(8), vector: id(9), juniper: id(10), evergreen: id(11), lightwell: id(12) }
const before = (minutes) => new Date(NOW_MS - minutes * 60000).toISOString()

function split(total, weights) {
  let used = 0
  const weight = weights.reduce((sum, value) => sum + value, 0)
  return weights.map((value, index) => {
    const part = index === weights.length - 1 ? total - used : Math.floor(total * value / weight)
    used += part
    return part
  })
}

function dailySeries(company, days) {
  const prior = days === 30 ? company.slug === 'cinder-works' ? 380 : Math.round(company.runs * 2.6) : 0
  const recentWeights = [11, 15, 13, 17, 12, 15, 17]
  const source = days === 7 ? recentWeights : [...Array.from({ length: 23 }, (_, index) => 7 + index % 5), ...recentWeights]
  const totals = [company.runs - company.blocked - company.errors + prior, company.blocked, company.errors]
  const distributions = totals.map((total) => split(total, source))
  return source.map((_, index) => ({ date: new Date(Date.UTC(2026, 10, 25 - days + 1 + index)).toISOString(), allowed: distributions[0][index], blocked: distributions[1][index], other: distributions[2][index] }))
}

const total = (series) => series.reduce((sum, point) => sum + point.allowed + point.blocked + point.other, 0)
const windowFor = (days) => ({ days, from: new Date(Date.UTC(2026, 10, 25 - days + 1)).toISOString(), to: NOW, timezone: 'UTC' })

function initialCompanies() {
  const values = [
    ['northstar', 'Northstar Labs', 3762, 250, 59, 3, 3, 86, 3, 4, 0, 4, 7, 91, 'ready', 18, '2026-08-14'],
    ['meridian', 'Meridian Health', 2914, 126, 32, 1, 0, 64, 2, 3, 0, 3, 5, 97, 'ready', 42, '2026-09-04'],
    ['atlas', 'Atlas Financial', 2084, 173, 125, 2, 0, 42, 2, 1, 0, 2, 3, 82, 'ready', 60, '2026-09-12'],
    ['studio', 'Studio Form', 1220, 35, 32, 0, 0, 31, 1, 2, 0, 1, 2, 67, 'setup_incomplete', 120, '2026-10-06'],
    ['solace', 'Solace Systems', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, null, 'awaiting_admin', null, '2026-11-22'],
    ['cinder', 'Cinder Works', 0, 0, 0, 0, 0, 24, 1, 0, 0, 1, 2, null, 'ready', 17280, '2026-10-10'],
    ['field', 'Fieldnote', 936, 71, 11, 1, 0, 25, 1, 1, 0, 1, 3, 96, 'ready', 180, '2026-10-12'],
    ['orbit', 'Orbit Research', 694, 58, 33, 0, 0, 18, 2, 0, 0, 2, 2, 88, 'ready', 480, '2026-10-18'],
    ['vector', 'Vector House', 523, 26, 6, 0, 0, 12, 1, 0, 0, 1, 2, 100, 'ready', 1440, '2026-11-01'],
    ['juniper', 'Juniper Studio', 0, 0, 0, 0, 0, 5, 1, 2, 1, 0, 1, null, 'setup_incomplete', null, '2026-11-20'],
    ['evergreen', 'Evergreen Data', 351, 10, 4, 0, 0, 11, 1, 0, 0, 1, 1, 94, 'ready', 2880, '2026-11-08'],
    ['lightwell', 'Lightwell Design', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, null, 'awaiting_admin', null, '2026-11-24'],
  ]
  return values.map(([key, name, runs, blocked, errors, open, high, people, admins, pending, failed, integrations, groups, coverage, onboarding, minutes, created]) => ({
    id: ids[key], name, slug: name.toLowerCase().replaceAll(' ', '-'), status: key === 'cinder' ? 'suspended' : 'active', version: 1,
    created_at: `${created}T10:00:00.000Z`, is_own: key === 'evergreen', onboarding, last_workspace_submission: minutes === null ? null : before(minutes),
    open_violations: open, high_severity_violations: high, runs, blocked, errors, people, admins, pending, failed, integrations, groups, coverage,
  }))
}

function companyRead(company, days) {
  const series = dailySeries(company, days)
  const { id: companyId, name, slug, status, version, created_at, is_own, onboarding, last_workspace_submission, open_violations, high_severity_violations } = company
  return { id: companyId, name, slug, status, version, created_at, is_own, onboarding, last_workspace_submission, open_violations, high_severity_violations, workspace_runs: total(series), series }
}

function issues(companies) {
  const find = (key) => companies.find((company) => company.id === ids[key])
  return [
    { key: 'northstar', kind: 'high_severity_violations', tone: 'rose', title: '3 high-severity violations', description: 'Open and awaiting review.', occurred_at: before(18) },
    { key: 'atlas', kind: 'provider_errors', tone: 'amber', title: 'Repeated provider errors', description: '125 failed workspace submissions.', occurred_at: before(60) },
    { key: 'solace', kind: 'awaiting_admin', tone: 'violet', title: 'First admin unverified', description: 'Company registered Nov 22.', occurred_at: '2026-11-22T10:00:00.000Z' },
    { key: 'juniper', kind: 'no_integration', tone: 'blue', title: 'No active integration', description: 'Workspace setup is incomplete.', occurred_at: '2026-11-20T10:00:00.000Z' },
  ].map(({ key, ...issue }) => ({ ...issue, id: `${ids[key]}:${issue.kind}`, company_id: ids[key], company_name: find(key).name }))
}

function initialAudit(companies, many) {
  const rows = [
    ['northstar', 'policy_set.updated', 'Policy updated', 'Organization admin', '2026-11-24T09:46:00.000Z', null, 'REQ-1042'],
    ['atlas', 'integration.updated', 'Integration updated', 'Organization admin', '2026-11-24T08:22:00.000Z', null, 'REQ-1038'],
    ['meridian', 'violation.resolved', 'Violation resolved', 'Organization admin', '2026-11-23T15:31:00.000Z', null, 'REQ-1029'],
    ['juniper', 'auth.email_verified', 'Admin verified', 'Organization admin', '2026-11-22T10:17:00.000Z', null, 'REQ-1001'],
    ['cinder', 'platform.organization_status_changed', 'Company suspended', 'Platform owner', '2026-11-12T14:10:00.000Z', 'Temporary access pause requested by the company', 'REQ-0817'],
  ]
  if (many) for (let index = 0; index < 27; index += 1) rows.push(['northstar', 'integration.updated', 'Integration updated', 'Organization admin', new Date(Date.UTC(2026, 10, 24 - index, 8)).toISOString(), null, `REQ-PAGE-${String(index + 1).padStart(2, '0')}`])
  return rows.map(([key, action, event, actor_name, created_at, reason, request_id], index) => ({ id: `audit-${index}`, company_id: ids[key], company_name: companies.find((company) => company.id === ids[key]).name, action, event, actor_name, created_at, reason, request_id }))
}

function auditRead(state, params) {
  let items = state.audit.filter((event) => (!params.get('company_id') || event.company_id === params.get('company_id')) && (!params.get('event_type') || event.action === params.get('event_type')))
  const days = Number(params.get('days'))
  if (days) items = items.filter((event) => event.created_at >= windowFor(days).from)
  items = items.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
  const page = Number(params.get('page') || 1), pageSize = Number(params.get('page_size') || 20)
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize }
}

function directoryRead(state, params) {
  const days = Number(params.get('days') || 7), query = (params.get('q') || '').toLowerCase()
  let items = state.companies.map((company) => companyRead(company, days))
  items = items.filter((company) => (!query || `${company.name} ${company.slug}`.toLowerCase().includes(query)) && (!params.get('access') || company.status === params.get('access')) && (!params.get('onboarding') || company.onboarding === params.get('onboarding')) && (!params.get('activity') || (company.workspace_runs > 0 ? 'used' : 'idle') === params.get('activity')))
  const sort = params.get('sort') || 'runs'
  items.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'violations' ? b.open_violations - a.open_violations : b.workspace_runs - a.workspace_runs) || a.id.localeCompare(b.id))
  const page = Number(params.get('page') || 1), pageSize = Number(params.get('page_size') || 8)
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize, window: windowFor(days), generated_at: NOW }
}

function detailRead(state, company, days) {
  const summary = companyRead(company, days), series = summary.series
  const sum = (field) => series.reduce((count, point) => count + point[field], 0)
  const evaluated = Math.round(summary.workspace_runs * (company.coverage || 0) / 100)
  return { company: summary, window: windowFor(days), generated_at: NOW, series, attention: issues(state.companies).filter((issue) => issue.company_id === company.id), history: auditRead(state, new URLSearchParams({ company_id: company.id, page_size: '5' })), metrics: {
    active_accounts: company.people, verified_admins: company.admins, pending_invitations: company.pending, failed_invitations: company.failed, active_groups: company.groups, active_integrations: company.integrations,
    dlp_policies: company.integrations ? 2 : 0, guardrail_policies: company.integrations ? 3 : 0,
    submitting_users: company.runs ? Math.round(company.people * .73) : 0, allowed_runs: sum('allowed'), blocked_runs: sum('blocked'), provider_errors: sum('other'), validation_errors: 0, configuration_errors: 0, interrupted_runs: 0, processing_runs: 0, other_runs: sum('other'),
    evaluation_coverage: company.coverage, evaluated_runs: evaluated, terminal_runs: summary.workspace_runs,
    policy_coverage: { required: true, eligible_members: Math.max(0, company.people - company.admins), covered_members: company.integrations ? Math.max(0, company.people - company.admins - (company.onboarding === 'ready' ? 0 : 2)) : 0 },
  } }
}

function overviewRead(state, days) {
  const companies = state.companies.map((company) => companyRead(company, days))
  const series = companies.length ? companies[0].series.map((point, index) => ({ date: point.date, ...Object.fromEntries(['allowed', 'blocked', 'other'].map((field) => [field, companies.reduce((sum, company) => sum + company.series[index][field], 0)])) })) : []
  return { window: windowFor(days), generated_at: NOW, metrics: { total_companies: companies.length, using_companies: companies.filter((company) => company.workspace_runs > 0).length, onboarding_companies: companies.filter((company) => company.onboarding !== 'ready').length, suspended_companies: companies.filter((company) => company.status === 'suspended').length }, series, attention: { items: state.companies.length ? issues(state.companies) : [], total: state.companies.length ? 4 : 0 }, companies: companies.sort((a, b) => b.workspace_runs - a.workspace_runs).slice(0, 4) }
}

export async function platformFixture(page, options = {}) {
  const companies = options.empty ? [] : initialCompanies()
  const state = { companies, audit: options.empty ? [] : initialAudit(companies, options.manyAudit), requests: [], statusChanges: [], errors: [], conflicts: options.conflictOnce ? 1 : 0, failOverview: options.failOverview ? 1 : 0, failCompany: options.failCompany ? 1 : 0 }
  const user = { id: id(99), role: options.role || 'super_admin', first_name: 'Platform', last_name: 'Owner', email: 'owner@example.test', is_active: true, is_email_verified: true, group_ids: [], company: { id: ids.evergreen, name: 'Evergreen Data', status: 'active' } }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.clock.setFixedTime(new Date(NOW))
  await page.addInitScript((authenticated) => {
    if (authenticated) localStorage.setItem('centurion.auth.token', 'synthetic-platform-token')
  }, options.authenticated !== false)
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:5193') return route.continue()
    if (url.origin === 'https://fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' })
    state.errors.push(`Unexpected external request: ${url.origin}${url.pathname}`)
    return route.abort()
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    state.requests.push({ path, method, query: Object.fromEntries(url.searchParams), body: method === 'PATCH' || method === 'POST' ? request.postDataJSON() : null })
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/auth/me') return respond(user)
    if (path === '/api/auth/login') return respond({ access_token: 'synthetic-platform-token', user })
    if (path === '/api/notifications') return respond({ items: [], total: 0, unread_count: 0 })
    if (path === '/api/dashboard') return respond({ summary: {}, administration: {}, series: [], models: [], violation_categories: [], violation_types: [], users_at_risk: [], spend_by_user: [], cost_series: [], recent_runs: [] })
    if (path === '/api/analytics/summary') return respond({ filters: { from: windowFor(7).from, to: NOW }, generated_at: NOW, total_submissions: 0, allowed: 0, blocked: 0, errors: {}, latency: {}, estimated_cost_usd: '0' })
    if (path.startsWith('/api/analytics/') || path === '/api/prompt-workspace/runs') return respond({ items: [], total: 0, page: 1, page_size: 5 })
    if (path === '/api/platform/overview') {
      if (state.failOverview > 0) { state.failOverview -= 1; return respond({ detail: { code: 'unavailable', message: 'Platform reporting is temporarily unavailable.' } }, 503) }
      return respond(overviewRead(state, Number(url.searchParams.get('days') || 7)))
    }
    if (path === '/api/platform/companies') return respond(directoryRead(state, url.searchParams))
    if (path === '/api/platform/audit') return respond(auditRead(state, url.searchParams))
    const match = path.match(/^\/api\/platform\/companies\/([^/]+)(\/status)?$/)
    if (match) {
      const company = state.companies.find((item) => item.id === decodeURIComponent(match[1]))
      if (!company) return respond({ detail: { code: 'not_found', message: 'Company not found' } }, 404)
      if (method === 'PATCH' && match[2]) {
        const body = request.postDataJSON()
        state.statusChanges.push({ company_id: company.id, ...body })
        if (company.is_own) return respond({ detail: { code: 'own_company', message: 'Cannot change access to your own organization' } }, 403)
        if (state.conflicts > 0) { state.conflicts -= 1; company.version += 1; if (options.conflictStatus) company.status = options.conflictStatus; if (options.failConflictRefresh) state.failCompany += 1; return respond({ detail: { code: 'stale_version', message: 'Company changed. Refresh and try again.' } }, 409) }
        if (body.version !== company.version) return respond({ detail: { code: 'stale_version', message: 'Company changed. Refresh and try again.' } }, 409)
        if (!body.reason?.trim()) return respond({ detail: { code: 'validation_error', message: 'A reason is required.' } }, 422)
        company.status = body.status
        company.version += 1
        const reason = body.reason.trim(), label = company.status === 'suspended' ? 'suspended' : 'reactivated'
        state.audit.unshift({ id: `status-${state.statusChanges.length}`, company_id: company.id, company_name: company.name, action: 'platform.organization_status_changed', event: `Company ${label}`, actor_name: 'Platform Owner', created_at: NOW, request_id: `REQ-ACCESS-${state.statusChanges.length}`, reason })
        return respond({ organization: { id: company.id, name: company.name, status: company.status, version: company.version }, message: 'Organization status updated' })
      }
      if (state.failCompany > 0) { state.failCompany -= 1; return respond({ detail: { code: 'unavailable', message: 'Company details are temporarily unavailable.' } }, 503) }
      return respond(detailRead(state, company, Number(url.searchParams.get('days') || 7)))
    }
    state.errors.push(`Unhandled API request: ${method} ${path}`)
    return respond({ detail: { code: 'fixture_not_found', message: 'Unexpected fixture request' } }, 404)
  })
  return state
}
