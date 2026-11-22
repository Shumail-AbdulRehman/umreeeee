import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AttackDetailDialog from './AttackDetailDialog.jsx'
import ResultsTable from './ResultsTable.jsx'

const result = {
  id: 'r7', test_idx: 6, plugin_name: 'Topic check', strategy_name: 'Basic', severity: 'high',
  decision: 'allowed', verdict: 'fail', verdict_source: 'grader', grader_reason: 'The reply left the supported topic.',
  prompt: 'Describe a sunset.', response_text: 'The sky turned orange.',
  latency_ms: 0, total_tokens: 12, estimated_cost_usd: 0,
}
const paired = { decision: 'blocked_input', verdict: 'pass', verdict_source: 'policy', prevention_stage: 'input_policy' }

function Host() {
  const [detail, setDetail] = useState({})
  return <>
    <ResultsTable items={[result]} onView={(_id, { input }) => setDetail({ loading: true, input })} />
    <button type="button" onClick={() => setDetail({})}>Another control</button>
    <AttackDetailDialog {...detail} onClose={() => setDetail({})} />
  </>
}

describe('AttackDetailDialog', () => {
  it('shows the decision, promptfoo grader and model, stored text, paired result and measured usage', () => {
    render(<AttackDetailDialog result={{ ...result, paired }} graderModel="rubric-model" />)
    const dialog = within(screen.getByRole('dialog', { name: 'Attack 7' }))
    expect(dialog.getByText('Topic check · Basic · Severity high')).toBeTruthy()
    expect(dialog.getByText('Allowed')).toBeTruthy()
    expect(dialog.getByText('Unsafe · graded')).toBeTruthy()
    expect(dialog.getByRole('heading', { name: 'promptfoo grader (rubric-model)' })).toBeTruthy()
    expect(dialog.getByText(result.grader_reason)).toBeTruthy()
    expect(dialog.getByRole('region', { name: 'Attack prompt' }).textContent).toBe(result.prompt)
    expect(dialog.getByRole('region', { name: 'Model reply' }).textContent).toBe(result.response_text)
    expect(dialog.getByRole('heading', { name: 'Same attack with policies' })).toBeTruthy()
    expect(dialog.getByText('Defended')).toBeTruthy()
    expect(dialog.getByText('Blocked input')).toBeTruthy()
    expect(dialog.getByText('Stopped at input policy')).toBeTruthy()
    expect(dialog.getByText('Latency 0 ms')).toBeTruthy()
    expect(dialog.getByText('12 tokens')).toBeTruthy()
    expect(dialog.getByText('Estimated $0.00')).toBeTruthy()
  })

  it('lists matched policy rules, withholds protected output, and labels a paired raw run', () => {
    render(<AttackDetailDialog mode="protected" result={{
      ...result, decision: 'blocked_output', verdict: 'pass', verdict_source: 'policy',
      policy_evidence: [
        { policy_name: 'Topic limits', rule_id: 'rule-1', field: 'output', outcome: 'match' },
        { policy_name: 'System prompt policy', field: 'system_prompt', outcome: 'match' },
        { policy_name: 'Unmatched policy', field: 'output', outcome: 'pass' },
      ],
      paired: result,
    }} />)
    expect(screen.getByText('Blocked output')).toBeTruthy()
    const matches = within(screen.getByRole('list', { name: 'Matched policy rules' }))
    expect(matches.getAllByRole('listitem')).toHaveLength(1)
    expect(matches.getByText('Topic limits')).toBeTruthy()
    expect(matches.getByText('rule-1 · output')).toBeTruthy()
    expect(screen.getByText('An organization policy withheld the model reply.')).toBeTruthy()
    expect(screen.queryByText(result.response_text)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Same attack without policies' })).toBeTruthy()
  })

  it('keeps prompt and reply markup inert and offers no replay action', () => {
    const prompt = '<b>Example</b>\n<em>second line</em>'
    const reply = '<a href="/sample">Sample</a> & <strong>text</strong>'
    render(<AttackDetailDialog result={{ ...result, prompt, response_text: reply }} />)
    const promptBlock = screen.getByRole('region', { name: 'Attack prompt' })
    const replyBlock = screen.getByRole('region', { name: 'Model reply' })
    expect(promptBlock.textContent).toBe(prompt)
    expect(replyBlock.textContent).toBe(reply)
    expect(promptBlock.children).toHaveLength(0)
    expect(replyBlock.children).toHaveLength(0)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close'])
  })

  it('replaces both expired blocks and retains verdict and grader evidence', () => {
    render(<AttackDetailDialog result={{ ...result, content_expired: true }} />)
    expect(screen.getByText('The stored attack prompt has expired.')).toBeTruthy()
    expect(screen.getByText('The stored model reply has expired.')).toBeTruthy()
    expect(screen.queryByText(result.prompt)).toBeNull()
    expect(screen.queryByText(result.response_text)).toBeNull()
    expect(screen.getByText(result.grader_reason)).toBeTruthy()
  })

  it('shows missing evidence, a pending verdict, and unavailable content and measurements', () => {
    render(<AttackDetailDialog result={{ test_idx: 0, verdict: 'pending', verdict_source: 'none' }} />)
    expect(screen.getByText('Judging')).toBeTruthy()
    expect(screen.getByText('Target decision unavailable')).toBeTruthy()
    expect(screen.getByText('No verdict source')).toBeTruthy()
    expect(screen.getByText('No policy matches were recorded.')).toBeTruthy()
    expect(screen.getByText('No attack prompt was recorded.')).toBeTruthy()
    expect(screen.getByText('No model reply was recorded.')).toBeTruthy()
    expect(screen.getByText('Latency unavailable')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Same attack/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /promptfoo grader/ })).toBeNull()
  })

  it('uses the recorded grader model and labels an absent grader reason', () => {
    render(<AttackDetailDialog result={{ ...result, grader_model: 'recorded-model', grader_reason: null }} graderModel="configured-model" />)
    expect(screen.getByRole('heading', { name: 'promptfoo grader (recorded-model)' })).toBeTruthy()
    expect(screen.getByText('No grader reason was recorded.')).toBeTruthy()
  })

  it('shows a loading status, then fixed error copy with the same close action', () => {
    const onClose = vi.fn()
    const { rerender } = render(<AttackDetailDialog loading onClose={onClose} />)
    const button = screen.getByRole('button', { name: 'Close' })
    expect(screen.getByRole('status').textContent).toBe('Loading attack details…')
    expect(document.activeElement).toBe(button)
    rerender(<AttackDetailDialog error="Internal error details" onClose={onClose} />)
    expect(screen.getByRole('alert').textContent).toBe('Could not load attack details. Close this dialog and open the result again.')
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each(['Close button', 'Escape'])('traps focus and restores the row action via the %s', async (dismissal) => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'View attack 7' })
    const outside = screen.getByRole('button', { name: 'Another control' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getByRole('button', { name: 'Close' })
    expect(document.activeElement).toBe(close)
    expect(dialog.dataset.input).toBe('keyboard')
    outside.focus()
    expect(document.activeElement).toBe(close)
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(close)
    if (dismissal === 'Escape') fireEvent.keyDown(close, { key: 'Escape' })
    else fireEvent.click(close)
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
