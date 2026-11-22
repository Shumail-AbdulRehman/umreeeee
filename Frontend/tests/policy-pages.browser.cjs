// Every API request is mocked; this test never calls customer services.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')

;(async () => {
  const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5174'
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = [], groupPages = new Set()
    const groups = Array.from({ length: 235 }, (_, i) => ({ _id: `g${i + 1}`, name: `Group ${String(i + 1).padStart(3, '0')}`, status: 'active' }))
    const catalogs = ['dlp', 'guardrail'].map((kind) => {
      const count = kind === 'dlp' ? 473 : 179
      return { _id: `catalog-${kind}`, category: kind, status: 'active', version: 1,
        scope: { group_ids: kind === 'dlp' ? ['g1'] : [] }, entry_count: count,
        entries: Array.from({ length: count }, (_, i) => ({ id: `${kind}-${i + 1}`, title: `${kind === 'dlp' ? 'DLP' : 'Guardrail'} check ${String(i + 1).padStart(3, '0')}`, categories: ['Security'] })) }
    })
    const sets = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'mock-only'))
    await page.route(`${base}/api/**`, async (route) => {
      const url = new URL(route.request().url()), method = route.request().method()
      const body = method === 'GET' ? null : route.request().postDataJSON()
      const respond = (json, status = 200) => route.fulfill({ status, json })
      if (url.pathname === '/api/auth/me') return respond({ id: 'admin', role: 'org_admin', first_name: 'Test', last_name: 'Admin', company: { name: 'Mock organization' } })
      if (url.pathname === '/api/notifications') return respond({ items: [] })
      if (url.pathname === '/api/policies') return respond({ items: catalogs, total: 2 })
      if (url.pathname === '/api/groups') { const n = Number(url.searchParams.get('page') || 1); groupPages.add(n); return respond({ items: groups.slice((n - 1) * 100, n * 100), total: groups.length }) }
      if (url.pathname === '/api/policy-sets' && method === 'GET') { const items = sets.filter((item) => item.category === url.searchParams.get('category')); return respond({ items, total: items.length }) }
      if (url.pathname === '/api/policy-sets' && method === 'POST') {
        const policy = { _id: `set-${sets.length + 1}`, ...body, version: 1, status: 'active', policy_set: true, scope: { group_ids: [], integration_ids: [] } }
        sets.push(policy); return respond({ policy }, 201)
      }
      if (url.pathname === '/api/policies/catalog-dlp/group-selections' && method === 'PUT') {
        assert.equal(body.version, catalogs[0].version)
        assert.deepEqual(body.group_ids, ['g1'])
        assert.deepEqual(body.selected_entry_ids, [])
        catalogs[0].scope.group_ids = []; catalogs[0].version += 1
        return respond({ policy: catalogs[0] })
      }
      const match = url.pathname.match(/^\/api\/policy-sets\/(set-\d+)(?:\/(groups|status))?$/)
      if (match) {
        const policy = sets.find((item) => item._id === match[1]); assert.ok(policy); assert.equal(body.version, policy.version)
        if (match[2] === 'groups') policy.scope.group_ids = body.group_ids
        else if (match[2] === 'status') policy.status = body.status
        else Object.assign(policy, { name: body.name, description: body.description, selected_entry_ids: body.selected_entry_ids })
        policy.version += 1; return respond({ policy })
      }
      errors.push(`Unexpected API: ${method} ${url.pathname}`); return route.abort()
    })
    const dialog = page.getByRole('dialog')
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const assertScrollableEditor = async () => {
      const metrics = await dialog.evaluate((element) => {
        const body = element.querySelector('.assignment-editor-body')
        const footer = element.querySelector('.assignment-editor-footer')
        return {
          bodyScrollable: body.scrollHeight > body.clientHeight,
          footerBottom: footer.getBoundingClientRect().bottom,
          modalBottom: element.getBoundingClientRect().bottom,
          viewportBottom: innerHeight,
        }
      })
      assert.equal(metrics.bodyScrollable, true)
      assert.ok(metrics.footerBottom <= metrics.modalBottom + 1, 'Save controls must stay inside the dialog')
      assert.ok(metrics.footerBottom <= metrics.viewportBottom + 1, 'Save controls must stay on screen')
    }
    await page.goto(`${base}/#dlp-policy`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'DLP policies', exact: true }).waitFor()
    assert.deepEqual([...groupPages], [1, 2, 3])
    await page.setViewportSize({ width: 1440, height: 700 })
    await page.getByRole('button', { name: 'Create DLP policy', exact: true }).first().click()
    await dialog.getByLabel('Policy name').fill('Customer data protection')
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check()
    await assertScrollableEditor()
    await page.screenshot({ path: '/tmp/policy-modal-dlp-scroll.png' })
    for (const n of ['001', '002', '003']) await dialog.getByRole('checkbox', { name: `Select DLP check ${n}`, exact: true }).check()
    await dialog.getByLabel('Search checks').fill('473')
    await dialog.getByRole('checkbox', { name: 'Select DLP check 473', exact: true }).check()
    await dialog.getByRole('button', { name: 'Create policy', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(sets[0].selected_entry_ids, ['dlp-1', 'dlp-2', 'dlp-3', 'dlp-473'])
    assert.deepEqual(sets[0].scope.group_ids, [])
    await page.getByRole('button', { name: 'Assign groups', exact: true }).click()
    await dialog.getByRole('checkbox', { name: 'Assign to Group 002', exact: true }).check()
    await dialog.getByLabel('Search groups').fill('Group 220')
    await dialog.getByRole('checkbox', { name: 'Assign to Group 220', exact: true }).check()
    await dialog.getByRole('button', { name: 'Save assignments', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(sets[0].scope.group_ids, ['g2', 'g220'])
    await page.getByRole('button', { name: 'Edit checks', exact: true }).click()
    await dialog.getByRole('radio', { name: /All 473 checks/ }).check()
    await dialog.getByRole('button', { name: 'Save policy', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(sets[0].selected_entry_ids.length, 473)
    assert.deepEqual(sets[0].scope.group_ids, ['g2', 'g220'])
    await page.screenshot({ path: '/tmp/named-policy-desktop.png', fullPage: true })
    page.once('dialog', (event) => event.accept())
    await page.getByRole('button', { name: 'Remove earlier assignments', exact: true }).click()
    await page.getByText('Earlier direct assignments removed.', { exact: true }).waitFor()
    assert.deepEqual(catalogs[0].scope.group_ids, [])
    assert.deepEqual(sets[0].scope.group_ids, ['g2', 'g220'])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Customer data protection' }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow()
    await page.screenshot({ path: '/tmp/named-policy-mobile.png', fullPage: true })
    await page.getByRole('button', { name: 'Assign groups', exact: true }).click(); await noOverflow()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto(`${base}/#guardrail-policy`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Create Guardrail policy', exact: true }).first().click()
    await dialog.getByLabel('Policy name').fill('Safe responses')
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check()
    await assertScrollableEditor()
    await page.screenshot({ path: '/tmp/policy-modal-guardrail-scroll.png' })
    for (const n of ['001', '002']) await dialog.getByRole('checkbox', { name: `Select Guardrail check ${n}`, exact: true }).check()
    await dialog.getByRole('button', { name: 'Create policy', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(sets[1].selected_entry_ids.length, 2)
    assert.deepEqual(errors, [])
    console.log('PASS: named DLP and Guardrail policies; four or all checks; reusable group assignments; edits preserve assignments; reload; mobile width.')
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
