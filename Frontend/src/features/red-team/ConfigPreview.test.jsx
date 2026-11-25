import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ConfigPreview from './ConfigPreview.jsx'

describe('ConfigPreview', () => {
  it('renders YAML as text in a keyboard-focusable labelled region', () => {
    render(<ConfigPreview yaml={'redteam:\n  plugins:\n    - pii:direct'} />)
    const region = screen.getByRole('region', { name: 'promptfoo config YAML' })
    expect(region.tabIndex).toBe(0)
    expect(region.textContent).toContain('pii:direct')
    expect(region.querySelector('script')).toBeNull()
  })

  it('shows loading, error and stale states', () => {
    const { rerender } = render(<ConfigPreview loading />)
    expect(screen.getByRole('status').textContent).toContain('Building')
    rerender(<ConfigPreview error="failed" />)
    expect(screen.getByRole('alert').textContent).toBe('Could not build the config preview. failed')
    rerender(<ConfigPreview yaml="redteam: {}" stale />)
    expect(screen.getByRole('status').textContent).toBe('Changed since the last preview')
  })

  it('refreshes with the current values', () => {
    const onRefresh = vi.fn()
    const values = { plugins: ['pii:direct'] }
    render(<ConfigPreview yaml="redteam: {}" onRefresh={onRefresh} values={values} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }))
    expect(onRefresh).toHaveBeenCalledWith(values)
  })
})
