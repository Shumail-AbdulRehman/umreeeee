// All API traffic is mocked. Never contacts model providers or application data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
;(async () => {
  const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5187'
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], requests = [], runs = []
    const integrationId = 'a'.repeat(24)
    let counter = 1, failNext = false, historyMode = 'missing', outageAfterReply = false
    const chats = () => {
      const grouped = new Map()
      for (const run of runs) {
        if (!grouped.has(run.conversation_id)) grouped.set(run.conversation_id, { id: run.conversation_id, title: run.prompt.slice(0, 80), created_at: run.created_at, updated_at: run.created_at, model: run.model, message_count: 0 })
        const item = grouped.get(run.conversation_id)
        item.message_count++; item.updated_at = run.created_at
      }
      return [...grouped.values()].reverse()
    }
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'synthetic-only'))
    await page.route(`${base}/api/**`, async (route) => {
      const request = route.request(), url = new URL(request.url())
      const respond = (json, status = 200) => route.fulfill({ status, json })
      if (url.pathname === '/api/auth/me') return respond({ id: 'test-user', role: 'user', first_name: 'Ada', last_name: 'Test', company: { name: 'Synthetic' } })
      if (url.pathname === '/api/notifications') return respond({ items: [] })
      if (url.pathname === '/api/prompt-workspace/context') return respond({ integrations: [{ id: integrationId, provider: 'gemini', account_name: 'Demo integration', models: ['demo-model'] }], groups: [{ id: 'g', name: 'Test group' }], enforcement_ready: true })
      if (url.pathname === '/api/prompt-workspace/conversations') {
        if (historyMode === 'missing') return respond({ detail: 'Not Found' }, 404)
        if (historyMode === 'offline') return respond({ detail: { code: 'database_unavailable', message: 'History temporarily unavailable' } }, 503)
        return respond({ items: chats(), total: chats().length, page: 1, page_size: 20 })
      }
      if (url.pathname.startsWith('/api/prompt-workspace/conversations/')) {
        const id = url.pathname.split('/').at(-1), chat = chats().find((item) => item.id === id)
        if (!chat) return respond({ detail: { code: 'not_found', message: 'Chat not found' } }, 404)
        return respond({ conversation: chat, items: runs.filter((run) => run.conversation_id === id), total: chat.message_count, page: 1, page_size: 50, context_note: 'Recent permitted exchanges are used.' })
      }
      if (url.pathname === '/api/prompt-workspace/run') {
        const body = request.postDataJSON(), key = request.headers()['idempotency-key']
        requests.push({ body, key })
        if (failNext) { failNext = false; return respond({ detail: { message: 'Temporary network failure' } }, 503) }
        await new Promise((resolve) => setTimeout(resolve, 160))
        let run = runs.find((item) => item.key === key)
        if (!run) {
          const id = String(counter++).padStart(24, '0'), blocked = body.prompt.includes('restricted'), checkError = body.prompt === 'Synthetic checking failure'
          run = { id, key, conversation_id: body.conversation_id || id, integration_id: integrationId, prompt: body.prompt, model: body.model, status: checkError ? 'validation_error' : blocked ? 'blocked_input' : 'allowed', response_text: blocked || checkError ? null : `Reply to: ${body.prompt}`, response_withheld: false, created_at: new Date().toISOString(), prompt_tokens: 4, completion_tokens: blocked || checkError ? 0 : 6, estimated_cost_usd: '0.001', total_latency_ms: 160, input_evaluation: checkError ? { errors: ['detector_timeout'], rule_results: [{ policy_name: 'Harmful content checks', rule_id: 'guardrail', outcome: 'error', reason_code: 'detector_timeout' }] } : { errors: [], rule_results: [] } }
          runs.push(run)
        }
        if (outageAfterReply) { historyMode = 'offline'; outageAfterReply = false }
        return respond(run.status === 'allowed' ? { run } : { run, detail: { message: 'Input blocked by policy' } }, run.status === 'allowed' ? 200 : 403)
      }
      return respond({ items: [], total: 0 })
    })
    await page.goto(`${base}/#prompt-studio`)
    await page.getByText('Chat history unavailable', { exact: true }).waitFor()
    assert.equal(await page.getByText('A home for your conversations', { exact: true }).count(), 0)
    await page.getByRole('textbox', { name: 'Start a conversation' }).fill('Preserve this draft')
    assert.equal(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled(), true)
    await page.getByRole('textbox', { name: 'Start a conversation' }).press('Enter')
    assert.equal(requests.length, 0)
    historyMode = 'ok'
    await page.getByRole('button', { name: 'Retry loading chats', exact: true }).click()
    await page.getByText('A home for your conversations', { exact: true }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: 'Start a conversation' }).inputValue(), 'Preserve this draft')
    outageAfterReply = true
    await page.getByRole('textbox', { name: 'Start a conversation' }).fill('Plan a three-day trip')
    await page.getByRole('textbox', { name: 'Start a conversation' }).press('Enter')
    await page.getByText('Reply to: Plan a three-day trip', { exact: true }).waitFor()
    assert.equal(await page.locator('.studio-history-item').count(), 1)
    await page.getByText('Could not load chats', { exact: true }).waitFor()
    assert.equal(await page.locator('.studio-form-error').count(), 0)
    assert.equal(await page.getByText('A home for your conversations', { exact: true }).count(), 0)
    historyMode = 'ok'
    await page.getByRole('button', { name: 'Retry loading chats', exact: true }).click()
    await page.getByText('Could not load chats', { exact: true }).waitFor({ state: 'hidden' })
    await page.getByRole('textbox', { name: 'Continue the conversation' }).fill('Make the second day quieter')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Reply to: Make the second day quieter', { exact: true }).waitFor()
    assert.equal(await page.locator('.studio-history-item').count(), 1)
    assert.equal(await page.locator('.studio-turn').count(), 2)
    assert.equal(requests[1].body.conversation_id, runs[0].conversation_id)
    await page.reload()
    await page.getByText('Reply to: Make the second day quieter', { exact: true }).waitFor()
    assert.equal(await page.locator('.studio-turn').count(), 2)
    await page.getByRole('textbox', { name: 'Continue the conversation' }).fill('restricted message')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Prompt blocked by policy', { exact: true }).waitFor()
    assert.equal(await page.locator('.studio-turn').count(), 3)
    assert.equal(await page.locator('.studio-history-item').count(), 1)
    assert.equal(await page.locator('.studio-message-response').count(), 2)
    await page.locator('.studio-new-chat').click()
    await page.getByRole('textbox', { name: 'Start a conversation' }).fill('A separate conversation')
    failNext = true
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Temporary network failure' }).waitFor()
    const failedKey = requests.at(-1).key
    assert.equal(await page.getByRole('textbox', { name: 'Start a conversation' }).inputValue(), 'A separate conversation')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Reply to: A separate conversation', { exact: true }).waitFor()
    assert.equal(requests.at(-1).key, failedKey)
    assert.equal(await page.locator('.studio-history-item').count(), 2)
    await page.getByRole('textbox', { name: 'Continue the conversation' }).fill('Synthetic checking failure')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    await page.getByText('Security check could not complete', { exact: true }).waitFor()
    await page.getByText('Harmful content checks · Input', { exact: true }).waitFor()
    assert.equal(await page.getByText('detector_timeout', { exact: true }).isVisible(), true)
    assert.equal(await page.locator('.studio-message-details[open]').count(), 1)
    assert.equal(await page.locator('.studio-history-item').count(), 2)
    await page.locator('.studio-history-item').filter({ hasText: 'Plan a three-day trip' }).click()
    await page.getByText('Reply to: Make the second day quieter', { exact: true }).waitFor()
    await page.screenshot({ path: '/tmp/sentinel-chat-desktop.png', fullPage: true })
    for (const size of [{ width: 1024, height: 844 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
      if (size.width < 700) {
        await page.getByRole('button', { name: 'Chats', exact: true }).click()
        await page.getByRole('button', { name: 'Close chats', exact: true }).waitFor({ state: 'visible' })
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Close chats', exact: true }).waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: 'Chats', exact: true }).click()
        await page.locator('.studio-history-item').filter({ hasText: 'A separate conversation' }).click()
        await page.getByText('Reply to: A separate conversation', { exact: true }).waitFor()
        await page.screenshot({ path: '/tmp/sentinel-chat-mobile.png', fullPage: true })
      }
    }
    assert.deepEqual(errors, [])
    console.log('Conversation browser checks passed: old-backend 404, send guard, draft preservation, history outage after reply, recovery, grouping, follow-ups, reload, blocked input, new chat, idempotent retry, desktop/tablet/mobile, history drawer, no JS errors.')
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
