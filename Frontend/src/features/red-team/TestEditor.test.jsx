import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import TestEditor from './TestEditor.jsx'

const capabilities = {
  max_attacks: 100,
  max_tests_per_plugin: 10,
  requests_per_minute: 6,
  control_count: 5,
  plugins: [
    { id: 'prompt-extraction', name: 'System prompt leak', group: 'Data leakage', severity: 'high', description: 'Reveal hidden instructions.', frameworks: { atlas: ['AML.T0056'], owasp: ['LLM07'] } },
    { id: 'hijacking', name: 'Off-topic hijacking', group: 'Behaviour', severity: 'medium', description: 'Pull off topic.', frameworks: { nist: ['MEASURE 2.6'] } },
  ],
  strategies: [
    { id: 'basic', name: 'Plain', group: 'Baseline', description: 'Plain text', effort: 1 },
    { id: 'base64', name: 'Base64', group: 'Encodings', description: 'Encoded text', effort: 1 },
    { id: 'roleplay', name: 'Role-play', group: 'Framing', description: 'Fiction', effort: 1 },
  ],
  frameworks: [{ id: 'owasp', name: 'OWASP LLM Top 10', total: 10 }, { id: 'nist', name: 'NIST AI RMF', total: 21 }],
}
const integrations = [
  { id: 'int-a', account_name: 'Support', provider: 'Groq', status: 'active', models: ['llama-a', 'llama-b'] },
  { id: 'int-b', account_name: 'Pilot', provider: 'Gemini', status: 'active', models: ['gem-1'] },
]
const users = [{ id: 'u1', first_name: 'Jordan', last_name: 'Lee', email: 'j@x.io', is_active: true }]
const initial = {
  name: 'HR check', integration_id: 'int-a', model: 'llama-a', mode: 'protected', subject_user_id: 'u1',
  plugins: ['prompt-extraction', 'hijacking'], strategies: ['base64', 'roleplay'], tests_per_plugin: 3,
  threshold_score: 0.8, seed: 1, temperature: 0.2, max_tokens: 256, judge: { integration_id: 'int-b', model: 'gem-1' },
}

function setup(extra = {}) {
  const handlers = { onSaveDraft: vi.fn(), onLaunch: vi.fn(), onCancel: vi.fn() }
  render(<TestEditor initial={initial} capabilities={capabilities} integrations={integrations} users={users} {...handlers} {...extra} />)
  return handlers
}

describe('TestEditor', () => {
  test('choosing Raw hides Run as', () => {
    setup()
    expect(screen.getByLabelText('Run as')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Raw model' }))
    expect(screen.queryByLabelText('Run as')).toBeNull()
  })

  test('Clear blocks launch and announces it in a status region linked to the button', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    const launch = screen.getByRole('button', { name: 'Save and launch' })
    expect(launch.disabled).toBe(true)
    const status = document.getElementById(launch.getAttribute('aria-describedby'))
    expect(status.getAttribute('role')).toBe('status')
    expect(status.textContent).toContain('Choose at least one plugin')
  })

  test('10 attacks per plugin with all strategies announces the over-100 count', () => {
    const many = { ...capabilities, plugins: Array.from({ length: 6 }, (_, i) => ({ ...capabilities.plugins[0], id: `p${i}`, name: `Plugin ${i}` })) }
    render(<TestEditor initial={{ ...initial, plugins: many.plugins.map((p) => p.id), tests_per_plugin: 10 }} capabilities={many} integrations={integrations} users={users} />)
    const launch = screen.getByRole('button', { name: 'Save and launch' })
    expect(launch.disabled).toBe(true)
    expect(document.getElementById(launch.getAttribute('aria-describedby')).textContent).toContain('This is 180 attacks')
    fireEvent.change(screen.getByLabelText('Attacks per plugin and strategy'), { target: { value: '5' } })
    expect(launch.disabled).toBe(false)
  })

  test('judge off disables its selects and shows judge calls None', () => {
    setup()
    expect(screen.getByText(/about \d+$/)).toBeTruthy()
    expect(screen.getByText(/Every undecided attack may be judged, with at most two attempts/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/Use an LLM judge/))
    expect(screen.getByLabelText('Judge integration').disabled).toBe(true)
    expect(screen.getByLabelText('Judge model').disabled).toBe(true)
    const row = screen.getByText('Judge calls').parentElement
    expect(within(row).getByText('None')).toBeTruthy()
  })

  test('Save and launch submits the v3 shape without basic', () => {
    const { onLaunch } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Save and launch' }))
    expect(onLaunch).toHaveBeenCalledWith({
      name: 'HR check', integration_id: 'int-a', model: 'llama-a', mode: 'protected', subject_user_id: 'u1',
      plugins: ['prompt-extraction', 'hijacking'], strategies: ['base64', 'roleplay'], tests_per_plugin: 3,
      threshold_score: 0.8, seed: 1, temperature: 0.2, max_tokens: 256, judge: { integration_id: 'int-b', model: 'gem-1' },
    })
  })

  test('Save draft submits the same shape; raw mode nulls the subject and judge off nulls judge', () => {
    const { onSaveDraft } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Raw model' }))
    fireEvent.click(screen.getByLabelText(/Use an LLM judge/))
    fireEvent.change(screen.getByLabelText('Pass threshold'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    const values = onSaveDraft.mock.calls[0][0]
    expect(values.mode).toBe('raw')
    expect(values.subject_user_id).toBeNull()
    expect(values.judge).toBeNull()
    expect(values.threshold_score).toBe(0.9)
    expect(values.strategies).not.toContain('basic')
  })

  test('shows one framework tag per plugin, OWASP first', () => {
    setup()
    expect(screen.getByText('OWASP LLM07')).toBeTruthy()
    expect(screen.queryByText('ATLAS AML.T0056')).toBeNull()
    expect(screen.getByText('NIST MEASURE 2.6')).toBeTruthy()
  })

  test('renders a server field error beside the plugin section', () => {
    setup({ fieldErrors: { plugins: ['Pick a valid plugin.'] } })
    const section = screen.getByRole('heading', { name: 'What to attack' }).closest('section')
    expect(within(section).getByText('Pick a valid plugin.')).toBeTruthy()
  })

  test('Advanced is closed initially and busy disables launch', () => {
    setup({ busy: true })
    expect(screen.getByText('Advanced').closest('details').open).toBe(false)
    expect(screen.getByRole('button', { name: /Working/ }).disabled).toBe(true)
  })

  test('changing integration resets the model to its first model', () => {
    const { onLaunch } = setup()
    fireEvent.change(screen.getByLabelText('Integration'), { target: { value: 'int-b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and launch' }))
    expect(onLaunch.mock.calls[0][0].model).toBe('gem-1')
  })
})

 test('legacy clones save and launch their category configuration without v3 fields', () => {
  const legacy = { name: 'Earlier run', format: 'categories', integration_id: 'int-a', model: 'llama-a',
    mode: 'raw', attack_categories: ['direct_injection'], num_attacks: 7, threshold_score: .4 }
  const { onLaunch, onSaveDraft } = setup({ initial: legacy,
    capabilities: { ...capabilities, categories: ['direct_injection', 'off_topic'] } })
  const launch = screen.getByRole('button', { name: 'Save and launch' })
  expect(launch.disabled).toBe(false)
  expect(screen.queryByLabelText(/Use an LLM judge/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Attack count'), { target: { value: '8' } })
  fireEvent.click(screen.getByLabelText('off topic'))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  fireEvent.click(launch)
  const values = onLaunch.mock.calls[0][0]
  expect(values).toEqual(onSaveDraft.mock.calls[0][0])
  expect(values).toMatchObject({ format: 'categories', attack_categories: ['direct_injection', 'off_topic'], num_attacks: 8, threshold_score: .4 })
  for (const key of ['plugins', 'strategies', 'tests_per_plugin', 'judge']) expect(values).not.toHaveProperty(key)
})
