import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import TestList from './TestList'

const raw = { id: 'r1', name: 'Support bot', model: 'llama-3.3', provider: 'Groq', mode: 'raw', status: 'completed', format: 'plugins', comparison_group_id: 'g1', created_at: '2026-11-10T10:00:00Z', summary: { risk: { score: 9.4, level: 'critical' }, attack_success: { rate: 0.216 } } }
const prot = { ...raw, id: 'p1', mode: 'protected', summary: { risk: { score: 4.1, level: 'medium' }, attack_success: { rate: 0.034 } } }
const running = { id: 'x1', name: 'Gemini pilot', model: 'gemini', provider: 'Gemini', mode: 'raw', status: 'running', format: 'plugins', progress: { total_jobs: 100, terminal_jobs: 46 }, created_at: '2026-11-11T10:00:00Z' }
const legacy = { id: 'l1', name: 'Category test', model: 'llama-8b', provider: 'Groq', mode: 'raw', status: 'partially_failed', score: 0.62, created_at: '2026-09-24T10:00:00Z' }

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

  test('empty list shows New test; filtered empty clears filters', () => {
    const p = setup({ items: [], total: 0 })
    expect(screen.getByText('No Red Team tests yet')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'New test' })[1])
    expect(p.onNew).toHaveBeenCalled()
  })

  test('filtered to nothing offers clear filters', () => {
    const p = setup({ items: [], total: 0, query: 'zzz' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(p.onFilterChange).toHaveBeenCalledWith({ query: '', status: '', mode: '' })
  })

  test('waiting readiness renders a status region', () => {
    setup({ readiness: { state: 'waiting', lastSeenSeconds: 90 } })
    const region = screen.getByRole('status')
    expect(region.textContent).toMatch(/Last seen 90 s ago/)
    expect(region.textContent).toMatch(/will wait/)
  })

  test('ready readiness shows runner details', () => {
    setup({ readiness: { state: 'ready', lastSeenSeconds: 12, queueConnected: true, requestsPerMinute: 6 } })
    expect(screen.getByText('Test runner active 12 s ago')).toBeTruthy()
    expect(screen.getByText('Queue connected')).toBeTruthy()
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
