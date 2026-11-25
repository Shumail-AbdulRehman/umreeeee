import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlatformWorkspace from './PlatformWorkspace'

vi.mock('./PlatformShell', () => ({ default: ({ children, onLogout }) => <main><button onClick={onLogout}>Sign out</button>{children}</main> }))
vi.mock('./PlatformOverview', () => ({ default: ({ days, onDaysChange }) => <div>Overview {days}<button onClick={() => onDaysChange(30)}>Thirty days</button></div> }))
vi.mock('./PlatformCompanies', () => ({ default: ({ onParamsChange }) => <div>Companies screen<button onClick={() => onParamsChange({ q: 'North', page: null })}>Filter</button></div> }))
vi.mock('./PlatformCompany', () => ({ default: ({ companyId }) => <div>Company {companyId}</div> }))
vi.mock('./PlatformAudit', () => ({ default: () => <div>Audit screen</div> }))
const superAdmin = { role: 'super_admin' }
beforeEach(() => { window.location.hash = '' })

describe('platform workspace composition', () => {
  it.each(['org_admin', 'user'])('does not mount platform screens for %s', (role) => {
    render(<PlatformWorkspace currentUser={{ role }} />)
    expect(screen.getByRole('heading', { name: 'Platform access required' })).toBeTruthy()
    expect(screen.queryByText(/Overview 7/)).toBeNull()
  })

  it('routes company IDs separately from the operator identity', () => {
    render(<PlatformWorkspace currentUser={superAdmin} route="platform-company" params={new URLSearchParams('id=target')} />)
    expect(screen.getByText('Company target')).toBeTruthy()
  })

  it('merges directory filters into the hash and preserves date selection', () => {
    render(<PlatformWorkspace currentUser={superAdmin} route="platform-companies" params={new URLSearchParams('days=30&page=2')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(window.location.hash).toBe('#platform-companies?days=30&q=North')
  })

  it('resets pagination on date changes and exposes the existing logout action', () => {
    const onLogout = vi.fn()
    render(<PlatformWorkspace currentUser={superAdmin} params={new URLSearchParams('page=3')} onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thirty days' }))
    expect(window.location.hash).toBe('#platform-overview?days=30')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('retains the last explicit URL window after browser history navigation', () => {
    const { rerender } = render(<PlatformWorkspace currentUser={superAdmin} params={new URLSearchParams('days=7')} />)
    rerender(<PlatformWorkspace currentUser={superAdmin} params={new URLSearchParams('days=30')} />)
    expect(screen.getByText('Overview 30')).toBeTruthy()
    rerender(<PlatformWorkspace currentUser={superAdmin} params={new URLSearchParams()} />)
    expect(screen.getByText('Overview 30')).toBeTruthy()
  })
})
