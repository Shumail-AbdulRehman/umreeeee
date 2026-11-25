// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CancelledBanner, FailedBanner, NoJudgeNote } from './ReportStates.jsx'

afterEach(cleanup)

describe('report states', () => {
  it('cancelled banner shows progress and clones', () => {
    const onClone = vi.fn()
    render(<CancelledBanner finished={46} total={101} onClone={onClone} />)
    expect(screen.getByRole('note').textContent).toContain('Cancelled after 46 of 101 attacks')
    expect(screen.getByRole('note').textContent).toContain('Review finished results below.')
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
    ['invalid_model', 'model'], ['execution_outcome_unknown', 'could not be confirmed'], ['weird', 'check the Red Team worker logs'], [undefined, 'check the Red Team worker logs']])(
    'maps %s', (code, text) => {
      render(<FailedBanner errorCode={code} total={5} />)
      expect(screen.getByRole('alert').textContent).toContain(text)
    })

  it.each([
    ['no_tests_generated', 'promptfoo generated no attacks.', 'Check the test purpose and selected plugins'],
    ['interrupted', 'The run stopped before evaluation finished.', 'Review any saved results below'],
    ['promptfoo_unavailable', 'The Red Team worker could not start promptfoo.', 'restore the promptfoo runtime on the worker'],
    ['promptfoo_api_key_missing', 'The promptfoo Cloud API key is missing.', 'Set PROMPTFOO_API_KEY in backend/.env'],
    ['promptfoo_auth_failed', 'promptfoo Cloud rejected the API key.', 'Create a new key in promptfoo Cloud, set PROMPTFOO_API_KEY in backend/.env'],
    ['unrecognized internal failure', 'This test failed.', 'check the Red Team worker logs'],
    ['constructor', 'This test failed.', 'check the Red Team worker logs'],
  ])('explains failure %s and gives its next step without rendering the code', (failureReason, summary, nextStep) => {
    render(<FailedBanner failureReason={failureReason} total={101} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(summary)
    expect(alert.textContent).toContain(nextStep)
    expect(alert.textContent).toContain('clone the test')
    expect(alert.textContent).not.toContain(failureReason)
  })

  it('shows zero finished attacks without losing the planned count', () => {
    render(<CancelledBanner finished={0} total={3} />)
    expect(screen.getByRole('note').textContent).toContain('Cancelled after 0 of 3 attacks.')
  })

  it('no-judge note says undecided results are left out', () => {
    const onClone = vi.fn()
    render(<NoJudgeNote undecided={23} onClone={onClone} />)
    expect(screen.getByRole('note').textContent).toMatch(/23 undecided results are inconclusive.*left out of the score/)
    fireEvent.click(screen.getByRole('button', { name: 'Clone with a judge' }))
    expect(onClone).toHaveBeenCalled()
  })
})
