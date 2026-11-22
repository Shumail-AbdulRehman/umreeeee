import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Button } from '@/components/ui/button'

test('supports labeled inputs, JSX and the shared aliased button', () => {
  const onSend = vi.fn()
  const view = render(
    <>
      <label htmlFor="harness-message">Message</label>
      <input id="harness-message" />
      <Button type="button" onClick={onSend}>Send message</Button>
    </>,
  )

  const message = screen.getByRole('textbox', { name: 'Message' })
  fireEvent.change(message, { target: { value: 'A new message' } })
  expect(message.value).toBe('A new message')

  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(onSend).toHaveBeenCalledOnce()

  view.unmount()
  expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
})
