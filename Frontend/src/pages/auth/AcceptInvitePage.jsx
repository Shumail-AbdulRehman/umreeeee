import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useEffect, useState } from 'react'

import {
  acceptInvitation,
  fetchInvitationDetails,
} from '../../services/auth/authService'
import AuthShell from './AuthShell'

export default function AcceptInvitePage({ token, onGoToLogin }) {
  const [details, setDetails] = useState(null)
  const [form, setForm] = useState({
    password: '',
    confirm_password: '',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    let active = true

    async function loadInvitation() {
      if (!token) {
        if (active) {
          setLoadError('Invitation token is missing.')
          setLoading(false)
        }
        return
      }

      try {
        const response = await fetchInvitationDetails(token)
        if (active) {
          setDetails(response)
          setLoadError('')
        }
      } catch (requestError) {
        if (active) {
          setLoadError(requestError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadInvitation()

    return () => {
      active = false
    }
  }, [token])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (form.password !== form.confirm_password) {
      setError('Password and confirm password must match')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await acceptInvitation({
        token,
        password: form.password,
        confirm_password: form.confirm_password,
      })
      setComplete(true)
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Averiq Invite"
      title="Activate your invited account"
      subtitle="Set a password to join your company workspace and access the application."
      footer={(
        <p>
          Already activated? <Button type="button" className="auth-link-button" onClick={onGoToLogin}>Go to sign in</Button>
        </p>
      )}
    >
      <div className="auth-copy">
        <h2>Accept invitation</h2>
        <p>
          {details
            ? `You were invited to ${details.company_name} as ${details.role}.`
            : 'Open the invitation to set your password and finish account setup.'}
        </p>
      </div>

      {loading ? (
        <div className="auth-form">
          <div className="auth-info" role="status">Validating your invitation link…</div>
        </div>
      ) : null}

      {!loading && loadError ? (
        <div className="auth-form">
          <div className="auth-error" role="alert">{loadError}</div>
          <p>If the invitation is expired or has already been used, ask your organization administrator to resend it.</p>
          <Button type="button" className="btn auth-secondary" onClick={onGoToLogin}>Back to sign in</Button>
        </div>
      ) : null}

      {!loading && !loadError ? (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <Input name="email" type="email" value={details?.email || ''} disabled />
          </label>

          <label className="field">
            <span>Password</span>
            <Input
              autoComplete="new-password"
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              placeholder="Minimum 8 characters"
              required
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <Input
              autoComplete="new-password"
              name="confirm_password"
              type="password"
              value={form.confirm_password}
              onChange={updateField}
              placeholder="Re-enter your password"
              required
            />
          </label>

          {message ? <div className={complete ? 'auth-success' : 'auth-info'} role="status">{message}</div> : null}
          {error ? <div className="auth-error" role="alert">{error}</div> : null}

          <div className="auth-actions">
            <Button className="auth-submit" type="submit" disabled={submitting || complete}>
              {submitting ? 'Activating account...' : 'Set password'}
            </Button>
            <Button className="btn auth-secondary" type="button" onClick={onGoToLogin}>
              Go to sign in
            </Button>
          </div>
        </form>
      ) : null}
    </AuthShell>
  )
}
