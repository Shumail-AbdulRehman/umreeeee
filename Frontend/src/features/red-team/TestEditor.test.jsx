import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TestEditor from './TestEditor.jsx'

const capabilities = {
  promptfoo: { available: true, cloud_key_configured: true, version: '0.126.0' },
  limits: { max_target_calls: 200 },
  plugins: [
    { id: 'pii:direct', name: 'Direct PII leak', group: 'Data & privacy', severity: 'high', description: 'Requests synthetic personal data.', remote_only: true },
    { id: 'prompt-extraction', name: 'Prompt extraction', group: 'Security & access', severity: 'high', description: 'Requests hidden instructions.', remote_only: false },
  ],
  strategies: [
    { id: 'basic', name: 'Baseline', group: 'Baseline', description: 'Plain attack.', remote_only: false, multi_turn: false, cases_per_seed: 1, target_calls_per_test: 1 },
    { id: 'base64', name: 'Base64', group: 'Encoding', description: 'Encodes the prompt.', remote_only: true, multi_turn: false, cases_per_seed: 1, target_calls_per_test: 1 },
    { id: 'goat', name: 'GOAT', group: 'Multi-turn', description: 'Negotiates over several turns.', remote_only: true, multi_turn: true, cases_per_seed: 1, target_calls_per_test: 4 },
  ],
  frameworks: [{
    id: 'owasp:llm', name: 'OWASP LLM Top 10', controls: [
      { id: 'llm02', plugins: ['pii:direct'] },
      { id: 'llm99', plugins: ['not-offered'] },
    ],
  }],
}
const integrations = [
  { id: 'target', account_name: 'Target', provider: 'groq', status: 'active', models: ['target-a', 'target-b'] },
  { id: 'grader', account_name: 'Grader', provider: 'groq', status: 'active', models: ['grader-a'] },
]
const users = [{ id: 'user-1', first_name: 'Jordan', last_name: 'Lee', is_active: true, is_email_verified: true }]
const initial = {
  name: 'HR assistant test', purpose: 'Help employees with HR questions and refuse personal data requests.',
  integration_id: 'target', model: 'target-a', mode: 'protected', subject_user_id: 'user-1',
  plugins: ['prompt-extraction'], strategies: ['base64'], tests_per_plugin: 2,
  grader: { integration_id: 'grader', model: 'grader-a' }, threshold_score: .8,
}

function setup(overrides = {}) {
  const handlers = { onSaveDraft: vi.fn(), onLaunch: vi.fn(), onCancel: vi.fn(), onPreview: vi.fn() }
  render(<TestEditor initial={initial} capabilities={capabilities} integrations={integrations} users={users} preview={{ yaml: 'redteam: {}' }} {...handlers} {...overrides} />)
  return handlers
}

describe('TestEditor', () => {
  it('validates fields, focuses the first invalid field and requires protected subject', () => {
    setup({ initial: { ...initial, name: '', purpose: '', subject_user_id: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Test name'))
    expect(screen.getAllByText(/at least 2 characters/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Choose the person/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Raw model' }))
    expect(screen.queryByLabelText('Run as')).toBeNull()
  })

  it('quick-select merges offered framework mappings and explains unmapped controls', () => {
    setup()
    const section = screen.getByRole('heading', { name: 'What to attack' }).closest('section')
    expect(within(section).getByText('1 control does not map to offered plugins.')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Use OWASP LLM Top 10' }))
    expect(within(section).getByRole('checkbox', { name: /Direct PII leak/ }).checked).toBe(true)
    expect(within(section).getByRole('checkbox', { name: /Prompt extraction/ }).checked).toBe(true)
  })

  it('shows hosted and multi-turn metadata and estimates implicit basic with multiplier', () => {
    setup({ initial: { ...initial, plugins: ['pii:direct', 'prompt-extraction'], strategies: ['base64', 'goat'], tests_per_plugin: 3 } })
    expect(screen.getAllByText('Hosted generation').length).toBeGreaterThan(1)
    expect(screen.getByText('4 target calls per test case')).toBeTruthy()
    expect(screen.getByText('Generated test cases').parentElement.textContent).toContain('18')
    expect(screen.getByText('Estimated target calls').parentElement.textContent).toContain('36 / 200')
  })

  it('disables save and launch above the 200-call cap', () => {
    const over = { ...capabilities, limits: { max_target_calls: 20 } }
    setup({ capabilities: over, initial: { ...initial, plugins: ['pii:direct', 'prompt-extraction'], strategies: ['base64', 'goat'], tests_per_plugin: 2 } })
    expect(screen.getByRole('button', { name: 'Save draft' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Launch test' }).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('24 target calls')
  })

  it('blocks 11 selected strategies even when the 175-call estimate is within budget', () => {
    const strategies = Array.from({ length: 11 }, (_, index) => ({
      id: `sample-${index}`, name: `Sample variation ${index + 1}`,
      cases_per_seed: 1, target_calls_per_test: [5, 10][index] ?? 1,
    }))
    const { onSaveDraft, onPreview } = setup({
      capabilities: { ...capabilities, strategies },
      initial: { ...initial, strategies: strategies.map(({ id }) => id), tests_per_plugin: 7 },
    })
    const launch = screen.getByRole('button', { name: 'Launch test' })
    const refresh = screen.getByRole('button', { name: 'Refresh preview' })
    expect(screen.getByText('Estimated target calls').parentElement.textContent).toContain('175 / 200')
    expect(screen.getByText('Generated test cases').parentElement.textContent).toContain('84')
    expect(screen.getByRole('status').textContent).toContain('Choose at most 8 optional strategies.')
    expect(launch.disabled).toBe(true)
    expect(refresh.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSaveDraft).not.toHaveBeenCalled()
    expect(onPreview).not.toHaveBeenCalled()

    for (const number of [9, 10, 11]) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Sample variation ${number}` }))
    }
    expect(launch.disabled).toBe(false)
  })

  it('blocks a bulk plugin selection that exceeds the API limit', () => {
    const plugins = Array.from({ length: 21 }, (_, index) => ({
      id: `sample-${index}`, name: `Sample plugin ${index + 1}`, severity: 'low',
    }))
    const { onSaveDraft } = setup({ capabilities: { ...capabilities, plugins } })
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByRole('status').textContent).toContain('Choose at most 20 plugins. 21 selected.')
    expect(screen.getByRole('button', { name: 'Launch test' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSaveDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Sample plugin 21/ }))
    expect(screen.getByRole('button', { name: 'Launch test' }).disabled).toBe(false)
  })

  it('launches with the promptfoo config values and previews valid initial values once', async () => {
    const { onLaunch, onPreview } = setup()
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Launch test' }))
    expect(onLaunch).toHaveBeenCalledWith(initial)
  })

  it('clears the selected model when an integration changes', () => {
    const { onSaveDraft } = setup()
    fireEvent.change(screen.getByLabelText('Integration'), { target: { value: 'grader' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(onSaveDraft.mock.calls[0][0]).toMatchObject({ integration_id: 'grader', model: 'grader-a' })
  })

  it('shows a grader field error and disables launch when the grader is missing', () => {
    setup({ initial: { ...initial, grader: null } })
    expect(screen.getAllByText('Choose a grader integration and model.').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Launch test' }).disabled).toBe(true)
  })

  it('disables only launch with the specific promptfoo readiness reason', () => {
    setup({ capabilities: { ...capabilities, promptfoo: { available: false, cloud_key_configured: false } } })
    expect(screen.getByRole('button', { name: 'Save draft' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Launch test' }).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Promptfoo runtime is unavailable.')
  })
})
