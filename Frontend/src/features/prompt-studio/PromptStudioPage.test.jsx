import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PromptStudioPage from '../../pages/PromptStudioPage'
import * as api from '../../services/promptWorkspace/promptWorkspaceService'

vi.mock('../../services/promptWorkspace/promptWorkspaceService', () => ({
  fetchPromptWorkspaceContext: vi.fn(), fetchConversations: vi.fn(), fetchPromptWorkspaceRun: vi.fn(), fetchConversation: vi.fn(), executePromptWorkspaceRun: vi.fn(),
}))
const integration = { id: 'connection-1', provider: 'openai', account_name: 'Product workspace', models: ['model-1'] }
const user = { role: 'user' }
const baseRun = { id: 'run-1', conversation_id: 'chat-1', integration_id: integration.id, status: 'allowed', prompt: '**literal user text** <img src="x">', response_text: '# Formatted reply\n\nA **clear** answer.\n\n- First\n- Second', response_withheld: false, content_expired: false, model: 'model-1', created_at: '2026-11-04T09:00:00Z' }
function conversation(run) { return { conversation: { id: 'chat-1', title: 'Product notes' }, items: [run], total: 1, page: 1, page_size: 50, context_note: 'Permitted context only.' } }
beforeEach(() => {
  vi.clearAllMocks()
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  api.fetchPromptWorkspaceContext.mockResolvedValue({ integrations: [integration], groups: [{ id: 'g1', name: 'Engineering' }], enforcement_ready: true })
  api.fetchConversations.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
  api.fetchConversation.mockResolvedValue(conversation(baseRun))
})
describe('Prompt Studio presentation integration', () => {
  it('keeps initialized controls connected to existing context and submit guards', async () => {
    render(<PromptStudioPage currentUser={user} />)
    await screen.findByText('A home for your conversations')
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Integration/ }).value).toBe(integration.id))
    expect(screen.getByRole('combobox', { name: /Model/ }).value).toBe('model-1')
    expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Start a conversation' }), { target: { value: 'A draft' } })
    expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(false)
    expect(api.executePromptWorkspaceRun).not.toHaveBeenCalled()
  })
  it('renders assistant Markdown while keeping user content literal', async () => {
    const { container } = render(<PromptStudioPage currentUser={user} conversationId="chat-1" />)
    expect(await screen.findByRole('heading', { name: 'Formatted reply' })).toBeTruthy()
    expect(screen.getByText('clear').tagName).toBe('STRONG')
    expect(screen.getByText('**literal user text** <img src="x">')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy response' })).toBeTruthy()
  })
  it('does not render or copy withheld output even if text is returned', async () => {
    api.fetchConversation.mockResolvedValue(conversation({ ...baseRun, status: 'blocked_output', response_withheld: true, response_text: 'WITHHELD_SECRET' }))
    render(<PromptStudioPage currentUser={user} conversationId="chat-1" />)
    expect(await screen.findByText('Response withheld')).toBeTruthy()
    expect(screen.queryByText('WITHHELD_SECRET')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy response' })).toBeNull()
  })
  it('hides both expired text fields and keeps the decision record', async () => {
    api.fetchConversation.mockResolvedValue(conversation({ ...baseRun, content_expired: true, prompt: 'EXPIRED_PROMPT', response_text: 'EXPIRED_REPLY' }))
    render(<PromptStudioPage currentUser={user} conversationId="chat-1" />)
    expect(await screen.findByText('Stored text has expired; the decision record remains.')).toBeTruthy()
    expect(screen.queryByText('EXPIRED_PROMPT')).toBeNull()
    expect(screen.queryByText('EXPIRED_REPLY')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy response' })).toBeNull()
  })
  it('retains blocked-input explanation instead of presenting an assistant answer', async () => {
    api.fetchConversation.mockResolvedValue(conversation({ ...baseRun, status: 'blocked_input', response_text: null }))
    render(<PromptStudioPage currentUser={user} conversationId="chat-1" />)
    expect(await screen.findByText('Prompt blocked by policy')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy response' })).toBeNull()
  })
  it('cannot submit before history readiness even through a form submit event', async () => {
    api.fetchConversations.mockImplementation(() => new Promise(() => {}))
    render(<PromptStudioPage currentUser={user} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Integration/ }).value).toBe(integration.id))
    fireEvent.change(screen.getByRole('textbox', { name: 'Start a conversation' }), { target: { value: 'Retained draft' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }))
    expect(api.executePromptWorkspaceRun).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Start a conversation' }).value).toBe('Retained draft')
  })
  it('keeps missing-required-policy guidance visible and sends paused', async () => {
    api.fetchPromptWorkspaceContext.mockResolvedValue({ integrations: [integration], groups: [], require_active_policy: true, input_policy_coverage: { [integration.id]: false } })
    render(<PromptStudioPage currentUser={user} />)
    expect(await screen.findByText('Policy setup required')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Start a conversation' }), { target: { value: 'A draft' } })
    expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(true)
    expect(api.executePromptWorkspaceRun).not.toHaveBeenCalled()
  })
})
