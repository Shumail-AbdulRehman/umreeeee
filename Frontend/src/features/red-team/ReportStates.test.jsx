// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CancelledBanner, FailedBanner, Limitations, MethodDisclosure, NoJudgeNote } from './ReportStates.jsx'
import LegacyReport from './LegacyReport.jsx'

// Recharts needs layout that jsdom lacks, so the chart is mocked.
vi.mock('../../components/AnalyticsChart', () => ({ default: ({ title }) => <div data-testid="chart">{title}</div> }))

afterEach(cleanup)

describe('report states', () => {
  it('cancelled banner shows progress and clones', () => {
    const onClone = vi.fn()
    render(<CancelledBanner finished={46} total={101} onClone={onClone} />)
    expect(screen.getByRole('note').textContent).toContain('Cancelled after 46 of 101 attacks')
    fireEvent.click(screen.getByRole('button', { name: 'Clone and run again' }))
    expect(onClone).toHaveBeenCalledTimes(1)
  })

  it('failed banner is an alert with mapped causes and action', () => {
    const onAction = vi.fn()
    render(<FailedBanner errorCode="authentication" total={101} onAction={onAction} actionLabel="Open Integrations" />)
    expect(screen.getByRole('alert').textContent).toContain("the provider rejected the integration's credentials")
    fireEvent.click(screen.getByRole('button', { name: 'Open Integrations' }))
    expect(onAction).toHaveBeenCalled()
  })

  it.each([['rate_limited', 'rate-limited'], ['timeout', 'timed out'], ['unavailable', 'unavailable'],
    ['invalid_model', 'model'], ['execution_outcome_unknown', 'could not be confirmed'], ['weird', 'returned an error'], [undefined, 'returned an error']])(
    'maps %s', (code, text) => {
      render(<FailedBanner errorCode={code} total={5} />)
      expect(screen.getByRole('alert').textContent).toContain(text)
    })

  it('no-judge note says undecided results are left out', () => {
    const onClone = vi.fn()
    render(<NoJudgeNote undecided={23} onClone={onClone} />)
    expect(screen.getByRole('note').textContent).toMatch(/23 undecided results are inconclusive.*left out of the score/)
    fireEvent.click(screen.getByRole('button', { name: 'Clone with a judge' }))
    expect(onClone).toHaveBeenCalled()
  })

  it('method disclosure is closed with three explanations', () => {
    const { container } = render(<MethodDisclosure />)
    expect(container.querySelector('details').open).toBe(false)
    const text = container.textContent
    expect(text).toContain('Attacks that worked')
    expect(text).toContain('open promptfoo scoring model')
    expect(text).toContain('Judged')
  })

  it('limitations states the caveats', () => {
    render(<Limitations />)
    expect(screen.getByText(/not proof that the model is safe/)).toBeTruthy()
  })
})

describe('LegacyReport', () => {
  const test = { name: 'Old run', model: 'gpt-x', mode: 'protected', status: 'completed', num_attacks: 10,
    launched_at: '2026-01-01T00:00:00Z', catalog_version: '1', evaluator_version: '2', config_snapshot: { integration_name: 'Acme' },
    score: { compliance_score: 0.8, passed_count: 8, evaluable_count: 10, attack_success_rate: 0.2, unsafe_count: 2,
      evaluable_fraction: 1, threshold_verdict: 'passed', inconclusive_count: 0, error_count: 0, cancelled_count: 0,
      control_results: { allowed: 5, blocked: 0, inconclusive: 0, error: 0 }, categories: { jailbreak: { pass: 8, fail: 2 } } } }

  it('renders banner, compliance and categories without any API call', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<LegacyReport test={test} />)
    expect(screen.getByText(/used the earlier category format/)).toBeTruthy()
    expect(screen.getByText('80.0%')).toBeTruthy()
    expect(screen.getAllByText('Jailbreak').length).toBeGreaterThan(0)
    expect(screen.getByTestId('chart')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
