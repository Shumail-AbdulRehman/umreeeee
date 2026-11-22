import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PolicyNotice from './PolicyNotice'
const context = { groups: [{ name: 'Engineering' }], enforcement_ready: true }
describe('PolicyNotice', () => {
  it('keeps normal policy context compact and discloses its real explanation', () => {
    const { container } = render(<PolicyNotice context={context} currentUser={{ role: 'user' }} />)
    const details = container.querySelector('details')
    expect(details.open).toBe(false)
    expect(screen.getByText('Engineering')).toBeTruthy()
    fireEvent.click(container.querySelector('summary'))
    expect(screen.getByText(/Every message and its conversation context/)).toBeTruthy()
  })
  it('makes missing setup actionable without granting administrative links to a user', () => {
    const { container } = render(<PolicyNotice context={context} policySetupRequired currentUser={{ role: 'user' }} />)
    expect(container.querySelector('details').open).toBe(true)
    expect(screen.getByText('Policy setup required')).toBeTruthy()
    expect(screen.getByText('Ask your administrator to assign your policy groups.')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('retains the administrative optional-policy guidance and original group route', () => {
    render(<PolicyNotice context={context} policyOptionalWithoutInput optionalAdminPolicy currentUser={{ role: 'org_admin' }} />)
    expect(screen.getByText(/You can send messages without a policy assignment/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /My policy groups/ }).getAttribute('href')).toBe('#users')
  })
  it('keeps checker readiness failures separate from configured-policy claims', () => {
    const { container } = render(<PolicyNotice context={{ groups: [], enforcement_ready: false, readiness_reason: 'Detector unavailable' }} currentUser={{ role: 'org_admin' }} />)
    expect(container.querySelector('details').open).toBe(true)
    expect(screen.getByText('Detector unavailable')).toBeTruthy()
    expect(screen.getByText('No groups assigned')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Manage groups/ }).getAttribute('href')).toBe('#inventory')
  })
})
