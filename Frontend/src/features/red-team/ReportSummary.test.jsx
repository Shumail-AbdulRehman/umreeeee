import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PluginTable from './PluginTable.jsx'
import ReportSummary from './ReportSummary.jsx'
import StrategyBreakdown from './StrategyBreakdown.jsx'
import './red-team.css'

afterEach(cleanup)

const plugin = (id, name, severity, decided, worked, risk_score, level, worst_strategy) => ({
  id, name, severity, decided, worked, rate: decided ? worked / decided : 0, risk_score, level, worst_strategy,
})

const plugins = [
  plugin('indirect', 'Indirect prompt injection', 'high', 11, 4, 8.6, 'high', 'Role-play'),
  { ...plugin('leak', 'System prompt leak', 'high', 11, 5, 7.9, 'high', 'authority'), worst_strategy_name: 'Authority' },
  plugin('agency', 'Excessive agency', 'high', 11, 1, 6.6, 'medium', 'Authority'),
  plugin('benign', 'Harmless control', 'low', 10, 0, 0, 'none', null),
]

const strategies = [
  { id: 'authority', name: 'Authority', decided: 23, worked: 8, rate: 8 / 23 },
  { id: 'roleplay', name: 'Role-play', decided: 22, worked: 6, rate: 6 / 22 },
  { id: 'base64', name: 'Base64', decided: 21, worked: 3, rate: 3 / 21 },
  { id: 'plain', name: 'Plain', decided: 22, worked: 2, rate: 2 / 22 },
]

const report = {
  risk: { score: 9.4, level: 'critical' },
  attack_success: { rate: 0.216, worked: 19, decided: 88, proven: 15, judged: 4 },
  decided: { decided: 88, adversarial: 96, exact: 71, judge: 17, policy: 0, inconclusive: 6, errors: 2 },
  threshold: { threshold: 0.8, defended_rate: 0.784, verdict: 'below_threshold' },
  plugins,
  strategies,
  paired: { test_id: 't2', mode: 'protected', status: 'completed', risk: { score: 4.1, level: 'medium' }, attack_success: { rate: 0.034 }, plugin_rates: { indirect: 0.09, leak: 0.09 } },
  trend: { test_id: 't0', risk_score: 9.7, attack_success_rate: 0.23, finished_at: '2026-10-28T10:00:00Z' },
}

describe('ReportSummary', () => {
  it('shows raw and protected risk with the reduction and trend', () => {
    render(<ReportSummary report={report} mode="raw" />)
    const card = screen.getByRole('article', { name: 'Overall risk' })
    expect(within(card).getByText('9.4')).toBeTruthy()
    expect(within(card).getByText('Critical')).toBeTruthy()
    expect(within(card).getByText('4.1')).toBeTruthy()
    expect(within(card).getByText('Medium')).toBeTruthy()
    expect(within(card).getByText(/lowered risk by 5\.3 points/)).toBeTruthy()
    expect(within(card).getByText(/Raw risk is 0\.3 lower than/)).toBeTruthy()
  })

  it('prompts to clone when there is no paired run', () => {
    render(<ReportSummary report={{ ...report, paired: null, trend: null }} mode="raw" />)
    expect(screen.getByText(/Clone as protected to compare/)).toBeTruthy()
    expect(screen.queryByText(/lowered risk/)).toBeNull()
  })

  it('shows attack success with proven, judged and the below-threshold line', () => {
    render(<ReportSummary report={report} mode="raw" />)
    const card = screen.getByRole('article', { name: 'Attacks that worked' })
    expect(within(card).getByText('21.6%')).toBeTruthy()
    expect(within(card).getByText(/3\.4% with policies/)).toBeTruthy()
    expect(within(card).getByText(/15 proven/)).toBeTruthy()
    expect(within(card).getByText(/4 judged/)).toBeTruthy()
    expect(within(card).getByText('Defended 78.4%, below the 80% threshold').className).toContain('rt-tone-warn')
  })

  it('shows the decided card and keeps scales out of the accessibility tree', () => {
    const { container } = render(<ReportSummary report={report} mode="raw" />)
    const card = screen.getByRole('article', { name: 'Decided' })
    expect(within(card).getByText('88')).toBeTruthy()
    expect(within(card).getByText(/6 inconclusive and 2 errors are left out/)).toBeTruthy()
    expect(within(card).getByText(/71 by exact evidence, 17 by the judge/)).toBeTruthy()
    container.querySelectorAll('.rt-scale').forEach((el) => expect(el.getAttribute('aria-hidden')).toBe('true'))
  })
})

describe('PluginTable', () => {
  it('renders rows in the given order with level badges', () => {
    render(<PluginTable plugins={plugins} paired={report.paired} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].querySelector('strong').textContent)).toEqual(
      plugins.map((p) => p.name))
    expect(within(rows[0]).getByText('8.6')).toBeTruthy()
    expect(within(rows[0]).getByText('4 of 11')).toBeTruthy()
    expect(within(rows[0]).getByText('9.0%')).toBeTruthy()
    expect(within(rows[1]).getByText('Authority')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'What broke, by plugin' }).getAttribute('tabindex')).toBe('0')
  })

  it('shows a fully defended plugin as 0.0, None and No attack worked', () => {
    render(<PluginTable plugins={plugins} paired={report.paired} />)
    const row = screen.getByText('Harmless control').closest('tr')
    expect(within(row).getByText('0.0')).toBeTruthy()
    expect(within(row).getByText('None')).toBeTruthy()
    expect(within(row).getByText('No attack worked')).toBeTruthy()
  })

  it('shows Not scored when a paired rate is missing', () => {
    render(<PluginTable plugins={plugins} paired={report.paired} />)
    const row = screen.getByText('Excessive agency').closest('tr')
    expect(within(row).getByText('Not scored')).toBeTruthy()
  })

  it('marks bars decorative', () => {
    const { container } = render(<PluginTable plugins={plugins} paired={null} />)
    container.querySelectorAll('.rt-bar').forEach((el) => expect(el.getAttribute('aria-hidden')).toBe('true'))
  })
})

describe('StrategyBreakdown', () => {
  it('lists rates as text and names the two highest strategies', () => {
    render(<StrategyBreakdown strategies={strategies} />)
    expect(screen.getByText('8 of 23')).toBeTruthy()
    expect(screen.getByText('Authority and Role-play broke through most often.')).toBeTruthy()
  })

  it('handles no results and no worked attacks', () => {
    const { rerender } = render(<StrategyBreakdown strategies={[]} />)
    expect(screen.getByText(/No strategy results/)).toBeTruthy()
    rerender(<StrategyBreakdown strategies={[{ id: 'a', name: 'Plain', decided: 5, worked: 0, rate: 0 }]} />)
    expect(screen.getByText('No strategy broke through.')).toBeTruthy()
  })
})

it('labels the paired raw rates correctly when viewing a protected report', () => {
  render(<PluginTable plugins={plugins} paired={{ ...report.paired, mode: 'raw' }} />)
  expect(screen.getByRole('columnheader', { name: 'Raw model' })).toBeTruthy()
  expect(screen.queryByRole('columnheader', { name: 'With policies' })).toBeNull()
  expect(screen.getByText('Indirect prompt injection').closest('tr').querySelector('[data-label="Raw model"]').textContent).toBe('9.0%')
})
