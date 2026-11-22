import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import ChatHistory from './ChatHistory'

const firstChat = { id: 'first', title: 'Plan a three-day trip', updated_at: '2026-11-04T08:00:00Z', message_count: 1 }
const secondChat = { id: 'second', title: '<script>Project notes</script>', updated_at: '2026-11-03T08:00:00Z', message_count: 4 }

function props(overrides = {}) {
  return {
    history: { items: [firstChat, secondChat], total: 2, page_size: 20 },
    historyLoading: false,
    historyError: '',
    historyUnavailable: false,
    page: 1,
    busy: false,
    chat: firstChat,
    onNewChat: vi.fn(),
    onSelect: vi.fn(),
    onPageChange: vi.fn(),
    onRetry: vi.fn(),
    open: false,
    onOpenChange: vi.fn(),
    formatTime: vi.fn((value) => `Date ${value}`),
    ...overrides,
  }
}

describe('ChatHistory states and actions', () => {
  test('shows literal titles, formatted dates, counts and selection in one desktop history', () => {
    const callbacks = props()
    const { container } = render(<ChatHistory {...callbacks} />)
    const history = screen.getByRole('complementary', { name: 'Chat history' })
    const selected = within(history).getByRole('button', { name: /Plan a three-day trip/ })
    const other = within(history).getByRole('button', { name: /<script>Project notes<\/script>/ })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(history).getByRole('heading', { name: 'Chats' })).toBeTruthy()
    expect(within(history).getAllByRole('button', { name: 'New chat' })).toHaveLength(1)
    expect(container.querySelectorAll('.studio-history-item')).toHaveLength(2)
    expect(container.querySelector('script')).toBeNull()
    expect(selected.getAttribute('aria-current')).toBe('true')
    expect(other.hasAttribute('aria-current')).toBe(false)
    expect(within(selected).getByText('1 message')).toBeTruthy()
    expect(within(other).getByText('4 messages')).toBeTruthy()
    expect(within(selected).getByText(`Date ${firstChat.updated_at}`)).toBeTruthy()
    expect(callbacks.formatTime).toHaveBeenCalledWith(firstChat.updated_at)
    expect(screen.getByText('Saved to your workspace account.')).toBeTruthy()

    fireEvent.click(other)
    fireEvent.click(within(history).getByRole('button', { name: 'New chat' }))
    expect(callbacks.onSelect).toHaveBeenCalledExactlyOnceWith(secondChat.id)
    expect(callbacks.onNewChat).toHaveBeenCalledOnce()
    expect(callbacks.onOpenChange).not.toHaveBeenCalled()
  })

  test('shows the original empty guidance only after loading succeeds', () => {
    const base = props({ history: { items: [], total: 0, page_size: 20 }, historyLoading: true })
    const view = render(<ChatHistory {...base} />)

    expect(screen.getByRole('status').textContent).toBe('Loading your chats…')
    expect(screen.queryByText('A home for your conversations')).toBeNull()

    view.rerender(<ChatHistory {...base} historyLoading={false} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('A home for your conversations')).toBeTruthy()
    expect(screen.getByText('Send a message to save your first chat. Follow-ups stay in the same thread.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  test('keeps loaded chats available during an error and exposes the controlled retry', () => {
    const base = props({ historyError: 'History temporarily unavailable' })
    const { container } = render(<ChatHistory {...base} />)
    const alert = screen.getByRole('alert')

    expect(within(alert).getByText('Could not load chats')).toBeTruthy()
    expect(within(alert).getByText('History temporarily unavailable')).toBeTruthy()
    expect(container.querySelectorAll('.studio-history-item')).toHaveLength(2)
    expect(screen.queryByText('A home for your conversations')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry loading chats' }))
    expect(base.onRetry).toHaveBeenCalledOnce()
  })

  test('distinguishes unavailable history and disables retry while loading', () => {
    const base = props({ history: { items: [], total: 0, page_size: 20 }, historyError: 'Not Found', historyUnavailable: true })
    const view = render(<ChatHistory {...base} />)

    expect(screen.getByText('Chat history unavailable')).toBeTruthy()
    expect(screen.getByText('Chat support requires a server update.')).toBeTruthy()
    expect(screen.queryByText('A home for your conversations')).toBeNull()

    view.rerender(<ChatHistory {...base} historyLoading />)
    expect(screen.getByRole('status').textContent).toBe('Loading your chats…')
    const retry = screen.getByRole('button', { name: 'Retrying…' })
    expect(retry.disabled).toBe(true)
    fireEvent.click(retry)
    expect(base.onRetry).not.toHaveBeenCalled()
  })

  test('replaces stale items with loading feedback until history finishes loading', () => {
    const { container } = render(<ChatHistory {...props({ historyLoading: true })} />)

    expect(screen.getByRole('status').textContent).toBe('Loading your chats…')
    expect(container.querySelectorAll('.studio-history-item')).toHaveLength(0)
    expect(screen.queryByText('A home for your conversations')).toBeNull()
  })

  test('paginates using the controlled page and honors first and last page boundaries', () => {
    const base = props({ history: { items: [firstChat], total: 41, page_size: 20 } })
    const view = render(<ChatHistory {...base} />)

    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(base.onPageChange).toHaveBeenLastCalledWith(2)

    view.rerender(<ChatHistory {...base} page={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(base.onPageChange).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(base.onPageChange).toHaveBeenLastCalledWith(3)

    view.rerender(<ChatHistory {...base} page={3} />)
    expect(screen.getByText('3 / 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  })

  test('prevents switching, new chats and page changes while busy without blocking retry', () => {
    const base = props({ busy: true, page: 2, historyError: 'Refresh failed', history: { items: [firstChat], total: 41, page_size: 20 } })
    render(<ChatHistory {...base} />)

    for (const name of ['New chat', /Plan a three-day trip/, 'Previous', 'Next']) {
      const button = screen.getByRole('button', { name })
      expect(button.disabled).toBe(true)
      fireEvent.click(button)
    }
    expect(base.onNewChat).not.toHaveBeenCalled()
    expect(base.onSelect).not.toHaveBeenCalled()
    expect(base.onPageChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading chats' }))
    expect(base.onRetry).toHaveBeenCalledOnce()
  })
})

function DrawerHarness({ historyProps }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)}>Chats</button>
    <button type="button">Outside action</button>
    <ChatHistory {...historyProps} open={open} onOpenChange={setOpen} />
  </>
}

describe('ChatHistory drawer', () => {
  test('renders one list, focuses Close chats and returns focus to its trigger on Escape', async () => {
    render(<DrawerHarness historyProps={props()} />)
    const trigger = screen.getByRole('button', { name: 'Chats' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Chats' })
    const close = within(dialog).getByRole('button', { name: 'Close chats' })
    expect(document.activeElement).toBe(close)
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.querySelectorAll('.studio-history-item')).toHaveLength(2)
    expect(document.querySelectorAll('.studio-new-chat')).toHaveLength(1)
    expect(within(dialog).getAllByRole('button', { name: 'New chat' })).toHaveLength(1)

    fireEvent.keyDown(close, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(screen.getByRole('complementary', { name: 'Chat history' })).toBeTruthy()
    expect(document.querySelectorAll('.studio-history-item')).toHaveLength(2)
  })

  test('keeps keyboard focus in the drawer and dismisses through its close control', async () => {
    render(<DrawerHarness historyProps={props()} />)
    const trigger = screen.getByRole('button', { name: 'Chats' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Chats' })
    const close = within(dialog).getByRole('button', { name: 'Close chats' })
    const last = within(dialog).getByRole('button', { name: /<script>Project notes<\/script>/ })

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  test('uses the controlled callbacks for drawer selection and new chat', () => {
    const base = props({ open: true })
    render(<ChatHistory {...base} />)
    const dialog = screen.getByRole('dialog', { name: 'Chats' })

    fireEvent.click(within(dialog).getByRole('button', { name: /Plan a three-day trip/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'New chat' }))
    expect(base.onSelect).toHaveBeenCalledExactlyOnceWith(firstChat.id)
    expect(base.onNewChat).toHaveBeenCalledOnce()
    expect(base.onOpenChange).not.toHaveBeenCalled()
  })
})
