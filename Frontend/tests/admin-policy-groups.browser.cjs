// Synthetic API responses only. Never contacts application data or model providers.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')

;(async () => {
  const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5187'
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const userId = 'a'.repeat(24), groupId = 'b'.repeat(24), integrationId = 'c'.repeat(24), secondId = 'd'.repeat(24)
    const errors = [], assignments = [], sends = []
    let groupIds = [], version = 1, failNextSave = true
    const user = () => ({ id: userId, first_name: 'Ada', last_name: 'Admin', email: 'admin@example.test', department: 'IT', role: 'org_admin', group_ids: groupIds, version, company: { name: 'Synthetic' } })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
    await page.route(`${base}/api/**`, async (route) => {
      const request = route.request(), url = new URL(request.url())
      const respond = (json, status = 200) => route.fulfill({ status, json })
      if (url.pathname === '/api/auth/me') return respond(user())
      if (url.pathname === '/api/notifications') return respond({ items: [] })
      if (url.pathname === '/api/prompt-workspace/context') return respond({
        integrations: [{ id: integrationId, account_name: 'Group protected', provider: 'gemini', models: ['demo-model'] }, { id: secondId, account_name: 'Global policy', provider: 'gemini', models: ['demo-model'] }],
        groups: groupIds.map((id) => ({ id, name: 'Admin checks' })), require_active_policy: false,
        input_policy_coverage: { [integrationId]: groupIds.includes(groupId), [secondId]: true }, enforcement_ready: true,
      })
      if (url.pathname === '/api/prompt-workspace/conversations') return respond({ items: [], total: 0, page: 1, page_size: 20 })
      // The current account may be absent from a filtered or paginated user list.
      if (url.pathname === '/api/users') return respond({ items: [], total: 0, page: 1, page_size: 20 })
      if (url.pathname === '/api/groups') return respond({ items: [{ _id: groupId, name: 'Admin checks' }], total: 1, page: 1, page_size: 100 })
      if (url.pathname === '/api/users/me/groups' && request.method() === 'GET') return respond({ user: user() })
      if (url.pathname === '/api/users/me/groups' && request.method() === 'PATCH') {
        const body = request.postDataJSON()
        assignments.push(body)
        if (failNextSave) { failNextSave = false; version = 2; return respond({ detail: { code: 'stale_version', message: 'Your account changed. Refresh and try again.' } }, 409) }
        assert.equal(body.version, version)
        assert.deepEqual(Object.keys(body).sort(), ['group_ids', 'version'])
        groupIds = body.group_ids; version++
        return respond({ user: user(), message: 'Your policy groups were updated.' })
      }
      if (url.pathname === '/api/prompt-workspace/run') {
        const body = request.postDataJSON()
        sends.push(body)
        const id = String(sends.length).padStart(24, '0'), blocked = body.prompt.includes('restricted')
        const run = { id, conversation_id: body.conversation_id || id, prompt: body.prompt, integration_id: integrationId, model: body.model, status: blocked ? 'blocked_input' : 'allowed', response_text: blocked ? null : 'Hello, admin.', created_at: new Date().toISOString(), input_evaluation: { rule_results: [], errors: [] } }
        return respond(blocked ? { run, detail: { code: 'blocked_input', message: 'Input blocked' } } : { run }, blocked ? 403 : 200)
      }
      return respond({ items: [], total: 0 })
    })
    await page.goto(`${base}/#prompt-studio`)
    await page.getByText('Policies optional for admins', { exact: true }).waitFor()
    const composer = page.getByRole('textbox', { name: 'Start a conversation' })
    await composer.fill('hi')
    assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isEnabled(), true)
    await composer.press('Enter')
    await page.getByText('Hello, admin.', { exact: true }).waitFor()
    assert.equal(sends.length, 1)
    await page.locator('.studio-new-chat').click()
    await page.getByRole('textbox', { name: 'Start a conversation' }).fill('Optional policy test')
    await page.getByRole('combobox', { name: /^Integration/ }).selectOption(secondId)
    assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isEnabled(), true)
    await page.getByRole('combobox', { name: /^Integration/ }).selectOption(integrationId)
    assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isEnabled(), true)
    await page.screenshot({ path: '/tmp/sentinel-admin-policy-setup.png', fullPage: true })
    await page.getByRole('link', { name: 'My policy groups' }).click()
    await page.getByRole('button', { name: 'My policy groups', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Admin checks', exact: true }).check()
    await page.getByRole('button', { name: 'Save my groups', exact: true }).click()
    await page.getByText('Your account changed. Refresh and try again.').waitFor()
    assert.equal(await page.getByRole('checkbox', { name: 'Admin checks', exact: true }).isChecked(), true)
    await page.getByRole('button', { name: 'Reload my groups', exact: true }).click()
    await page.getByRole('button', { name: 'Save my groups', exact: true }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('form[aria-label="Manage my policy groups"] button[type="button"]').disabled)
    await page.getByRole('checkbox', { name: 'Admin checks', exact: true }).check()
    await page.screenshot({ path: '/tmp/sentinel-admin-group-editor.png', fullPage: true })
    await page.getByRole('button', { name: 'Save my groups', exact: true }).click()
    await page.getByRole('link', { name: 'Return to Prompt Studio' }).click()
    await page.locator('.studio-policy-banner > summary').click()
    await page.getByText('Groups: Admin checks', { exact: true }).waitFor()
    await page.getByRole('textbox', { name: 'Start a conversation' }).fill('hi')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Hello, admin.', { exact: true }).waitFor()
    await page.getByRole('textbox', { name: 'Continue the conversation' }).fill('restricted content')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Prompt blocked by policy', { exact: true }).waitFor()
    assert.equal(sends.length, 3)
    assert.equal(assignments.length, 2)
    assert.equal(await page.locator('.studio-message-response').count(), 1)
    assert.deepEqual(errors, [])
    console.log('Admin browser checks passed: sending without policy assignment, optional-policy copy, integration selection, own groups outside pagination, stale-save recovery, assigned policies and blocked content.')
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
