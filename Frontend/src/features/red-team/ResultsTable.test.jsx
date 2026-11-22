import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ResultsTable from './ResultsTable.jsx'

const filters = { plugin: '', strategy: '', verdict: '', verdict_source: '' }
const counts = { all: 101, unsafe: 19, defended: 69, pending: 0, errors: 13 }
const items = [
  { id: 'r7', test_idx: 6, repeat_index: 0, plugin_id: 'policy-check', plugin_name: 'Policy check', strategy_id: 'basic', verdict: 'pass', verdict_source: 'policy' },
  { id: 'r7-2', test_idx: 6, repeat_index: 1, plugin_id: 'policy-check', strategy_id: 'basic', strategy_name: 'Basic', verdict: 'fail', verdict_source: 'grader' },
  { id: 'r12', test_idx: 11, repeat_index: 0, plugin_id: 'topics', plugin_name: 'Topic check', strategy_id: 'basic', verdict: 'error', verdict_source: 'none' },
]

function setup(props = {}) {
  return render(<ResultsTable items={items} counts={counts} filters={filters}
    plugins={[{ id: 'policy-check', name: 'Policy check' }, 'topics']}
    strategies={[{ id: 'basic', name: 'Basic' }]}
    page={1} pageSize={20} total={101} {...props} />)
}

describe('ResultsTable', () => {
  it.each([
    ['Plugin', 'policy-check', 'plugin'],
    ['Strategy', 'basic', 'strategy'],
    ['Source', 'grader', 'verdict_source'],
    ['Source', 'none', 'verdict_source'],
  ])('changes the controlled %s filter using its ID (%s)', (name, value, key) => {
    const onFilterChange = vi.fn()
    const onPageChange = vi.fn()
    setup({ filters: { ...filters, verdict: 'pass' }, onFilterChange, onPageChange })
    const select = screen.getByRole('combobox', { name })
    fireEvent.change(select, { target: { value } })
    expect(onFilterChange).toHaveBeenCalledExactlyOnceWith({ ...filters, verdict: 'pass', [key]: value })
    expect(onPageChange).not.toHaveBeenCalled()
    expect(select.value).toBe('')
  })

  it('shows counts, including zero, and emits one verdict change', () => {
    const onFilterChange = vi.fn()
    setup({ filters: { ...filters, plugin: 'policy-check' }, onFilterChange })
    const group = within(screen.getByRole('group', { name: 'Verdict' }))
    expect(group.getByRole('button', { name: 'All 101' }).getAttribute('aria-pressed')).toBe('true')
    expect(group.getByRole('button', { name: 'Pending 0' })).toBeTruthy()
    fireEvent.click(group.getByRole('button', { name: 'Unsafe 19' }))
    expect(onFilterChange).toHaveBeenCalledExactlyOnceWith({ ...filters, plugin: 'policy-check', verdict: 'fail' })
  })

  it('resets to page one through the controlled filter callback and clears all filters', () => {
    const redirect = vi.fn()
    const update = vi.fn()
    function Harness() {
      const [query, setQuery] = useState({ ...filters, verdict: 'pass', plugin: 'policy-check', strategy: 'basic', verdict_source: 'policy' })
      const [page, setPage] = useState(3)
      function change(next) {
        update(next)
        setQuery(next)
        setPage(1)
      }
      return <ResultsTable items={items.filter((item) => !query.verdict || item.verdict === query.verdict)}
        filters={query} plugins={['policy-check']} strategies={['basic']}
        page={page} pageSize={1} total={query.verdict ? 3 : items.length}
        onFilterChange={change} onPageChange={redirect} />
    }
    render(<Harness />)
    const pagination = screen.getByRole('navigation', { name: 'results pagination' })
    expect(within(pagination).getByText('3 / 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(update).toHaveBeenCalledExactlyOnceWith(filters)
    expect(redirect).not.toHaveBeenCalled()
    expect(within(pagination).getByText('1 / 3')).toBeTruthy()
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByRole('combobox', { name: 'Plugin' }).value).toBe('')
  })

  it('moves pages through the pagination callback', () => {
    const onPageChange = vi.fn()
    const onFilterChange = vi.fn()
    setup({ page: 2, onFilterChange, onPageChange })
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(3)
    expect(onFilterChange).not.toHaveBeenCalled()
  })

  it('labels verdict sources and exposes a focusable table region and distinct repeated attack actions', () => {
    const onView = vi.fn()
    setup({ onView })
    const table = within(screen.getByRole('table'))
    for (const label of ['Policy block', 'promptfoo grader', 'No verdict source', 'Unsafe · graded']) {
      expect(table.getByText(label)).toBeTruthy()
    }
    const region = screen.getByRole('region', { name: 'Results table' })
    expect(region.tabIndex).toBe(0)
    region.focus()
    expect(document.activeElement).toBe(region)
    const first = table.getByRole('button', { name: 'View attack 7' })
    const repeat = table.getByRole('button', { name: 'View attack 7, repeat 2' })
    first.focus()
    expect(document.activeElement).toBe(first)
    fireEvent.click(first, { detail: 0 })
    fireEvent.click(repeat, { detail: 1 })
    expect(onView.mock.calls).toEqual([['r7', { input: 'keyboard' }], ['r7-2', { input: 'pointer' }]])
  })

  it.each([
    [{ loading: true }, 'Loading results…'],
    [{ items: [] }, 'No results have been recorded.'],
    [{ items: [], filters: { ...filters, verdict_source: 'policy' } }, 'No results match these filters.'],
  ])('distinguishes a loading or empty result set', (props, label) => {
    setup(props)
    expect(screen.getByRole('status').textContent).toBe(label)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows a safe fetch failure, hides stale rows and routes retry to the page', () => {
    const onRetry = vi.fn()
    setup({ error: new Error('internal details'), onRetry })
    expect(screen.getByRole('alert').textContent).toBe('Could not load results.')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry results' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
