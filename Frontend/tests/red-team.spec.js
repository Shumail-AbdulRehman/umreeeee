import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { redTeamFixture, ids, id } from './fixtures/red-team-api.js'

async function open(page, testId = '') {
  await page.goto(testId ? `/#red-team?test=${testId}` : '/#red-team')
  await expect(page.locator('.red-team-page')).toBeVisible()
  await expect(page.locator('.page-loading-content.is-pending')).toHaveCount(0)
}

async function fillEditor(page, { protectedMode = false } = {}) {
  await page.getByLabel('Test name', { exact: true }).fill('Synthetic browser test')
  await page.getByLabel('Integration', { exact: true }).selectOption(ids.target)
  await page.getByLabel('Purpose', { exact: true }).fill('Test whether the support bot protects private customer records.')
  await page.getByRole('checkbox', { name: /System Prompt Disclosure/ }).check()
  await page.getByRole('checkbox', { name: /Base64/ }).check()
  await page.getByLabel('Grader integration', { exact: true }).selectOption(ids.grader)
  if (protectedMode) {
    await page.getByText('With policies', { exact: true }).click()
    await page.getByLabel('Run as', { exact: true }).selectOption(ids.subject)
  }
}

async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(result.violations).toEqual([])
}

test('creates, previews and launches a Promptfoo draft with one idempotency key', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true })
  await page.goto('/#red-team?new=1')
  await expect(page.getByRole('button', { name: 'Launch test' })).toBeDisabled()
  await fillEditor(page)
  const yaml = page.getByRole('region', { name: 'promptfoo config YAML' })
  await expect(yaml).toContainText('prompt-extraction')
  await expect(yaml).toContainText('base64')
  await expect(yaml).not.toContainText('apiKey')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('heading', { name: 'Edit draft test' })).toBeVisible()
  await page.getByRole('button', { name: 'Launch test' }).click()
  await expect(page.getByRole('progressbar', { name: 'Executed attacks' })).toBeVisible()
  const launched = state.tests[id(20)]
  launched.status = 'generating'
  launched.progress.phase = 'generating'
  await expect(page.getByRole('heading', { name: 'Generating attacks (promptfoo hosted)' })).toBeVisible()
  launched.status = 'running'
  Object.assign(launched.progress, { phase: 'evaluating', executed: 3 })
  launched.counts.executed = 3
  await expect(page.getByRole('heading', { name: /Running attacks 3\/6/ })).toBeVisible()
  launched.status = 'completed'
  Object.assign(launched.progress, { phase: 'finished', executed: 6, graded: 6 })
  Object.assign(launched.counts, { executed: 6, graded: 6 })
  await expect(page.getByRole('region', { name: 'Report summary' })).toBeVisible()
  expect(state.saves[0]).toMatchObject({
    name: 'Synthetic browser test', purpose: 'Test whether the support bot protects private customer records.',
    plugins: ['prompt-extraction'], strategies: ['base64'],
    grader: { integration_id: ids.grader, model: 'judge-model' },
  })
  expect(state.launches).toHaveLength(1)
  expect(state.launches[0].key).toBeTruthy()
  expect(state.errors).toEqual([])
})

test('preview failure is explicit and unavailable Promptfoo disables launch', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true, capabilities: { promptfoo: { version: null, available: false, cloud_key_configured: false } } })
  state.failPreview = true
  await page.goto('/#red-team?new=1')
  await fillEditor(page)
  await page.getByRole('button', { name: 'Refresh preview' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not build the config preview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Launch test' })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Promptfoo runtime is unavailable')
  expect(state.errors).toEqual([])
})

test('generating and running states poll, show exact phases and cancel once', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.generating)
  await expect(page.getByRole('heading', { name: 'Generating attacks (promptfoo hosted)' })).toBeVisible()
  await expect.poll(() => state.requests.filter((request) => request.path.endsWith(ids.generating)).length).toBeGreaterThan(1)
  await open(page, ids.running)
  await expect(page.getByRole('heading', { name: /Running attacks 3\/6/ })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel test' }).click()
  await page.getByRole('button', { name: 'Keep running' }).click()
  expect(state.cancels).toBe(0)
  await page.getByRole('button', { name: 'Cancel test' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel test' }).click()
  await expect(page.getByText(/Cancelled after 3 of 6 attacks/)).toBeVisible()
  expect(state.cancels).toBe(1)
  expect(state.errors).toEqual([])
})

test('terminal report includes Promptfoo provenance, all nine frameworks and pairing', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  const summary = page.getByRole('region', { name: 'Report summary' })
  await expect(summary).toContainText('Generated by promptfoo 0.126.0')
  await expect(summary).toContainText('8.2')
  await expect(summary.getByRole('region', { name: 'Top plugin risks' })).toContainText('8.2')
  await expect(summary.getByRole('region', { name: 'Case outcomes' })).toContainText('Worked')
  await expect(page.getByRole('heading', { name: 'Policy comparison' })).toHaveCount(0)
  await expect(page.getByText('How these numbers are calculated')).toHaveCount(0)
  await expect(page.getByText('Limitations.', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open paired run' })).toBeVisible()
  const breakdown = page.getByRole('tablist', { name: 'Test breakdown' })
  await breakdown.getByRole('tab', { name: 'Plugins' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(breakdown.getByRole('tab', { name: 'Strategies' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('table', { name: 'By strategy' })).toBeVisible()
  const tabs = page.getByRole('tablist', { name: 'Framework' }).getByRole('tab')
  await expect(tabs).toHaveCount(9)
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(page.getByText(/Synthetic coverage, not certification/)).toBeVisible()
  expect(state.errors).toEqual([])
})

test('result filters, policy and grader details, and focus restoration work', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  await page.getByRole('button', { name: /^Unsafe/ }).click()
  await page.getByLabel('Source').selectOption('grader')
  await expect.poll(() => state.requests.some((request) => request.query.verdict === 'fail' && request.query.verdict_source === 'grader')).toBe(true)
  const opener = page.getByRole('button', { name: 'View attack 2' })
  await opener.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toContainText('promptfoo grader')
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await page.getByRole('button', { name: /^Defended/ }).click()
  await page.getByLabel('Source').selectOption('policy')
  const policyPlugin = state.tests[ids.raw].plugins[0]
  await page.getByRole('combobox', { name: 'Plugin', exact: true }).selectOption(policyPlugin)
  await page.getByRole('combobox', { name: 'Strategy', exact: true }).selectOption('base64')
  await expect.poll(() => state.requests.some((request) =>
    request.query.plugin === policyPlugin && request.query.strategy === 'base64')).toBe(true)
  await page.getByRole('button', { name: 'View attack 1' }).click()
  await expect(page.getByRole('dialog')).toContainText('Synthetic policy')
  expect(state.errors).toEqual([])
})

test('expired result content has an explicit fallback', async ({ page }) => {
  const state = await redTeamFixture(page, { detailFlags: { content_expired: true, prompt: null, response_text: null } })
  await open(page, ids.raw)
  await page.getByRole('button', { name: 'View attack 1' }).click()
  await expect(page.getByRole('dialog')).toContainText('The stored attack prompt has expired.')
  await expect(page.getByRole('dialog')).toContainText('The stored model reply has expired.')
  expect(state.errors).toEqual([])
})

test('protected draft preserves its subject and accepts an updated preview', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true })
  await page.goto('/#red-team?new=1')
  await fillEditor(page, { protectedMode: true })
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByRole('heading', { name: 'Edit draft test' })).toBeVisible()
  await expect(page.getByLabel('Run as')).toHaveValue(ids.subject)
  await expect(page.getByLabel('Grader integration')).toHaveValue(ids.grader)
  await page.getByRole('checkbox', { name: /PII via Direct Exposure/ }).check()
  await page.getByRole('button', { name: 'Refresh preview' }).click()
  await expect(page.getByRole('region', { name: 'promptfoo config YAML' })).toContainText('pii:direct')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect.poll(() => state.saves.at(-1)?.plugins).toContain('pii:direct')
  expect(state.tests[id(20)].subject_user_id).toBe(ids.subject)
  expect(state.errors).toEqual([])
})

test('target-call cap prevents saving or launching the draft', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true, capabilities: { limits: { max_target_calls: 1 } } })
  await page.goto('/#red-team?new=1')
  await fillEditor(page)
  await expect(page.getByRole('status')).toContainText('the limit is 1')
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Launch test' })).toBeDisabled()
  expect(state.saves).toHaveLength(0)
  expect(state.launches).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test('protected clone keeps its suite and launches straight into evaluating', async ({ page }) => {
  const state = await redTeamFixture(page, { noPair: true })
  await open(page, ids.raw)
  await page.getByRole('button', { name: 'Clone as protected' }).click()
  await expect(page.getByRole('heading', { name: 'Edit draft test' })).toBeVisible()
  await expect(page.getByText('With policies', { exact: true })).toBeVisible()
  const cloned = state.tests[id(21)]
  expect(cloned.comparison_group_id).toBe(state.tests[ids.raw].comparison_group_id)
  expect(cloned.suite_id).toBe(state.tests[ids.raw].suite_id)
  await expect(page.getByLabel('Purpose')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('checkbox', { name: /System Prompt Disclosure/ })).toBeDisabled()
  await expect(page.getByLabel('Grader integration')).toBeEnabled()
  await expect(page.getByRole('region', { name: 'promptfoo config YAML' })).toContainText('Reuses 6 stored test cases')
  await page.getByRole('button', { name: 'Launch test' }).click()
  await expect(page.getByRole('heading', { name: /Running attacks 0\/6/ })).toBeVisible()
  expect(cloned.progress.phase).toBe('evaluating')
  expect(state.launches).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('no-tests-generated has specific recovery and exports are downloadable', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.failed)
  await expect(page.getByRole('alert')).toContainText('promptfoo generated no attacks')
  await expect(page.getByRole('button', { name: 'Clone and try again' })).toBeVisible()
  await open(page, ids.raw)
  for (const format of ['JSON', 'CSV']) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: `Download ${format}` }).click()
    const download = await pending
    expect(download.suggestedFilename()).toContain(format.toLowerCase())
    const content = await readFile(await download.path(), 'utf8')
    if (format === 'CSV') expect(content).toContain(",'=safe")
    else expect(JSON.parse(content).results[0].verdict_source).toBe('policy')
  }
  expect(state.errors).toEqual([])
})

for (const width of [1440, 390]) test(`report and detail remain accessible at ${width}px with reduced motion`, async ({ page }) => {
  const state = await redTeamFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await open(page, ids.raw)
  await audit(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'View attack 1' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await audit(page)
  expect(state.errors).toEqual([])
})
