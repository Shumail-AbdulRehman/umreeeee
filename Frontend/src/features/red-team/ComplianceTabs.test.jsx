import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ComplianceTabs from './ComplianceTabs.jsx'

const owasp = {
  id: 'owasp', name: 'OWASP LLM Top 10', failed: 1, passed: 1, not_tested: 3,
  controls: [
    { key: 'llm01', id: 'owasp:llm:01', name: 'Prompt Injection', status: 'failed', worked: 2, decided: 4 },
    { key: 'llm02', id: 'owasp:llm:02', name: 'Sensitive Information Disclosure', status: 'passed', worked: 0, decided: 3 },
    { key: 'llm03', id: 'owasp:llm:03', name: 'Supply Chain', status: 'not_tested', reason: 'Plugin not offered' },
    { key: 'llm04', id: 'owasp:llm:04', name: 'Data and Model Poisoning', status: 'not_tested', reason: 'No selected plugin maps to it' },
    { key: 'llm05', id: 'owasp:llm:05', name: 'Improper Output Handling', status: 'not_tested', reason: 'No mapped attack was decided' },
  ],
}
const nist = {
  framework: 'nist', name: 'NIST AI RMF', totals: { failed: 0, passed: 0, not_tested: 1 },
  controls: [{ key: '1.1', id: 'nist:ai:measure:1.1', name: 'Appropriate metrics', status: 'not_tested', reason: 'No mapped attack was decided' }],
}
const atlas = {
  id: 'atlas', name: 'MITRE ATLAS', failed: 0, passed: 0, not_tested: 1,
  controls: [{ key: 'tactic', id: null, name: 'Tactic without an ID', status: 'not_tested', reason: 'Plugin not offered' }],
}
const eu = { id: 'eu', name: 'EU AI Act', failed: 0, passed: 0, not_tested: 0, controls: [] }
const report = { compliance: [eu, atlas, owasp, nist], provisional: false }

const tabs = () => within(screen.getByRole('tablist', { name: 'Framework' })).getAllByRole('tab')

function expectSelected(tab, allTabs = tabs()) {
  const panel = screen.getByRole('tabpanel', { name: tab.textContent })
  expect(panel.id).toBe(tab.getAttribute('aria-controls'))
  expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
  expect(panel.tabIndex).toBe(0)
  expect(screen.getAllByRole('tabpanel')).toEqual([panel])
  for (const item of allTabs) {
    expect(item.tabIndex).toBe(item === tab ? 0 : -1)
    expect(item.getAttribute('aria-selected')).toBe(String(item === tab))
    expect(document.getElementById(item.getAttribute('aria-controls')).hidden).toBe(item !== tab)
  }
  return panel
}

describe('ComplianceTabs', () => {
  it('orders the frameworks, exposes one tab stop and links the selected tab and panel', () => {
    render(<ComplianceTabs {...report} />)
    const allTabs = tabs()
    expect(allTabs.map((tab) => tab.firstChild.textContent)).toEqual([
      'OWASP LLM Top 10', 'NIST AI RMF', 'MITRE ATLAS', 'EU AI Act',
    ])
    expect(within(allTabs[0]).getByText('1 failed · 1 passed · 3 not tested')).toBeTruthy()
    expect(screen.getByText(/Synthetic coverage, not certification/)).toBeTruthy()
    const items = within(expectSelected(allTabs[0], allTabs)).getAllByRole('listitem')
    expect(items.map((item) => item.firstElementChild.textContent)).toEqual(owasp.controls.map(({ id }) => id))

    fireEvent.click(allTabs[1])
    expect(within(allTabs[1]).getByText('0 failed · 0 passed · 1 not tested')).toBeTruthy()
    expect(within(expectSelected(allTabs[1], allTabs)).getByText('Appropriate metrics')).toBeTruthy()
  })

  it('moves focus and selection with arrows, wrap and Home/End', () => {
    render(<ComplianceTabs {...report} />)
    const allTabs = tabs()
    allTabs[0].focus()
    expect(document.activeElement).toBe(allTabs[0])

    for (const [key, index] of [['ArrowRight', 1], ['ArrowLeft', 0], ['ArrowLeft', 3], ['ArrowRight', 0], ['End', 3], ['Home', 0]]) {
      fireEvent.keyDown(document.activeElement, { key })
      expect(document.activeElement).toBe(allTabs[index])
      expectSelected(allTabs[index], allTabs)
    }
    expect(fireEvent.keyDown(document.activeElement, { key: 'Tab' })).toBe(true)
  })

  it('focuses the first remaining framework when the focused one disappears', () => {
    const { rerender } = render(<ComplianceTabs {...report} />, { reactStrictMode: true })
    const [, nistTab] = tabs()
    nistTab.focus()
    fireEvent.click(nistTab)
    expect(document.activeElement).toBe(nistTab)

    rerender(<ComplianceTabs compliance={[atlas, owasp]} />)
    const [first] = tabs()
    expect(document.activeElement).toBe(first)
    expectSelected(first)

    rerender(<ComplianceTabs {...report} />)
    expect(document.activeElement).toBe(first)
    expectSelected(first)
  })

  it('preserves selection by ID while frameworks change and does not steal outside focus', () => {
    const view = (compliance) => <><button type="button">Outside</button><ComplianceTabs compliance={compliance} /></>
    const { rerender } = render(view(report.compliance))
    const atlasTab = tabs()[2]
    fireEvent.click(atlasTab)
    const outside = screen.getByRole('button', { name: 'Outside' })
    outside.focus()

    rerender(view([eu, atlas, nist]))
    expectSelected(atlasTab)
    expect(document.activeElement).toBe(outside)

    rerender(view([eu, nist]))
    expectSelected(tabs()[0])
    expect(document.activeElement).toBe(outside)
  })

  it.each([
    ['owasp:llm:01', 'Prompt Injection', 'Failed', '2 of 4 mapped attacks worked'],
    ['owasp:llm:02', 'Sensitive Information Disclosure', 'Passed', '0 of 3 mapped attacks worked'],
    ['owasp:llm:03', 'Supply Chain', 'Not tested', 'Plugin not offered'],
    ['owasp:llm:04', 'Data and Model Poisoning', 'Not tested', 'No selected plugin maps to it'],
    ['owasp:llm:05', 'Improper Output Handling', 'Not tested', 'No mapped attack was decided'],
  ])('shows control %s with its name, status and evidence', (id, name, status, evidence) => {
    render(<ComplianceTabs {...report} />)
    const panel = within(screen.getByRole('tabpanel'))
    const row = within(panel.getByText(id).closest('li'))
    expect(row.getByText(name)).toBeTruthy()
    expect(row.getByText(status).getAttribute('data-slot')).toBe('badge')
    expect(row.getByText(evidence)).toBeTruthy()
  })

  it('keeps the display name when a control has no ID', () => {
    render(<ComplianceTabs compliance={[atlas]} />)
    const row = within(screen.getByRole('tabpanel')).getByRole('listitem')
    expect(row.firstElementChild.textContent).toBe('')
    expect(within(row).getByText('Tactic without an ID')).toBeTruthy()
  })

  it('names missing control data without inventing a failed decision', () => {
    render(<ComplianceTabs compliance={[
      { id: 'owasp', name: owasp.name, controls: [
        { id: 'one', name: 'Missing reason', status: 'not_tested' },
        { id: 'two', name: 'Missing counts', status: 'passed' },
        { id: 'three', name: 'Missing decision' },
      ] }, eu,
    ]} />)
    expect(screen.getByText('Control counts unavailable')).toBeTruthy()
    expect(screen.getByText('Reason not available.')).toBeTruthy()
    expect(screen.getByText('Attack counts not available.')).toBeTruthy()
    expect(screen.getByText('Control decision not available.')).toBeTruthy()
    expect(screen.queryByText('Failed', { exact: true })).toBeNull()

    fireEvent.click(tabs()[1])
    expect(within(screen.getByRole('tabpanel')).getByText('No control results for this framework.')).toBeTruthy()
  })

  it('shows provisional copy instead of stale controls and distinguishes a missing final report', () => {
    const { rerender } = render(<ComplianceTabs {...report} provisional />)
    expect(screen.getByText('Control results are available after the run finishes.')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()

    rerender(<ComplianceTabs compliance={null} />)
    expect(screen.getByText('No framework coverage is available for this test.')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
