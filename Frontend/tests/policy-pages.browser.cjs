// All API calls are intercepted. No application data or detector services are used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5174';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], requestedPages = new Set(), writes = [];
    let role = 'org_admin', rejectNextSave = false;
    const groups = Array.from({ length: 235 }, (_, i) => ({ _id: `g${i + 1}`,
      name: `Group ${String(i + 1).padStart(3, '0')}`, description: i % 2 ? 'Engineering and product teams' : 'Regional operations and support', member_count: i % 35 }));
    const policies = ['dlp', 'guardrail'].map((kind) => ({ _id: kind, category: kind, name: `${kind} policy`,
      version: 1, entry_count: 145, scope: { group_ids: ['g1', 'g220'], integration_ids: [] },
      selected_entry_ids: [`${kind}-1`, `${kind}-2`], entries: Array.from({ length: 145 }, (_, i) => ({
        id: `${kind}-${i + 1}`, title: `${kind === 'dlp' ? 'DLP' : 'Guardrail'} check ${String(i + 1).padStart(3, '0')}`,
        description: i % 2 ? 'Detect sensitive information in prompts and generated responses.' : 'Check content against this configured security rule.',
        categories: [i % 3 ? 'Personal information' : 'Financial data'],
      })) }));
    const selections = (kind, groupId) => {
      const policy = policies.find((item) => item.category === kind);
      return policy.group_entry_selections?.find((item) => item.group_id === groupId)?.selected_entry_ids
        ?? (policy.scope.group_ids.includes(groupId) ? policy.selected_entry_ids : []);
    };
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('centurion.auth.token', 'mock-local-only'));
    await page.route('https://**.cytex.io/**', (route) => route.abort());
    await page.route(`${base}/api/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { id: 'test-user', role, first_name: 'Test', last_name: 'Admin', company: { name: 'Mock organization' } } });
      if (url.pathname === '/api/notifications') return route.fulfill({ json: { items: [] } });
      if (url.pathname === '/api/groups') {
        const number = Number(url.searchParams.get('page') || 1); requestedPages.add(number);
        return route.fulfill({ json: { items: groups.slice((number - 1) * 100, number * 100), total: groups.length } });
      }
      if (url.pathname === '/api/policies/capabilities') return route.fulfill({ json: { remote_detection_enabled: true, enforcement_ready: true } });
      if (url.pathname === '/api/policies') return route.fulfill({ json: { items: policies, total: 2 } });
      if (url.pathname.endsWith('/group-selections') && route.request().method() === 'PUT') {
        if (rejectNextSave) { rejectNextSave = false; return route.fulfill({ status: 409, json: { detail: 'Policy changed. Reload and try again.' } }); }
        const body = route.request().postDataJSON(), policy = policies.find((p) => url.pathname.includes(`/${p._id}/`));
        assert.equal(body.version, policy.version); writes.push(body);
        const mapped = new Map(policy.scope.group_ids.map((id) => [id, selections(policy.category, id)]));
        for (const id of body.group_ids) {
          if (body.selected_entry_ids.length) mapped.set(id, body.selected_entry_ids);
          else mapped.delete(id);
        }
        policy.scope.group_ids = [...mapped.keys()];
        policy.group_entry_selections = [...mapped].map(([group_id, selected_entry_ids]) => ({ group_id, selected_entry_ids }));
        policy.version += 1;
        return route.fulfill({ json: { policy } });
      }
      if (url.pathname === '/api/prompt-workspace/context') return route.fulfill({ json: { integrations: [], groups: [] } });
      if (url.pathname === '/api/prompt-workspace/runs') return route.fulfill({ json: { items: [], total: 0 } });
      errors.push(`Unexpected API: ${url.pathname}`); return route.abort();
    });
    const dialog = page.getByRole('dialog');
    const openGroup = async (kind, name) => page.getByRole('button', { name: `Configure ${kind} checks for ${name}`, exact: true }).click();
    const save = async () => { await dialog.getByRole('button', { name: 'Save assignment', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); };
    const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(`${base}/#dlp-policy`);
    await page.getByRole('heading', { name: 'Group assignments', exact: true }).waitFor();
    assert.deepEqual([...requestedPages], [1, 2, 3]);
    assert.equal(await page.locator('.policy-table-row').count(), 8);
    // Four checks, including one from the end of a large catalog.
    await openGroup('DLP', 'Group 002');
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check();
    assert.equal(await dialog.getByRole('button', { name: 'Save assignment', exact: true }).isDisabled(), true);
    for (const n of ['001', '002', '003']) await dialog.getByRole('checkbox', { name: `Select DLP check ${n}`, exact: true }).check();
    await dialog.getByLabel('Search checks', { exact: true }).fill('145');
    await dialog.getByRole('checkbox', { name: 'Select DLP check 145', exact: true }).check();
    await dialog.getByLabel('Search checks', { exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Selected 4', exact: true }).click();
    assert.equal(await dialog.locator('.check-picker-row').count(), 4);
    await dialog.getByRole('radio', { name: /All 145 checks/ }).check();
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check();
    assert.equal(await dialog.getByRole('button', { name: 'Selected 4', exact: true }).count(), 1);
    await dialog.getByRole('button', { name: 'Selected 4', exact: true }).click();
    await page.screenshot({ path: '/tmp/policy-group-checks-editor.png', fullPage: true });
    await save();
    assert.deepEqual(selections('dlp', 'g2'), ['dlp-1', 'dlp-2', 'dlp-3', 'dlp-145']);
    assert.deepEqual(selections('dlp', 'g1'), ['dlp-1', 'dlp-2']);
    assert.deepEqual(selections('dlp', 'g220'), ['dlp-1', 'dlp-2']);
    // Save all checks for a different group, then prove reload preserves both selections.
    await openGroup('DLP', 'Group 003');
    await dialog.getByRole('radio', { name: /All 145 checks/ }).check();
    await save();
    assert.equal(selections('dlp', 'g3').length, 145);
    await page.reload();
    await openGroup('DLP', 'Group 002');
    assert.equal(await dialog.getByRole('radio', { name: /Choose specific checks/ }).isChecked(), true);
    await dialog.getByRole('button', { name: 'Selected 4', exact: true }).click();
    assert.equal(await dialog.locator('.check-picker-row').count(), 4);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    // A failed save retains the draft and does not affect persisted state.
    await openGroup('DLP', 'Group 002');
    await dialog.getByRole('checkbox', { name: 'Select DLP check 005', exact: true }).check();
    rejectNextSave = true;
    await dialog.getByRole('button', { name: 'Save assignment', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByRole('checkbox', { name: 'Select DLP check 005', exact: true }).isChecked(), true);
    assert.equal(selections('dlp', 'g2').length, 4);
    page.once('dialog', (event) => event.dismiss());
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await dialog.count(), 1);
    page.once('dialog', (event) => event.accept());
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    // Bulk assign category results across pages to groups from different list pages.
    await page.getByRole('button', { name: /Assign to groups/ }).click();
    await dialog.getByRole('button', { name: 'Next group page', exact: true }).click();
    await dialog.getByLabel('Assign to Group 009', { exact: true }).check();
    await dialog.getByLabel('Search groups', { exact: true }).fill('Group 230');
    await dialog.getByLabel('Assign to Group 230', { exact: true }).check();
    await dialog.getByRole('button', { name: /Choose checks/ }).click();
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check();
    await dialog.getByLabel('Category', { exact: true }).selectOption('Financial data');
    await dialog.getByRole('button', { name: 'Select results (49)', exact: true }).click();
    await save();
    assert.equal(selections('dlp', 'g9').length, 49);
    assert.deepEqual(selections('dlp', 'g9'), selections('dlp', 'g230'));
    assert.equal(selections('dlp', 'g2').length, 4);
    // Removing a single assignment leaves other groups and the other policy intact.
    page.once('dialog', (event) => event.accept());
    await page.getByRole('button', { name: 'Remove DLP assignment from Group 003', exact: true }).click();
    await page.getByText('✓ DLP assignment removed from Group 003.', { exact: true }).waitFor();
    assert.equal(selections('dlp', 'g3').length, 0);
    assert.equal(selections('dlp', 'g2').length, 4);
    await page.screenshot({ path: '/tmp/policy-group-checks-desktop.png', fullPage: true });
    // Guardrail has an independent six-check selection for the same group.
    await page.getByRole('button', { name: 'Guardrail policy', exact: true }).click();
    await openGroup('Guardrail', 'Group 002');
    await dialog.getByRole('radio', { name: /Choose specific checks/ }).check();
    for (const n of ['001', '002', '003', '004', '005', '006']) await dialog.getByRole('checkbox', { name: `Select Guardrail check ${n}`, exact: true }).check();
    await save();
    assert.equal(selections('guardrail', 'g2').length, 6);
    assert.equal(selections('dlp', 'g2').length, 4);
    await page.screenshot({ path: '/tmp/guardrail-group-checks-desktop.png', fullPage: true });
    // Desktop/tablet/mobile, focus trap, and explicit discard on Escape.
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await noOverflow();
      await openGroup('Guardrail', 'Group 002');
      await noOverflow();
      assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth), false);
      await dialog.getByRole('button', { name: 'Selected 6', exact: true }).click();
      if (width === 390) await page.screenshot({ path: '/tmp/policy-group-checks-mobile-editor.png', fullPage: true });
      const last = dialog.getByRole('button', { name: 'Cancel', exact: true });
      await last.focus(); await page.keyboard.press('Tab');
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
      await dialog.getByRole('button', { name: 'Clear selection', exact: true }).click();
      assert.equal(await dialog.getByRole('button', { name: 'Save assignment', exact: true }).isDisabled(), true);
      page.once('dialog', (event) => event.accept());
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
    await page.screenshot({ path: '/tmp/policy-group-checks-mobile.png', fullPage: true });
    // Legacy group deep links remain usable.
    await page.goto(`${base}/#dlp-policy?group_id=g220`);
    await page.getByRole('button', { name: 'Configure DLP checks for Group 220', exact: true }).waitFor();
    assert.equal(await page.locator('.policy-table-row').count(), 1);
    await openGroup('DLP', 'Group 220');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    role = 'user';
    await page.reload();
    await page.getByRole('heading', { name: 'Prompt Studio', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Group assignments', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${writes.length} mocked saves; DLP four-check and all-check assignment; Guardrail six-check assignment; group isolation; bulk selection over 145 checks and 235 groups; reload; failed-save preservation; discard; removal; desktop/tablet/mobile; keyboard and regular-user restrictions.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
