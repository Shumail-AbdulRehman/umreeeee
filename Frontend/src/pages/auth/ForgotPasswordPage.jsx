import { useState } from 'react'

import { requestPasswordReset, resetPassword } from '../../services/auth/authService'
import AuthShell from './AuthShell'

export default function ForgotPasswordPage({ onGoToLogin }) {
  const [form, setForm] = useState({
    email: '',
    code: '',
    password: '',
    confirm_password: '',
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)
  const [hasRequestedCode, setHasRequestedCode] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleRequestCode = async (event) => {
    event.preventDefault()
    setRequesting(true)
    setError('')

    try {
      const response = await requestPasswordReset({ email: form.email })
      setHasRequestedCode(true)
      setMessage(response.message)
      if (response.email) {
        setForm((current) => ({ ...current, email: response.email }))
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRequesting(false)
    }
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    if (form.password !== form.confirm_password) {
      setError('Password and confirm password must match')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await resetPassword(form)
      setComplete(true)
      setMessage(response.message)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Sentinel AI Recovery"
      title="Reset your password"
      subtitle="Request a one-time code by email, then choose a new password for the account."
      footer={(
        <p>
          Remembered it? <button type="button" className="auth-link-button" onClick={onGoToLogin}>Back to sign in</button>
        </p>
      )}
    >
      <div className="auth-copy">
        <h2>Password reset</h2>
        <p>{hasRequestedCode ? 'Enter the code from your email and choose a new password.' : 'Enter your email to receive a six-digit password reset code.'}</p>
      </div>

      {!hasRequestedCode ? (
        <form className="auth-form" onSubmit={handleRequestCode}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="you@company.com"
              required
            />
          </label>

          {message ? <div className="auth-info">{message}</div> : null}
          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit" type="submit" disabled={requesting}>
            {requesting ? 'Sending code...' : 'Send reset code'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleResetPassword}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="you@company.com"
              required
            />
          </label>

          <label className="field">
            <span>Reset code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              name="code"
              type="text"
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value.replace(/\D/g, '').slice(0, 6),
                }))}
              placeholder="123456"
              required
            />
          </label>

          <label className="field">
            <span>New password</span>
            <input
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
            <span>Confirm new password</span>
            <input
              autoComplete="new-password"
              name="confirm_password"
              type="password"
              value={form.confirm_password}
              onChange={updateField}
              placeholder="Re-enter your new password"
              required
            />
          </label>

          {message ? <div className={complete ? 'auth-success' : 'auth-info'}>{message}</div> : null}
          {error ? <div className="auth-error">{error}</div> : null}

          <div className="auth-actions">
            <button className="auth-submit" type="submit" disabled={submitting || complete}>
              {submitting ? 'Resetting password...' : 'Reset password'}
            </button>
            <button
              className="btn auth-secondary"
              type="button"
              onClick={handleRequestCode}
              disabled={requesting}
            >
              {requesting ? 'Sending...' : 'Send another code'}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
