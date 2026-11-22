import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StrategyBreakdown from './StrategyBreakdown.jsx'

const strategies = [
  { id: 'basic', name: 'Basic', worked: 3, defended: 4, errors: 1, pending: 2, decided: 7, total: 10, rate: 0.429 },
  { id: 'base64', name: 'Base64', worked: 0, defended: 0, errors: 0, pending: 0, decided: 0, total: 0, rate: null },
]

describe('StrategyBreakdown', () => {
  it('shows attack success and counts in the named strategy table', () => {
    render(<StrategyBreakdown strategies={strategies} />)
    const table = within(screen.getByRole('table', { name: 'By strategy' }))
    const row = within(table.getByRole('rowheader', { name: 'Basic' }).closest('tr'))
    expect(row.getByText('42.9% worked')).toBeTruthy()
    expect(row.getByText('7 of 10 decided')).toBeTruthy()
    expect(row.getByText('3 worked · 4 defended · 1 error · 2 pending')).toBeTruthy()
  })

  it('reports the zero denominator and counts without a scored rate', () => {
    render(<StrategyBreakdown strategies={strategies} />)
    const row = within(screen.getByRole('rowheader', { name: 'Base64' }).closest('tr'))
    expect(row.getByText('0 of 0 decided')).toBeTruthy()
    expect(row.getByText('0 worked · 0 defended · 0 errors · 0 pending')).toBeTruthy()
    expect(row.getByText('Not scored')).toBeTruthy()
    expect(row.queryByText('0.0% worked')).toBeNull()
  })

  it('puts the named scroll region in the keyboard focus order', () => {
    render(<StrategyBreakdown strategies={strategies} />)
    const region = screen.getByRole('region', { name: 'By strategy' })
    expect(region.tabIndex).toBe(0)
    region.focus()
    expect(document.activeElement).toBe(region)
  })

  it('shows specific empty copy without a table', () => {
    render(<StrategyBreakdown />)
    expect(screen.getByText('No strategy results in this report.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
