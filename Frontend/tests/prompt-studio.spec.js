import process from 'node:process'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const runCommand = promisify(execFile)
const id = value => String(value).padStart(24, '0')
const chatId = id(1), connectionId = id(80)
const code = '{\n  "status": "ready"\n}'
const markdown = `# A clear plan\n\nA **structured** response with *emphasis* and \`inline code\`.\n\n## Next steps\n\n1. Review the scope.\n2. Build the essentials.\n\n> Keep the result reviewable.\n\n| Stage | Goal | Owner | Output | Review | Notes | Follow-up | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| Prepare | Align | Team | Scope | Ready | Sample | Review | Done |\n\n\`\`\`json\n${code}\n\`\`\`\n\n- [x] Scope agreed\n- [ ] Review complete\n\n[Documentation](https://example.test/docs)\n\n[Unsafe link](javascript:alert(1))\n\n![Example diagram](https://image.example.invalid/tracker.png)\n\n<script>window.injectedMarkdown = true</script>`
async function fixture(page, options = {}) {
  const state = { historyFail: false, posts: [], errors: [], ...options }
  const sample = { id: id(50), conversation_id: chatId, integration_id: connectionId, status: 'allowed', prompt: '**literal prompt** <img src="x">', response_text: markdown, response_withheld: false, content_expired: false, model: 'demo-model', created_at: '2026-11-04T09:00:00Z', input_evaluation: { errors: [], rule_results: [] }, ...options.run }
  const chats = Array.from({ length: options.paged ? 21 : 1 }, (_, i) => ({ id: id(i + 1), title: i ? `Synthetic chat ${i + 1}` : 'A clear plan', message_count: options.older ? 2 : 1, updated_at: sample.created_at }))
  page.on('pageerror', error => state.errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('centurion.auth.token', 'synthetic-only')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
      if (window.clipboardFails) throw Error('Clipboard unavailable')
      window.lastCopied = value
    } } })
  })
  await page.route('http://127.0.0.1:5191/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/auth/me') return respond({ id: id(99), role: options.admin ? 'org_admin' : 'user', first_name: 'Alex', last_name: 'Morgan', company: { id: id(100), name: 'Northstar Labs' } })
    if (path === '/api/notifications') return respond({ items: [] })
    if (path === '/api/prompt-workspace/context') return respond({ integrations: [{ id: connectionId, provider: 'gemini', account_name: 'Product workspace', models: ['demo-model', 'second-model'] }, { id: id(81), provider: 'openai', account_name: 'Alternate workspace', models: ['alternate-model'] }], groups: [{ id: 'g1', name: 'Engineering' }], enforcement_ready: true, require_active_policy: true, input_policy_coverage: { [connectionId]: true, [id(81)]: true }, ...options.context })
    if (path === '/api/prompt-workspace/conversations') {
      if (state.historyFail) return respond({ detail: { code: 'database_unavailable', message: 'History temporarily unavailable' } }, 503)
      const number = Number(url.searchParams.get('page') || 1)
      return respond({ items: chats.slice((number - 1) * 20, number * 20), total: chats.length, page: number, page_size: 20 })
    }
    if (path.startsWith('/api/prompt-workspace/conversations/')) {
      const selectedId = path.split('/').at(-1), chat = chats.find(item => item.id === selectedId) || chats[0]
      const number = Number(url.searchParams.get('page') || 1)
      const run = number === 2 ? { ...sample, id: id(49), prompt: 'An earlier message', response_text: 'An earlier permitted reply.' } : sample
      return respond({ conversation: chat, items: [{ ...run, conversation_id: selectedId }], total: options.older ? 2 : 1, page: number, page_size: 50, context_note: 'Recent permitted messages provide context.' })
    }
    if (path === '/api/prompt-workspace/run') {
      const body = request.postDataJSON()
      state.posts.push({ body, key: request.headers()['idempotency-key'] })
      await new Promise(resolve => setTimeout(resolve, 180))
      return respond({ run: { ...sample, ...body, id: id(51), conversation_id: body.conversation_id || chatId, response_text: 'A newly permitted reply.' } })
    }
    if (path.startsWith('/api/prompt-workspace/runs/')) return respond({ run: sample })
    throw Error(`Unexpected API call: ${request.method()} ${path}`)
  })
  return state
}
async function openChat(page) {
  await page.goto(`/#prompt-studio?chat=${chatId}`)
  await expect(page.getByRole('heading', { name: 'A clear plan', exact: true }).first()).toBeVisible()
  await expect(page.locator('.page-loading-content.is-pending')).toHaveCount(0)
}
async function audit(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations).toEqual([])
}

test('assistant Markdown is semantic and safe; response/code copy preserve source', async ({ page }) => {
  const state = await fixture(page), modelImageRequests = []
  page.on('request', request => { if (request.url().includes('image.example.invalid')) modelImageRequests.push(request.url()) })
  await openChat(page)
  await expect(page.locator('.studio-markdown h2')).toHaveText('A clear plan')
  await expect(page.locator('.studio-markdown strong')).toHaveText('structured')
  await expect(page.locator('.studio-markdown ol')).toHaveCSS('list-style-type', 'decimal')
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.locator('.studio-message-user')).toContainText('**literal prompt** <img src="x">')
  expect(await page.evaluate(() => window.injectedMarkdown)).toBeUndefined()
  await expect(page.locator('.studio-assistant-markdown img')).toHaveCount(0)
  await expect(page.locator('.studio-assistant-markdown a[href^="javascript:"]')).toHaveCount(0)
  expect(modelImageRequests).toEqual([])
  await page.getByRole('button', { name: 'Copy response', exact: true }).click()
  expect(await page.evaluate(() => window.lastCopied)).toBe(markdown)
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  expect(await page.evaluate(() => window.lastCopied)).toBe(code)
  await page.evaluate(() => { window.clipboardFails = true })
  await page.getByRole('button', { name: 'Copy response', exact: true }).click()
  await expect(page.getByText('Could not copy response. Select it and copy manually.', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

for (const [name, run, message] of [
  ['withheld', { status: 'blocked_output', response_withheld: true, response_text: 'WITHHELD_SECRET' }, 'Response withheld'],
  ['expired', { content_expired: true, prompt: 'EXPIRED_PROMPT', response_text: 'EXPIRED_REPLY' }, 'Stored text has expired; the decision record remains.'],
  ['blocked input', { status: 'blocked_input', response_text: null }, 'Prompt blocked by policy'],
  ['checking error', { status: 'validation_error', response_text: null, input_evaluation: { errors: ['detector_timeout'], rule_results: [] } }, 'Security check could not complete'],
]) test(`${name} retains its explanation and does not expose copyable output`, async ({ page }) => {
  const state = await fixture(page, { run }); await openChat(page)
  await expect(page.getByText(message, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveCount(0)
  await expect(page.getByText(/WITHHELD_SECRET|EXPIRED_PROMPT|EXPIRED_REPLY/)).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('model settings and submit retain the existing API payload and pending guards', async ({ page }) => {
  const state = await fixture(page); await openChat(page)
  await page.getByRole('combobox', { name: /Integration/ }).selectOption(id(81))
  await expect(page.getByRole('combobox', { name: /Model/ })).toHaveValue('alternate-model')
  await page.getByRole('button', { name: 'Generation options', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Temperature', exact: true }).fill('0.5')
  await page.getByRole('spinbutton', { name: 'Max tokens', exact: true }).fill('2048')
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: 'Continue the conversation' }).fill('A follow-up')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Waiting for reply', exact: true })).toBeDisabled()
  await expect(page.getByText('A newly permitted reply.', { exact: true })).toBeVisible()
  expect(state.posts).toHaveLength(1)
  expect(state.posts[0].body).toEqual({ integration_id: id(81), model: 'alternate-model', prompt: 'A follow-up', temperature: 0.5, max_tokens: 2048, conversation_id: chatId })
  expect(state.posts[0].key).toBeTruthy(); expect(state.errors).toEqual([])
})

test('history failure preserves the draft and recovery restores sending', async ({ page }) => {
  const state = await fixture(page, { historyFail: true }); await page.goto('/#prompt-studio')
  await expect(page.getByText('Could not load chats', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Start a conversation' }).fill('Keep this draft')
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
  state.historyFail = false; await page.getByRole('button', { name: 'Retry loading chats', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Start a conversation' })).toHaveValue('Keep this draft')
  expect(state.posts).toHaveLength(0); expect(state.errors).toEqual([])
})

test('history pagination and earlier-message loading call existing data actions', async ({ page }) => {
  const state = await fixture(page, { paged: true, older: true }); await openChat(page)
  await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click()
  await expect(page.getByText('An earlier permitted reply.', { exact: true })).toBeVisible()
  await expect(page.locator('.studio-turn')).toHaveCount(2)
  await page.locator('.studio-history-pager').getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: /Synthetic chat 21/ }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic chat 21', exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test('required policy setup pauses sending with actionable guidance', async ({ page }) => {
  const state = await fixture(page, { context: { integrations: [{ id: connectionId, provider: 'gemini', account_name: 'Product workspace', models: ['demo-model'] }], groups: [], require_active_policy: true, input_policy_coverage: { [connectionId]: false }, enforcement_ready: true } })
  await page.goto('/#prompt-studio')
  await expect(page.getByText('Policy setup required', { exact: true })).toBeVisible()
  await expect(page.getByText('Ask your administrator to assign your policy groups.', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Start a conversation' }).fill('A draft')
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
  expect(state.posts).toHaveLength(0)
})

for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) test(`responsive reading, focus and accessibility ${width}px`, async ({ page }) => {
  const state = await fixture(page); await page.setViewportSize({ width, height }); await openChat(page)
  await expect(page.getByRole('button', { name: 'New chat', exact: true })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const composer = await page.locator('.studio-composer').boundingBox()
  expect(composer.y + composer.height).toBeLessThanOrEqual(height + 1)
  if (width <= 960) {
    await page.getByRole('button', { name: 'Chats', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Chats', exact: true })).toBeVisible()
    const drawer = await page.getByRole('dialog', { name: 'Chats', exact: true }).boundingBox()
    expect(drawer.x).toBeGreaterThanOrEqual(0)
    expect(drawer.y).toBeGreaterThanOrEqual(0)
    expect(drawer.x + drawer.width).toBeLessThanOrEqual(width + 1)
    expect(drawer.y + drawer.height).toBeLessThanOrEqual(height + 1)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Chats', exact: true })).toBeFocused()
  }
  await page.locator('.studio-workspace-body').evaluate(el => { el.scrollTop = 0 })
  await audit(page)
  await page.screenshot({ path: `/tmp/averiq-studio-implemented-${width}.png` })
  await page.getByRole('button', { name: 'Generation options', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Temperature', exact: true })).toBeVisible()
  await audit(page)
  await page.keyboard.press('Escape')
  expect(state.errors).toEqual([])
})

test('existing conversation, draft, retry and idempotency regression', async ({ baseURL }) => {
  const { stdout } = await runCommand(process.execPath, ['tests/conversations.browser.cjs'], { env: { ...process.env, UI_TEST_URL: baseURL }, timeout: 90000 })
  expect(stdout).toContain('Conversation browser checks passed')
})

test('existing administrator policy and group regression', async ({ baseURL }) => {
  const { stdout } = await runCommand(process.execPath, ['tests/admin-policy-groups.browser.cjs'], { env: { ...process.env, UI_TEST_URL: baseURL }, timeout: 90000 })
  expect(stdout).toContain('Admin browser checks passed')
})
