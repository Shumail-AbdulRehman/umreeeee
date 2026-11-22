import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PluginTable from './PluginTable.jsx'

const plugins = [
  {
    id: 'example-a', name: 'Example plugin', severity: 'high', risk_score: 7.2, level: 'high',
    decided: 4, total: 6, worked: 1, defended: 3, errors: 1, pending: 1, rate: 0.25,
    worst_strategy: 'basic', worst_strategy_name: 'Basic',
  },
  {
    id: 'example-b', name: 'Other plugin', severity: 'medium', risk_score: 0, level: 'none',
    decided: 3, total: 3, worked: 0, defended: 3, errors: 0, pending: 0, rate: 0,
  },
  {
    id: 'no-decisions', name: 'Waiting plugin', severity: 'medium', risk_score: null, level: null,
    decided: 0, total: 2, worked: 0, defended: 0, errors: 1, pending: 1, rate: null,
  },
]

function cellsFor(name) {
  return within(screen.getByRole('rowheader', { name }).closest('tr')).getAllByRole('cell')
}

describe('PluginTable', () => {
  it('renders backend order, risk, coverage and outcome counts', () => {
    render(<PluginTable plugins={plugins} />)
    expect(screen.getByRole('table', { name: 'What broke, by plugin' })).toBeTruthy()
    expect(screen.getAllByRole('rowheader').map((heading) => heading.querySelector('strong').textContent)).toEqual([
      'Example plugin', 'Other plugin', 'Waiting plugin',
    ])
    const [risk, outcomes, strategy] = cellsFor(/Example plugin/)
    expect(within(risk).getByText('7.2')).toBeTruthy()
    expect(within(risk).getByText('High')).toBeTruthy()
    expect(within(outcomes).getByText('25.0% worked')).toBeTruthy()
    expect(within(outcomes).getByText('4 of 6 decided')).toBeTruthy()
    expect(within(outcomes).getByText('1 worked · 3 defended · 1 error · 1 pending')).toBeTruthy()
    expect(strategy.textContent).toBe('Basic')
    expect(screen.queryByRole('columnheader', { name: /controls/i })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'With policies' })).toBeNull()
  })

  it('distinguishes a fully defended plugin from a plugin with no decided cases', () => {
    render(<PluginTable plugins={plugins} />)
    const [risk, outcomes, strategy] = cellsFor(/Other plugin/)
    expect(within(risk).getByText('0.0')).toBeTruthy()
    expect(within(risk).getByText('None')).toBeTruthy()
    expect(within(outcomes).getByText('0.0% worked')).toBeTruthy()
    expect(strategy.textContent).toBe('No attack worked')

    const [missingRisk, missingRate, unknownStrategy] = cellsFor(/Waiting plugin/)
    expect(missingRisk.textContent).toBe('Not scored')
    expect(within(missingRate).getByText('Not scored')).toBeTruthy()
    expect(within(missingRate).getByText('0 of 2 decided')).toBeTruthy()
    expect(within(missingRate).getByText('0 worked · 0 defended · 1 error · 1 pending')).toBeTruthy()
    expect(unknownStrategy.textContent).toBe('Not scored')
  })

  it.each([['raw', 'Raw model'], ['protected', 'With policies']])('labels and displays paired %s rates by plugin ID', (mode, label) => {
    render(<PluginTable plugins={plugins} paired={{ mode, plugin_rates: { 'example-a': 0.15, 'example-b': 0 } }} />)
    expect(screen.getByRole('columnheader', { name: label })).toBeTruthy()
    expect(cellsFor(/Example plugin/)[2].textContent).toBe('15.0%')
    expect(cellsFor(/Other plugin/)[2].textContent).toBe('0.0%')
    expect(cellsFor(/Waiting plugin/)[2].textContent).toBe('Not scored')
  })

  it('puts the named scroll region in the keyboard focus order', () => {
    render(<PluginTable plugins={plugins} />)
    const region = screen.getByRole('region', { name: 'What broke, by plugin' })
    expect(region.tabIndex).toBe(0)
    region.focus()
    expect(document.activeElement).toBe(region)
  })

  it('shows specific empty copy without a table', () => {
    render(<PluginTable plugins={[]} />)
    expect(screen.getByText('No plugin results in this report.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
