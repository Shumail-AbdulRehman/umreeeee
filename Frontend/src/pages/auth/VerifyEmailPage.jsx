import { useState } from 'react'

import { resendVerificationCode, verifyEmailCode } from '../../services/auth/authService'
import AuthShell from './AuthShell'

export default function VerifyEmailPage({
  email,
  initialMessage,
  onAuthenticated,
  onGoToLogin,
  onVerificationStateChanged,
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const statusMessage =
    resendMessage || initialMessage || (email ? `We sent a six-digit code to ${email}.` : '')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const user = await verifyEmailCode({ email, code })
      onAuthenticated(user)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setError('')

    try {
      const response = await resendVerificationCode({ email })
      setResendMessage(response.message)
      if (response.email) {
        onVerificationStateChanged({
          email: response.email,
          message: response.message,
        })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Sentinel AI Verify"
      title="Confirm your email"
      subtitle="Enter the verification code from your inbox before the account can sign in."
      footer={(
        <p>
          Wrong address? <button type="button" className="auth-link-button" onClick={onGoToLogin}>Back to sign in</button>
        </p>
      )}
    >
      <div className="auth-copy">
        <h2>Verification required</h2>
        <p>{statusMessage || 'Use the code from your inbox to activate this account.'}</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => {
              setResendMessage('')
              onVerificationStateChanged({ email: event.target.value })
            }}
            placeholder="you@company.com"
            required
          />
        </label>

        <label className="field">
          <span>Verification code</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            required
          />
        </label>

        {error ? <div className="auth-error">{error}</div> : null}

        <div className="auth-actions">
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Verifying...' : 'Verify email'}
          </button>
          <button className="btn auth-secondary" type="button" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
