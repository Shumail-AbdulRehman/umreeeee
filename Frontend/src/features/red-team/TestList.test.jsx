import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import TestList from './TestList'

const raw = { id: 'r1', name: 'Support bot', model: 'llama-3.3', provider: 'Groq', mode: 'raw', status: 'completed', format: 'plugins', comparison_group_id: 'g1', created_at: '2026-11-10T10:00:00Z', summary: { risk: { score: 9.4, level: 'critical' }, attack_success: { rate: 0.216 } } }
const prot = { ...raw, id: 'p1', mode: 'protected', summary: { risk: { score: 4.1, level: 'medium' }, attack_success: { rate: 0.034 } } }
const running = { id: 'x1', name: 'Gemini pilot', model: 'gemini', provider: 'Gemini', mode: 'raw', status: 'running', format: 'plugins', progress: { total_jobs: 100, terminal_jobs: 46 }, created_at: '2026-11-11T10:00:00Z' }
const legacy = { id: 'l1', name: 'Category test', model: 'llama-8b', provider: 'Groq', mode: 'raw', status: 'partially_failed', score: 0.62, created_at: '2026-09-24T10:00:00Z' }
const capabilities = {
  promptfoo: { version: '0.126.0', available: true, cloud_key_configured: true },
  broker_transport_reachable: true, worker_observed: true, dispatcher_observed: true,
}

function setup(over = {}) {
  const p = { items: [raw, running, prot, legacy], total: 4, page: 1, pageSize: 20, onPageChange: vi.fn(), query: '', status: '', mode: '', onFilterChange: vi.fn(), onNew: vi.fn(), onOpen: vi.fn(), ...over }
  render(<TestList {...p} />)
  return p
}

describe('TestList', () => {
  test('groups raw and protected runs and orders raw first', () => {
    setup({ items: [prot, running, raw, legacy] })
    const groups = document.querySelectorAll('tbody')
    expect(groups).toHaveLength(3)
    expect(within(groups[0]).getByRole('button', { name: /With policies, Support bot/ })).toBeTruthy()
    expect(within(groups[0]).getByRole('button', { name: 'Support bot' })).toBeTruthy()
    expect(screen.getByText('9.4')).toBeTruthy()
    expect(screen.getByText('Critical')).toBeTruthy()
    expect(screen.getByText('21.6%')).toBeTruthy()
  })

  test('shows legacy compliance, running percent and not scored', () => {
    setup()
    expect(screen.getByText('Earlier format · compliance 62%')).toBeTruthy()
    expect(screen.getByText('Running · 46%')).toBeTruthy()
    expect(screen.getAllByText('Not scored').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Tests' }).getAttribute('tabindex')).toBe('0')
    expect(document.querySelector('td[data-label="Overall risk"]')).toBeTruthy()
  })

  test('empty list keeps draft creation available when launch is unavailable', () => {
    const p = setup({ items: [], total: 0, readiness: { ...capabilities, worker_observed: false } })
    expect(screen.getByText('No Red Team tests yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New test' }))
    expect(p.onNew).toHaveBeenCalledTimes(1)
  })

  test('filtered to nothing offers clear filters', () => {
    const p = setup({ items: [], total: 0, query: 'zzz' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(p.onFilterChange).toHaveBeenCalledWith({ query: '', status: '', mode: '' })
  })

  test('shows an installed version even when the runtime is unavailable', () => {
    setup({ readiness: { ...capabilities, promptfoo: { ...capabilities.promptfoo, available: false } } })
    expect(screen.getByRole('status').textContent).toBe('Launch unavailable')
    expect(screen.getByText('promptfoo 0.126.0 · runtime unavailable')).toBeTruthy()
    expect(screen.getByText('promptfoo Cloud key configured')).toBeTruthy()
  })

  test('reports ready and shows only the Cloud key configuration flag', () => {
    const unexpectedField = 'private capability field'
    setup({ readiness: { ...capabilities, lastSeenSeconds: 12, promptfoo: { ...capabilities.promptfoo, cloud_api_key: unexpectedField } } })
    const readiness = screen.getByRole('region', { name: 'Execution readiness' })
    expect(within(readiness).getByRole('status').textContent).toBe('Ready to run')
    expect(within(readiness).getByText('promptfoo 0.126.0')).toBeTruthy()
    expect(within(readiness).getByText('promptfoo Cloud key configured')).toBeTruthy()
    expect(within(readiness).getByText('Worker active · last seen 12 s ago')).toBeTruthy()
    expect(within(readiness).getByText('Broker connected')).toBeTruthy()
    expect(readiness.textContent).not.toContain(unexpectedField)
  })

  test.each([
    [{ promptfoo: { ...capabilities.promptfoo, version: null } }, 'promptfoo version unavailable'],
    [{ promptfoo: { ...capabilities.promptfoo, cloud_key_configured: false } }, 'promptfoo Cloud key not configured'],
    [{ broker_transport_reachable: false }, 'Broker connection unavailable'],
    [{ worker_observed: false }, 'Worker not responding'],
    [{ dispatcher_observed: false }, 'Dispatcher not responding'],
  ])('requires every launch readiness signal (%j)', (patch, detail) => {
    setup({ readiness: { ...capabilities, ...patch } })
    expect(screen.getByRole('status').textContent).toBe('Launch unavailable')
    expect(screen.getByText(detail)).toBeTruthy()
  })

  test('keeps loading and retry distinct from an empty result', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<TestList loading onRetry={onRetry} />)
    expect(screen.getByRole('status').textContent).toBe('Loading tests…')
    expect(screen.queryByText('No Red Team tests yet')).toBeNull()
    rerender(<TestList error onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toBe('Could not load tests.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('keeps a draft row reachable and withholds scores for active promptfoo runs', () => {
    const draft = { id: 'd1', name: 'Draft test', status: 'draft' }
    const live = { ...running, engine: 'promptfoo', summary: raw.summary, counts: { planned: 0, executed: 0 } }
    const p = setup({ items: [draft, live] })
    expect(screen.getByText('Running', { selector: 'td span' })).toBeTruthy()
    expect(screen.queryByText('Running · 46%')).toBeNull()
    expect(screen.queryByText('9.4')).toBeNull()
    expect(screen.queryByText('21.6%')).toBeNull()
    const draftButton = screen.getByRole('button', { name: 'Draft test' })
    draftButton.focus()
    expect(document.activeElement).toBe(draftButton)
    fireEvent.click(draftButton)
    expect(p.onOpen).toHaveBeenCalledWith('d1')
  })

  test('filters and rows call callbacks', () => {
    const p = setup({ query: 'a', status: 'draft' })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'cancelled' } })
    expect(p.onFilterChange).toHaveBeenLastCalledWith({ query: 'a', status: 'cancelled', mode: '' })
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'raw' } })
    expect(p.onFilterChange).toHaveBeenLastCalledWith({ query: 'a', status: 'draft', mode: 'raw' })
    fireEvent.change(screen.getByLabelText('Search tests'), { target: { value: 'abc' } })
    expect(p.onFilterChange).toHaveBeenLastCalledWith({ query: 'abc', status: 'draft', mode: '' })
    fireEvent.click(screen.getByRole('button', { name: /With policies, Support bot/ }))
    expect(p.onOpen).toHaveBeenCalledWith('p1')
  })
})
