import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { redTeamFixture, ids, id } from './fixtures/red-team-api.js'

async function open(page, testId) {
  await page.goto(testId ? `/#red-team?test=${testId}` : '/#red-team')
  await expect(page.locator('.red-team-page')).toBeVisible()
  await expect(page.locator('.page-loading-content.is-pending')).toHaveCount(0)
}
async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations).toEqual([])
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if ((page.viewportSize()?.width || 0) < 600) {
    const small = await page.locator('.red-team-page button, .red-team-page select, .red-team-page summary').evaluateAll((elements) => elements.filter((el) => {
      const rect = el.getBoundingClientRect()
      return el.getClientRects().length > 0 && (rect.height < 44 || rect.width < 44)
    }).map((el) => el.getAttribute('aria-label') || el.textContent.trim()))
    expect(small).toEqual([])
  }
}
async function fillNew(page) {
  await page.getByLabel('Test name', { exact: true }).fill('Synthetic browser test')
  await page.getByLabel('Integration', { exact: true }).selectOption(ids.target)
  await page.getByText('Raw model', { exact: true }).click()
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
}

test('empty list, not-ready strip and new test guidance', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true, capabilities: { worker_observed: false } })
  await open(page)
  await expect(page.getByText('No Red Team tests yet', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Test runner not responding' })).toContainText('wait in the queue')
  await page.getByRole('button', { name: 'New test', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'New Red Team test' })).toBeVisible()
  expect(state.errors).toEqual([])
})

test('editor plugins, strategies, judge, limits and Advanced send the contract', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true })
  await page.goto('/#red-team?new=1')
  const launch = page.getByRole('button', { name: 'Save and launch', exact: true })
  await expect(launch).toBeDisabled()
  await fillNew(page)
  for (const name of ['Base64', 'Role-play', 'Authority']) await page.getByRole('checkbox', { name, exact: false }).check()
  await page.getByLabel('Attacks per plugin and strategy', { exact: true }).fill('10')
  await expect(launch).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('100')
  await page.getByLabel('Attacks per plugin and strategy', { exact: true }).fill('3')
  await page.getByRole('checkbox', { name: /Use an LLM judge/ }).check()
  await expect(page.getByLabel('Judge integration', { exact: true })).toHaveValue(ids.judge)
  await expect(page.getByLabel('Seed', { exact: true })).toBeHidden()
  await page.getByText('Advanced', { exact: true }).click()
  await page.getByLabel('Seed', { exact: true }).fill('42')
  await page.getByLabel('Temperature', { exact: true }).fill('0.5')
  await launch.click()
  await expect(page.getByRole('progressbar', { name: 'Finished attacks', exact: true })).toBeVisible()
  expect(state.saves[0]).toMatchObject({ format: 'plugins', tests_per_plugin: 3, seed: 42, temperature: .5,
    threshold_score: .8, strategies: ['base64', 'roleplay', 'authority'], judge: { integration_id: ids.judge, model: 'judge-model' } })
  expect(state.saves[0].plugins).toHaveLength(8)
  expect(state.errors).toEqual([])
})

test('save draft, reopen, ambiguous launch retries reuse key and start polling', async ({ page }) => {
  const state = await redTeamFixture(page, { empty: true, failLaunch: true })
  await page.goto('/#red-team?new=1')
  await fillNew(page)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit draft test' })).toBeVisible()
  await expect(page.getByLabel('Test name')).toHaveValue('Synthetic browser test')
  await page.getByRole('button', { name: 'Back to tests' }).click()
  await page.getByRole('button', { name: 'Synthetic browser test', exact: true }).click()
  await page.getByRole('button', { name: 'Save and launch' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Save and launch' }).click()
  await expect(page.getByRole('progressbar', { name: 'Finished attacks', exact: true })).toBeVisible()
  expect(state.launches).toHaveLength(2)
  expect(state.launches[0]).toEqual(state.launches[1])
  const before = state.requests.filter((r) => r.path === `/api/red-team/tests/${id(20)}`).length
  await expect.poll(() => state.requests.filter((r) => r.path === `/api/red-team/tests/${id(20)}`).length).toBeGreaterThan(before)
  expect(state.errors).toEqual([])
})

test('running view cancel consequences, keep running and cancel once', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.running)
  await expect(page.getByRole('progressbar', { name: 'Finished attacks', exact: true })).toHaveAttribute('aria-valuenow', '46')
  await expect(page.getByText('Not yet', { exact: true })).toBeVisible()
  const trigger = page.getByRole('button', { name: 'Cancel test', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('may cost money')
  await expect(dialog).toContainText('will not run')
  await dialog.getByRole('button', { name: 'Keep running' }).click()
  await expect(trigger).toBeFocused()
  expect(state.cancels).toBe(0)
  await trigger.click()
  await dialog.getByRole('button', { name: 'Cancel test', exact: true }).click()
  await expect(page.getByText(/Cancelled after 46 of 101 attacks/)).toBeVisible()
  expect(state.cancels).toBe(1)
  expect(state.errors).toEqual([])
})

test('report risk comparison, attack success, threshold and trend use API figures', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  const summary = page.getByRole('region', { name: 'Report summary' })
  await expect(summary).toContainText('9.4')
  await expect(summary).toContainText('4.1')
  await expect(summary).toContainText('lowered risk by 5.3 points')
  await expect(summary).toContainText('21.6%')
  await expect(summary).toContainText('below the 80% threshold')
  await expect(summary).toContainText('0.3 lower')
  await expect(page.getByText('101 model calls · 17 judge calls')).toBeVisible()
  expect(state.errors).toEqual([])
})

test('plugin risk ordering and strategy breakdown preserve API order', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  const table = page.getByRole('region', { name: 'What broke, by plugin' })
  await expect(table.getByRole('row').nth(1)).toContainText('System prompt leak')
  await expect(table.getByRole('row').nth(1)).toContainText('9.0%')
  await expect(table.getByRole('row').nth(1)).toContainText('Authority')
  await expect(page.getByText('Authority and Role-play broke through most often.')).toBeVisible()
  expect(state.errors).toEqual([])
})

test('compliance keyboard tabs, failed evidence and untested reasons', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(4)
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('No selected plugin maps to it')
  await expect(page.getByRole('tabpanel').locator('li').first()).toContainText('Failed')
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  expect(state.errors).toEqual([])
})

test('result filters, decoded evidence, judged label, pairing and dialog focus', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  await page.getByRole('button', { name: /^Unsafe/ }).click()
  await expect.poll(() => state.requests.some((r) => r.query.verdict === 'fail')).toBe(true)
  await expect(page.getByText('Unsafe · judged', { exact: true })).toBeVisible()
  const opener = page.getByRole('button', { name: 'View attack 1', exact: true })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('SYNTH-PRIVATE-ABCDEF123456')
  await expect(dialog).toContainText('Same attack with policies')
  await page.keyboard.press('Shift+Tab')
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await page.getByRole('combobox', { name: 'Evidence', exact: true }).selectOption('judge')
  await page.getByRole('button', { name: 'View attack 2', exact: true }).click()
  await expect(dialog).toContainText('This is a judgement, not exact proof')
  await page.keyboard.press('Escape')
  expect(state.errors).toEqual([])
})

for (const [kind, text, action] of [
  ['cancelled', 'Cancelled after 46 of 101 attacks.', 'Clone and run again'],
  ['failed', 'This test failed: all 101 attacks errored.', 'Open Integrations'],
  ['nojudge', '6 undecided results are', 'Clone with a judge'],
  ['legacy', 'This test used the earlier category format.', 'Clone as protected'],
]) test(`${kind} report explains its state and exposes recovery`, async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids[kind])
  await expect(page.getByText(text, { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible()
  if (kind === 'cancelled') {
    const summary = page.getByRole('region', { name: 'Report summary' })
    await expect(summary).not.toContainText('9.4')
  }
  expect(state.errors).toEqual([])
})

test('JSON and CSV downloads contain v3 columns', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.raw)
  for (const format of ['JSON', 'CSV']) {
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: `Export ${format}`, exact: true }).click()
    const download = await downloaded
    expect(download.suggestedFilename()).toContain(format.toLowerCase())
    const stream = await download.createReadStream()
    let body = ''
    for await (const chunk of stream) body += chunk.toString()
    expect(body).toContain('plugin_id')
    expect(body).toContain('verdict_source')
  }
  expect(state.errors).toEqual([])
})

for (const flag of ['response_withheld', 'content_expired']) test(`${flag} hides raw and decoded reply`, async ({ page }) => {
  const state = await redTeamFixture(page, { detailFlags: { [flag]: true } })
  await open(page, ids.raw)
  await page.getByRole('button', { name: 'View attack 1' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('SYNTH-PRIVATE-ABCDEF123456')
  await expect(page.getByRole('dialog')).toContainText(flag === 'response_withheld' ? 'withheld' : 'expired')
  expect(state.errors).toEqual([])
})

for (const width of [1440, 390]) test(`list editor running report and dialog accessibility ${width}px`, async ({ page }) => {
  const state = await redTeamFixture(page)
  await page.setViewportSize({ width, height: 900 })
  await open(page)
  await audit(page); await noOverflow(page)
  if (width === 390) expect((await page.getByRole('button', { name: 'New test', exact: true }).first().boundingBox()).height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `/tmp/red-team-list-${width}.png`, fullPage: true })
  await page.goto('/#red-team?new=1')
  await expect(page.getByLabel('Test name')).toBeVisible()
  await audit(page); await noOverflow(page)
  await page.screenshot({ path: `/tmp/red-team-editor-${width}.png`, fullPage: true })
  await open(page, ids.running)
  await expect(page.getByRole('progressbar', { name: 'Finished attacks', exact: true })).toBeVisible()
  await audit(page); await noOverflow(page)
  await page.getByRole('button', { name: 'Cancel test' }).click()
  await audit(page)
  await page.keyboard.press('Escape')
  await open(page, ids.raw)
  await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible()
  await audit(page); await noOverflow(page)
  if (width === 390) {
    const overlaps = await page.getByRole('tabpanel').locator('li').evaluateAll((rows) => rows.some((row) => {
      const name = document.createRange()
      name.selectNodeContents(row.children[1])
      const a = name.getBoundingClientRect(), b = row.children[2].getBoundingClientRect()
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    }))
    expect(overlaps).toBe(false)
  }
  await page.screenshot({ path: `/tmp/red-team-report-${width}.png`, fullPage: true })
  const opener = page.getByRole('button', { name: 'View attack 1' })
  await opener.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await audit(page); await noOverflow(page)
  const bounds = await dialog.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900)
  await page.screenshot({ path: `/tmp/red-team-dialog-${width}.png`, fullPage: true })
  if (width === 390) {
    expect((await dialog.getByRole('button', { name: 'Close' }).boundingBox()).height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    expect((await opener.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('region', { name: 'Results', exact: true }).getByRole('table')).toHaveCSS('display', 'block')
  }
  expect(state.errors).toEqual([])
})

test('legacy clone preserves categories through editor save and launch', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.legacy)
  await page.getByRole('button', { name: 'Clone as protected', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit draft test' })).toBeVisible()
  await expect(page.getByLabel('Attack count', { exact: true })).toHaveValue('1')
  await expect(page.getByRole('checkbox', { name: 'direct injection', exact: true })).toBeChecked()
  await page.getByLabel('Attack count', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Save and launch', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: 'Finished attacks', exact: true })).toHaveAttribute('aria-valuemax', '7')
  expect(state.saves[0]).toMatchObject({ format: 'categories', attack_categories: ['direct_injection'], num_attacks: 2 })
  expect(state.saves[0]).not.toHaveProperty('plugins')
  expect(state.launches).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('protected report and attack dialog label the paired raw run', async ({ page }) => {
  const state = await redTeamFixture(page)
  await open(page, ids.protected)
  await expect(page.getByRole('columnheader', { name: 'Raw model', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'With policies', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'View attack 1', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Same attack without policies')
  expect(state.errors).toEqual([])
})
