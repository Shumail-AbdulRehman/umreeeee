import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Composer from './Composer'

const integrations = [
  { id: 'first', account_name: 'Product workspace', provider: 'Gemini', models: ['first-model', 'alternative-model'] },
  { id: 'second', account_name: 'Support workspace', provider: 'OpenAI', models: ['second-model'] },
  { id: 'empty', account_name: 'Unconfigured workspace', provider: 'OpenAI', models: [] },
]

function props(overrides = {}) {
  return {
    form: { integration_id: 'first', model: 'first-model', prompt: 'A useful question', temperature: 0.2, max_tokens: 1024 },
    setForm: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    onKeyDown: vi.fn(),
    promptRef: { current: null },
    selected: integrations[0],
    integrations,
    busy: false,
    loadingChat: false,
    historyReady: true,
    historyUnavailable: false,
    historyLoading: false,
    policySetupRequired: false,
    error: '',
    onRetryHistory: vi.fn(),
    chat: null,
    contextNote: 'Only recent allowed messages provide context.',
    ...overrides,
  }
}

test('keeps the compact prompt, required selectors, original values and focus ref', () => {
  const controls = props()
  render(<Composer {...controls} />)

  const prompt = screen.getByRole('textbox', { name: 'Start a conversation' })
  expect(prompt.id).toBe('studio-prompt')
  expect(prompt.rows).toBe(2)
  expect(prompt.maxLength).toBe(24000)
  expect(prompt.required).toBe(true)
  expect(prompt.value).toBe(controls.form.prompt)
  expect(prompt.placeholder).toBe('Message Averiq…')
  expect(controls.promptRef.current).toBe(prompt)
  expect(screen.getByRole('combobox', { name: 'Integration' }).required).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Integration' }).value).toBe('first')
  expect(screen.getByRole('combobox', { name: 'Model' }).required).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Model' }).value).toBe('first-model')
  expect(screen.getByText('Recent allowed messages provide context.').title).toBe(controls.contextNote)
  expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(false)
})

test('uses the established follow-up name and placeholder for an existing chat', () => {
  render(<Composer {...props({ chat: { id: 'existing-chat' } })} />)
  expect(screen.getByRole('textbox', { name: 'Continue the conversation' }).placeholder).toBe('Ask a follow-up…')
})

describe('send guards', () => {
  test.each([
    ['pending reply', { busy: true }],
    ['opening a chat', { loadingChat: true }],
    ['history not ready', { historyReady: false }],
    ['history unavailable', { historyUnavailable: true }],
    ['required policy setup', { policySetupRequired: true }],
    ['missing integration', { form: { integration_id: '' } }],
    ['missing model', { form: { model: '' } }],
    ['empty prompt', { form: { prompt: '' } }],
    ['whitespace prompt', { form: { prompt: ' \n\t ' } }],
  ])('disables send for %s without submitting', (_, overrides) => {
    const controls = props(overrides)
    controls.form = { ...props().form, ...overrides.form }
    render(<Composer {...controls} />)

    const send = screen.getByRole('button', { name: controls.busy ? 'Waiting for reply' : 'Send message' })
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    expect(controls.onSubmit).not.toHaveBeenCalled()
  })

  test('keeps sending available during a ready history refresh', () => {
    render(<Composer {...props({ historyLoading: true })} />)
    expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(false)
  })
})

test.each([{ busy: true }, { loadingChat: true }])('disables prompt and selectors while unavailable: %j', (overrides) => {
  render(<Composer {...props(overrides)} />)
  expect(screen.getByRole('textbox').disabled).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Integration' }).disabled).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Model' }).disabled).toBe(true)
})

test('shows the pending button feedback and keeps the prompt available after a policy block', () => {
  const controls = props({ busy: true })
  const view = render(<Composer {...controls} />)
  expect(screen.getByRole('button', { name: 'Waiting for reply' }).textContent).toContain('Thinking…')
  expect(screen.getByRole('form', { name: 'Message composer' }).getAttribute('aria-busy')).toBe('true')

  view.rerender(<Composer {...controls} busy={false} policySetupRequired />)
  expect(screen.getByRole('textbox').disabled).toBe(false)
  expect(screen.getByRole('combobox', { name: 'Integration' }).disabled).toBe(false)
})

test('preserves raw multiline prompt edits, submit events and key callbacks', () => {
  const raw = '  First line\n<script>literal text</script>  '
  const controls = props()
  controls.form.prompt = raw
  render(<Composer {...controls} />)

  const prompt = screen.getByRole('textbox')
  expect(prompt.value).toBe(raw)
  fireEvent.change(prompt, { target: { value: `${raw}\n` } })
  expect(controls.setForm).toHaveBeenCalledWith({ ...controls.form, prompt: `${raw}\n` })

  fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true, isComposing: true })
  expect(controls.onKeyDown).toHaveBeenCalledOnce()
  expect(controls.onKeyDown.mock.calls[0][0].key).toBe('Enter')
  expect(controls.onKeyDown.mock.calls[0][0].shiftKey).toBe(true)
  expect(controls.onSubmit).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(controls.onSubmit).toHaveBeenCalledOnce()
  expect(controls.onSubmit.mock.calls[0][0].type).toBe('submit')
  expect(prompt.value).toBe(raw)
})

test('resets the model to the integration first model, including an unconfigured integration', () => {
  const controls = props()
  render(<Composer {...controls} />)
  const integration = screen.getByRole('combobox', { name: 'Integration' })

  fireEvent.change(integration, { target: { value: 'second' } })
  expect(controls.setForm).toHaveBeenLastCalledWith({ ...controls.form, integration_id: 'second', model: 'second-model' })
  fireEvent.change(integration, { target: { value: 'empty' } })
  expect(controls.setForm).toHaveBeenLastCalledWith({ ...controls.form, integration_id: 'empty', model: '' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), { target: { value: 'alternative-model' } })
  expect(controls.setForm).toHaveBeenLastCalledWith({ ...controls.form, model: 'alternative-model' })
})

test('opens generation settings without submitting and preserves numeric values, bounds and changes', async () => {
  const controls = props()
  render(<Composer {...controls} />)
  expect(screen.queryByRole('spinbutton', { name: 'Temperature' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Generation options' }))
  const temperature = await screen.findByRole('spinbutton', { name: 'Temperature' })
  const tokens = screen.getByRole('spinbutton', { name: 'Max tokens' })
  expect(controls.onSubmit).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Generation options' })).toBeTruthy()
  expect(temperature.value).toBe('0.2')
  expect([temperature.min, temperature.max, temperature.step]).toEqual(['0', '2', '0.1'])
  expect(tokens.value).toBe('1024')
  expect([tokens.min, tokens.max]).toEqual(['1', '8192'])
  expect(temperature.form).toBe(screen.getByRole('form', { name: 'Message composer' }))
  expect(tokens.form).toBe(temperature.form)

  fireEvent.change(temperature, { target: { value: '1.3' } })
  expect(controls.setForm).toHaveBeenLastCalledWith({ ...controls.form, temperature: 1.3 })
  fireEvent.change(tokens, { target: { value: '4096' } })
  expect(controls.setForm).toHaveBeenLastCalledWith({ ...controls.form, max_tokens: 4096 })

  fireEvent.keyDown(temperature, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'Temperature' })).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generation options' })))
})

test('disables generation value edits while a reply is pending', async () => {
  render(<Composer {...props({ busy: true })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generation options' }))
  expect((await screen.findByRole('spinbutton', { name: 'Temperature' })).disabled).toBe(true)
  expect(screen.getByRole('spinbutton', { name: 'Max tokens' }).disabled).toBe(true)
})

test.each([
  ['temperature', -0.1, 'Temperature'],
  ['temperature', 2.1, 'Temperature'],
  ['max_tokens', 0, 'Max tokens'],
  ['max_tokens', 8193, 'Max tokens'],
])('opens hidden settings and focuses an invalid %s value of %s', async (setting, value, label) => {
  const controls = props()
  controls.form[setting] = value
  render(<Composer {...controls} />)

  expect(screen.queryByRole('spinbutton', { name: label })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(controls.onSubmit).not.toHaveBeenCalled()
  const invalidField = await screen.findByRole('spinbutton', { name: label })
  expect(invalidField.value).toBe(String(value))
  expect(invalidField.validity.valid).toBe(false)
  await waitFor(() => expect(document.activeElement).toBe(invalidField))
})

test.each([
  [0, 1],
  [2, 8192],
])('accepts the existing generation boundaries temperature=%s and max_tokens=%s', (temperature, max_tokens) => {
  const controls = props()
  controls.form = { ...controls.form, temperature, max_tokens }
  render(<Composer {...controls} />)
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(controls.onSubmit).toHaveBeenCalledOnce()
})

test.each([{ historyReady: false }, { historyUnavailable: true }])('offers the existing history recovery callback: %j', (overrides) => {
  const controls = props(overrides)
  render(<Composer {...controls} />)
  expect(screen.getByRole('status').textContent).toContain('Sending is paused until chat history is available.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(controls.onRetryHistory).toHaveBeenCalledOnce()
  expect(controls.onSubmit).not.toHaveBeenCalled()
})

test('suppresses the retry notice while history is loading and renders passed errors literally', () => {
  const message = 'The request failed. Your message is still in the composer. <retry>'
  render(<Composer {...props({ historyReady: false, historyLoading: true, error: message })} />)
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toBe(message)
  expect(screen.getByRole('textbox').value).toBe('A useful question')
})

test('grows within the CSS height limit and shrinks when the controlled prompt gets shorter', () => {
  const controls = props()
  const view = render(<Composer {...controls} />)
  const prompt = screen.getByRole('textbox')
  prompt.style.cssText = 'max-height: 180px; min-height: 40px; padding: 0; border: 0; box-sizing: border-box'
  let contentHeight = 300
  Object.defineProperty(prompt, 'scrollHeight', { get: () => contentHeight })

  view.rerender(<Composer {...controls} form={{ ...controls.form, prompt: 'A long prompt\nwith more lines' }} />)
  expect(prompt.style.height).toBe('180px')
  expect(prompt.style.overflowY).toBe('auto')

  contentHeight = 44
  view.rerender(<Composer {...controls} form={{ ...controls.form, prompt: 'Short again' }} />)
  expect(prompt.style.height).toBe('44px')
  expect(prompt.style.overflowY).toBe('hidden')
})
