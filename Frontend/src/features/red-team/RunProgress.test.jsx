import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import RunProgress from './RunProgress'

const base = () => ({
  test: { id: 't1', status: 'running', progress: { total_jobs: 101, terminal_jobs: 46, running: 1, queued: 53, retry_wait: 1, pending: 55, finished: 46, cancelled: 0 } },
  provisional: { attack_success_rate: 5 / 38, worked: 5, decided: 38, finished: 46 },
  latest: [
    { id: 'a', attack_index: 46, plugin_name: 'Indirect prompt injection', strategy_name: 'Role-play', verdict: 'pending', verdict_source: null, state: 'judging', evidence: '' },
    { id: 'b', attack_index: 45, plugin_name: 'System prompt leak', strategy_name: 'Authority', verdict: 'fail', verdict_source: 'exact', state: 'done', evidence: 'Marker found' },
  ],
  requestsPerMinute: 6,
  updatedAgo: 2,
  dispatchPending: false,
  busy: false,
  onCancel: vi.fn(),
})

describe('RunProgress view', () => {
  test('progress bar, risk gating, provisional label, pacing and live region', () => {
    render(<RunProgress {...base()} />)
    const bar = screen.getByRole('progressbar', { name: 'Finished attacks' })
    expect(bar.getAttribute('aria-valuenow')).toBe('46')
    expect(bar.getAttribute('aria-valuemax')).toBe('101')
    expect(screen.getByText('Not yet')).toBeTruthy()
    expect(screen.getByText('Provisional')).toBeTruthy()
    expect(screen.getByText('13.2%')).toBeTruthy()
    expect(screen.getByText(/about 10 minutes remain/)).toBeTruthy()
    expect(screen.getByText('Updated 2 s ago.').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText('Judging')).toBeTruthy()
    expect(screen.getByText('Unsafe')).toBeTruthy()
    expect(screen.queryByText('Waiting for the queue to pick this test up. That is not a result.')).toBeNull()
  })

  test('estimate uses queued, running and retry counts and singular minute', () => {
    const props = base()
    props.test.progress = { ...props.test.progress, queued: 4, running: 1, retry_wait: 1 }
    render(<RunProgress {...props} />)
    expect(screen.getByText(/about 1 minute remain/)).toBeTruthy()
  })

  test('shows the dispatch pending note', () => {
    render(<RunProgress {...base()} dispatchPending />)
    expect(screen.getByText(/not a result/)).toBeTruthy()
  })
})

describe('RunProgress cancel dialog', () => {
  test('opens with the three consequences and Keep running restores focus without cancelling', async () => {
    const props = base()
    render(<RunProgress {...props} />)
    const trigger = screen.getByRole('button', { name: 'Cancel test' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Cancel this test?' })
    expect(within(dialog).getByText('The 53 queued attacks will not run.')).toBeTruthy()
    expect(within(dialog).getByText(/may still finish, and may cost money/)).toBeTruthy()
    expect(within(dialog).getByText(/46 finished results stay in the report/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep running' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(props.onCancel).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel test' }))
  })

  test('confirm calls onCancel exactly once', async () => {
    const props = base()
    render(<RunProgress {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel test' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel test' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('trigger is disabled while busy', () => {
    render(<RunProgress {...base()} busy />)
    expect(screen.getByRole('button', { name: 'Cancel test' }).disabled).toBe(true)
  })
})
