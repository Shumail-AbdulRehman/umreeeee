import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import RunProgress from './RunProgress'

const base = () => ({
  test: { id: 't1', status: 'running', counts: { planned: 101, executed: 46, graded: 38 }, progress: { phase: 'evaluating' } },
  provisional: { attack_success_rate: 5 / 38, worked: 5, decided: 38, risk: { score: 9 } },
  latest: [
    { id: 'a', test_idx: 45, plugin_id: 'hijacking', strategy_id: 'basic', verdict: 'pending' },
    { id: 'b', test_idx: 44, plugin_name: 'System prompt leak', strategy_name: 'Basic', verdict: 'fail', verdict_source: 'grader', grader_reason: 'Synthetic marker found' },
  ],
  elapsedSeconds: 43,
  updatedAgo: 2,
  onCancel: vi.fn(),
})

const bar = () => screen.getByRole('progressbar', { name: 'Executed attacks' })
const trigger = () => screen.getByRole('button', { name: 'Cancel test' })

describe('RunProgress view', () => {
  test('shows executed counts, provisional success and the latest recorded results', () => {
    render(<RunProgress {...base()} />)
    expect(screen.getByRole('heading', { name: 'Running attacks 46/101' })).toBeTruthy()
    expect(bar().getAttribute('aria-valuenow')).toBe('46')
    expect(bar().getAttribute('aria-valuemax')).toBe('101')
    expect(bar().getAttribute('aria-valuetext')).toBe('46 of 101 executed')
    expect(bar().firstElementChild.classList.contains('motion-reduce:transition-none')).toBe(true)
    expect(bar().firstElementChild.style.transform).toBe('')
    expect(screen.getByText('Provisional')).toBeTruthy()
    expect(screen.getByText('13.2%')).toBeTruthy()
    expect(screen.getByText('5 of 38 decided attacks succeeded.')).toBeTruthy()
    expect(screen.queryByText(/overall risk/i)).toBeNull()
    expect(screen.getByText('Elapsed 43 s')).toBeTruthy()
    expect(screen.getByText('Updated 2 s ago')).toBeTruthy()

    const latest = screen.getByRole('region', { name: 'Latest results' })
    expect(latest.tabIndex).toBe(0)
    expect(within(latest).getAllByRole('row')).toHaveLength(3)
    expect(within(latest).getByText('hijacking')).toBeTruthy()
    expect(within(latest).getByText('Awaiting grade')).toBeTruthy()
    expect(within(latest).getByText('Unsafe · graded')).toBeTruthy()
    expect(within(latest).getByText('promptfoo grader')).toBeTruthy()
    expect(within(latest).getByText('Synthetic marker found')).toBeTruthy()
  })

  test.each([
    ['queued', null, 'Queued'],
    ['queued', 'claimed', 'Preparing run'],
    ['generating', null, 'Generating attacks (promptfoo hosted)'],
    ['generating', 'generating', 'Generating attacks (promptfoo hosted)'],
    ['running', 'importing', 'Grading and importing results'],
    ['cancelling', 'evaluating', 'Cancelling'],
  ])('shows phase %s / %s in the heading and live region', (status, phase, label) => {
    const props = base()
    render(<RunProgress {...props} test={{ ...props.test, status, progress: { phase } }} />)
    expect(screen.getByRole('heading', { name: label })).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByRole('status').textContent).toBe(label)
    expect(bar().getAttribute('aria-valuenow')).toBe(phase === 'importing' ? '46' : null)
  })

  test('updates counts independently from the phase announcement', () => {
    const props = base()
    const { rerender } = render(<RunProgress {...props} />)
    const live = screen.getByRole('status')
    const announcement = live.firstChild
    rerender(<RunProgress {...props} updatedAgo={3} test={{ ...props.test, counts: { planned: 101, executed: 47, graded: 38 } }} />)
    expect(screen.getByRole('heading', { name: 'Running attacks 47/101' })).toBeTruthy()
    expect(live.firstChild).toBe(announcement)
    expect(live.textContent).toBe('Running attacks')
    rerender(<RunProgress {...props} test={{ ...props.test, progress: { phase: 'importing' } }} />)
    expect(live.textContent).toBe('Grading and importing results')
  })

  test.each([
    [{ planned: 0, executed: 0, graded: 0 }],
    [{ planned: null, executed: 3, graded: 2 }],
    [{ planned: 100, executed: null }],
    [{ planned: 100, executed: -1 }],
    [undefined],
  ])('keeps the bar indeterminate for missing or invalid counts (%j)', (counts) => {
    render(<RunProgress test={{ status: 'running', counts }} />)
    expect(screen.getByRole('heading', { name: 'Running attacks' })).toBeTruthy()
    expect(bar().hasAttribute('aria-valuenow')).toBe(false)
    expect(bar().hasAttribute('aria-valuemax')).toBe(false)
    expect(bar().childElementCount).toBe(0)
  })

  test('supports counts from progress and keeps extra executions within the planned interval', () => {
    render(<RunProgress test={{ status: 'running', progress: { phase: 'evaluating', planned: 4, executed: 6, graded: 5 } }} />)
    expect(screen.getByRole('heading', { name: 'Running attacks 4/4' })).toBeTruthy()
    expect(bar().getAttribute('aria-valuenow')).toBe('4')
    expect(bar().getAttribute('aria-valuemax')).toBe('4')
    expect(bar().firstElementChild.style.width).toBe('100%')
  })

  test('distinguishes zero success from a lack of decisions', () => {
    const props = base()
    const { rerender } = render(<RunProgress {...props} provisional={{ attack_success_rate: 0, worked: 0, decided: 4 }} />)
    expect(screen.getByText('0.0%')).toBeTruthy()
    expect(screen.getByText('0 of 4 decided attacks succeeded.')).toBeTruthy()
    rerender(<RunProgress {...props} provisional={{ attack_success_rate: null, worked: 0, decided: 0 }} />)
    expect(screen.queryByText('0.0%')).toBeNull()
    expect(screen.getByText('No attacks have been decided yet.')).toBeTruthy()
  })

  test('labels a queued dispatch and an empty latest results view', () => {
    render(<RunProgress test={{ status: 'queued' }} dispatchPending />)
    expect(screen.getByText('Waiting for the worker to pick up this test.')).toBeTruthy()
    expect(screen.getByText('No results recorded yet.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('RunProgress cancel dialog', () => {
  async function openDialog() {
    const button = trigger()
    button.focus()
    fireEvent.click(button)
    return { button, dialog: await screen.findByRole('dialog', { name: 'Cancel this test?' }) }
  }

  test('explains cancellation, traps Tab at the dialog edges and restores focus on dismissal', async () => {
    const props = base()
    render(<RunProgress {...props} />)
    const { button, dialog } = await openDialog()
    const keep = within(dialog).getByRole('button', { name: 'Keep running' })
    const cancel = within(dialog).getByRole('button', { name: 'Cancel test' })
    expect(within(dialog).getByText('Completed results are kept. Cancellation may take time while work is in progress.')).toBeTruthy()
    expect(document.activeElement).toBe(keep)
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(document.activeElement).toBe(keep)
    fireEvent.click(keep)
    await waitFor(() => expect(document.activeElement).toBe(button))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  test('Escape restores focus to the trigger without cancelling', async () => {
    const props = base()
    render(<RunProgress {...props} />)
    const { button, dialog } = await openDialog()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(button))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  test('confirm calls onCancel once and restores focus even when the callback makes the run busy', async () => {
    const props = base()
    const { rerender } = render(<RunProgress {...props} />)
    props.onCancel.mockImplementation(() => rerender(<RunProgress {...props} busy />))
    const { button, dialog } = await openDialog()
    const confirm = within(dialog).getByRole('button', { name: 'Cancel test' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(document.activeElement).toBe(button))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('disables confirmation if the run becomes busy while the dialog is open', async () => {
    const props = base()
    const { rerender } = render(<RunProgress {...props} />)
    const { dialog } = await openDialog()
    const confirm = within(dialog).getByRole('button', { name: 'Cancel test' })
    rerender(<RunProgress {...props} busy />)
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(props.onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBe(dialog)
  })

  test.each(['completed', 'partially_failed', 'failed', 'cancelled'])('omits cancellation on %s runs', (status) => {
    const props = base()
    render(<RunProgress {...props} test={{ ...props.test, status }} />)
    expect(screen.queryByRole('button', { name: 'Cancel test' })).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('Provisional')).toBeNull()
  })
})
