import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ComplianceTabs from './ComplianceTabs.jsx'

afterEach(cleanup)

const ctl = (key, id, name, status, worked = 0, decided = 0, reason = null) => ({ key, id, name, status, worked, decided, reason })
const data = [
  { id: 'owasp', name: 'OWASP LLM Top 10', total: 10, failed: 1, passed: 1, not_tested: 1, controls: [
    ctl('a', 'LLM01', 'Prompt Injection', 'failed', 13, 43),
    ctl('b', 'LLM02', 'Sensitive Information Disclosure', 'passed', 0, 9),
    ctl('c', 'LLM03', 'Supply Chain', 'not_tested', 0, 0, 'No mapped plugin was selected'),
  ] },
  { id: 'atlas', name: 'MITRE ATLAS', total: 3, failed: 1, passed: 0, not_tested: 2, controls: [
    ctl('t1', null, 'Unverified tactic', 'failed', 2, 5),
  ] },
  { id: 'nist', name: 'NIST AI RMF', total: 4, failed: 0, passed: 2, not_tested: 2, controls: [] },
  { id: 'eu', name: 'EU AI Act', total: 5, failed: 0, passed: 0, not_tested: 5, controls: [] },
]

const selectedTab = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')
const visiblePanels = () => screen.getAllByRole('tabpanel', { hidden: true }).filter((p) => !p.hidden)

describe('ComplianceTabs', () => {
  it('renders four tabs with totals from data', () => {
    render(<ComplianceTabs compliance={data} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    expect(tabs[0].textContent).toContain('OWASP LLM Top 10')
    expect(tabs[0].textContent).toContain('1 failed · 1 passed · 1 not tested')
    expect(tabs[2].textContent).toContain('0 failed · 2 passed · 2 not tested')
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
    expect(screen.getByText(/Synthetic coverage, not certification/)).toBeTruthy()
  })

  it('moves selection and focus with the keyboard and shows one panel', () => {
    render(<ComplianceTabs compliance={data} />)
    const tabs = screen.getAllByRole('tab')
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(selectedTab()).toBe(tabs[1])
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1, -1])
    expect(visiblePanels()).toHaveLength(1)
    expect(visiblePanels()[0].id).toBe(tabs[1].getAttribute('aria-controls'))
    expect(visiblePanels()[0].getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
    expect(selectedTab()).toBe(tabs[0])
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(selectedTab()).toBe(tabs[3])
    fireEvent.keyDown(tabs[3], { key: 'Home' })
    expect(selectedTab()).toBe(tabs[0])
    expect(document.activeElement).toBe(tabs[0])
    fireEvent.keyDown(tabs[0], { key: 'End' })
    expect(selectedTab()).toBe(tabs[3])
    expect(document.activeElement).toBe(tabs[3])
    expect(visiblePanels()[0].getAttribute('aria-labelledby')).toBe(tabs[3].id)
  })

  it('selects a tab on click', () => {
    render(<ComplianceTabs compliance={data} />)
    fireEvent.click(screen.getAllByRole('tab')[2])
    expect(selectedTab().textContent).toContain('NIST AI RMF')
  })

  it('shows evidence, badges and order for controls', () => {
    render(<ComplianceTabs compliance={data} />)
    const items = within(visiblePanels()[0]).getAllByRole('listitem')
    expect(items.map((i) => within(i).getByText(/LLM0\d/).textContent)).toEqual(['LLM01', 'LLM02', 'LLM03'])
    expect(items[0].textContent).toContain('Failed')
    expect(items[0].textContent).toContain('13 of 43 mapped attacks worked')
    expect(items[1].textContent).toContain('Passed')
    expect(items[1].textContent).toContain('0 of 9 mapped attacks worked')
    expect(items[2].textContent).toContain('Not tested')
    expect(items[2].textContent).toContain('No mapped plugin was selected')
    expect(items[2].textContent).not.toContain('of 0')
  })

  it('renders no id text for a null id', () => {
    render(<ComplianceTabs compliance={data} />)
    fireEvent.click(screen.getAllByRole('tab')[1])
    const item = within(visiblePanels()[0]).getByRole('listitem')
    expect(item.textContent).toContain('Unverified tactic')
    expect(item.firstElementChild.textContent).toBe('')
    expect(item.textContent).not.toContain('null')
  })

  it.each([[{ provisional: true }], [{ provisional: false, nullData: true }]])('shows the note and no tablist (%o)', (opts) => {
    render(<ComplianceTabs compliance={opts.nullData ? null : data} provisional={Boolean(opts.provisional)} />)
    expect(screen.getByText('Compliance is calculated when the test finishes')).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })
})
