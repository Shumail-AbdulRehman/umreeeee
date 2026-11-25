import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const header = 'first_name,last_name,email,department\n'
const csv = header + 'Maya,Shah,maya@example.test,Operations\nIan,Smith,ian@example.test,Support\n'
const receiptId = '000000000000000000000011'
const people = [
  { row: 2, first_name: 'Maya', last_name: 'Shah', email: 'maya@example.test', department: 'Operations', issues: [] },
  { row: 3, first_name: 'Ian', last_name: 'Smith', email: 'ian@example.test', department: 'Support', issues: [] },
]
const ready = { rows: people, file_issues: [], invalid: 0, ready: 2, validation_proof: 'test-proof' }
const invalid = {
  ...ready, ready: 1, invalid: 1, validation_proof: null,
  rows: [people[0], { ...people[1], issues: [{ row: 3, field: 'email', reason: 'Email is already registered.',
    fix: 'Remove this row or use the correct staff email address.' }] }],
}

async function setup(page, options = {}) {
  const state = { commits: [], validations: [], errors: [], sent: false, receiptSaved: false, singleInvites: [] }
  const user = { id: 'admin', role: options.role || 'org_admin', first_name: 'Ria', last_name: 'Khan', email: 'admin@example.test',
    is_active: true, is_email_verified: true, group_ids: [], company: { id: 'staff', name: 'Northstar Labs', status: 'active' } }
  const empty = { items: [], page: 1, page_size: 20, total: 0, unread_count: 0 }
  const receipt = () => ({
    id: receiptId, created_at: '2026-11-25T12:00:00Z', accounts_created: 2,
    invitations_sent: state.sent ? 1 : 0, invitations_pending: state.sent ? 0 : 2, needs_attention: state.sent ? 1 : 0,
    rows: people.map((row, index) => ({ ...row, user_id: String(index + 1), delivery: state.sent ? (index ? 'failed' : 'sent') : 'pending' })),
  })
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'staff-import-browser-test'))
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route(url => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const respond = (json, status = 200) => route.fulfill({ json, status })
    if (pathname === '/api/auth/me') return respond(user)
    if (pathname === '/api/users' && request.method() === 'POST') {
      state.singleInvites.push(request.postDataJSON())
      return respond({ message: 'Invitation created' }, 201)
    }
    if (pathname === '/api/users/imports/validate') {
      const content = request.postData()
      state.validations.push(content)
      if (!content.startsWith(header)) return respond({ ...ready, rows: [], ready: 0, validation_proof: null,
        file_issues: [{ row: 1, reason: 'Missing required column: department.', fix: 'Add the department column.' }] })
      return respond(content.includes('duplicate@') ? invalid : ready)
    }
    if (pathname === '/api/users/imports') {
      const headers = request.headers()
      state.commits.push({ key: headers['idempotency-key'], proof: headers['x-import-proof'], content: request.postData() })
      if (options.conflict) return respond({ detail: { message: 'The CSV has issues.' }, validation: invalid }, 409)
      state.receiptSaved = true
      if (options.uncertain && state.commits.length === 1) return route.abort('failed')
      return respond(receipt(), 202)
    }
    if (pathname === `/api/users/imports/${receiptId}` || pathname.startsWith('/api/users/imports/by-request/')) {
      return state.receiptSaved ? respond(receipt()) : respond({ detail: { message: 'Staff import not found.' } }, 404)
    }
    return respond(empty)
  })
  return state
}

async function selectCsv(page, content, name = 'staff.csv') {
  await page.getByLabel('Staff CSV file').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) })
}

async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width)
  const { violations } = await new AxeBuilder({ page }).include('.staff-import').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
}

test('validates, filters and replaces the CSV, then tracks the receipt and preserves single invite', async ({ page }, info) => {
  const state = await setup(page)
  await page.goto('/#users')
  await page.getByRole('link', { name: 'Import staff' }).click()
  await expect(page.getByRole('heading', { name: 'Upload a staff list' })).toBeVisible()
  await checkLayout(page)
  await page.screenshot({ path: info.outputPath('upload-desktop.png') })
  const template = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download template' }).click()
  expect((await template).suggestedFilename()).toBe('staff-template.csv')

  await selectCsv(page, 'first_name,last_name,email\nMaya,Shah,maya@example.test')
  await expect(page.getByRole('alert')).toContainText('Missing required column: department.')
  await selectCsv(page, csv.replace('ian@example.test', 'duplicate@example.test'))
  await expect(page.getByRole('heading', { name: 'Review CSV rows' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Import staff', exact: true })).toBeDisabled()
  await expect(page.getByText('Email is already registered.', { exact: false })).toBeVisible()
  await page.getByLabel('Show issues only').check()
  await expect(page.getByText('Maya Shah')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download issues' }).click()
  const issues = await download
  expect(issues.suggestedFilename()).toBe('staff-import-issues.csv')
  expect(await readFile(await issues.path(), 'utf8')).toContain('Email is already registered.')
  expect(state.commits).toHaveLength(0)

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Replace CSV' }).click(),
  ])
  await chooser.setFiles({ name: 'corrected.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText('All rows passed validation')).toBeVisible()
  await page.getByRole('button', { name: 'Import 2 staff' }).click()
  await expect(page).toHaveURL(new RegExp(`import=${receiptId}$`))
  await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible()
  await expect(page.getByText('Invitations are queued.', { exact: false })).toBeVisible()
  state.sent = true
  await expect(page.getByText('Delivery failed')).toBeVisible()
  await checkLayout(page)
  await page.screenshot({ path: info.outputPath('receipt-desktop.png') })
  await page.reload()
  await expect(page.getByText('1 invitation needs attention')).toBeVisible()
  expect(state.commits).toEqual([{ key: expect.stringMatching(/^[0-9a-f-]{36}$/), proof: 'test-proof', content: csv }])

  await page.getByRole('link', { name: 'Back to Users', exact: true }).last().click()
  await page.getByRole('button', { name: 'Invite user', exact: true }).click()
  await page.getByLabel('First name').fill('Mina')
  await page.getByLabel('Last name').fill('Ali')
  await page.getByLabel('Email').fill('mina@example.test')
  await page.getByLabel('Department').fill('Support')
  await page.getByRole('button', { name: 'Create invitation' }).click()
  await expect(page.getByText('Invitation created')).toBeVisible()
  expect(state.singleInvites).toEqual([expect.objectContaining({ email: 'mina@example.test', role: 'user' })])
  expect(state.errors).toEqual([])
})

test('shows a renewed row conflict at 320 px and keeps the import blocked', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 850 })
  const state = await setup(page, { conflict: true })
  await page.goto('/#users?import=1')
  await expect(page.getByRole('button', { name: 'Choose CSV file' })).toBeVisible()
  await selectCsv(page, csv)
  await expect(page.getByRole('heading', { name: 'Review CSV rows' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Replace CSV' })).toBeFocused()
  await page.getByRole('button', { name: 'Import 2 staff' }).click()
  await expect(page.getByRole('button', { name: 'Import staff', exact: true })).toBeDisabled()
  await expect(page.getByText('Fix 1 row to continue')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review CSV rows' })).toBeFocused()
  await checkLayout(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: info.outputPath('review-mobile.png'), fullPage: true })
  expect(state.commits).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('checks a lost commit response and opens the saved receipt without creating another batch', async ({ page }) => {
  const state = await setup(page, { uncertain: true })
  await page.goto('/#users?import=1')
  await expect(page.getByRole('button', { name: 'Choose CSV file' })).toBeVisible()
  await selectCsv(page, csv)
  const recovery = page.waitForRequest(request => request.url().includes('/api/users/imports/by-request/'))
  await page.getByRole('button', { name: 'Import 2 staff' }).click()
  expect((await recovery).url()).toContain(state.commits[0].key)
  await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Import another file' }).click()
  await expect(page.getByRole('heading', { name: 'Upload a staff list' })).toBeVisible()
  expect(state.commits).toHaveLength(1)
  expect(state.errors).toEqual([])
})
