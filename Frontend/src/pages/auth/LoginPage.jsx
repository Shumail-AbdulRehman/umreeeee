import { useState } from 'react'

import { loginUser } from '../../services/auth/authService'
import AuthShell from './AuthShell'

export default function LoginPage({ onAuthenticated, onVerificationRequired }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await loginUser(form)
      if (response?.requires_verification) {
        onVerificationRequired(response)
        return
      }
      onAuthenticated(response)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Sentinel AI Control"
      title="Sign in to the workspace"
      subtitle="Use your account to access your organization workspace and its policy-protected prompts."
      footer={(
        <p>
          Need an account? <a href="#signup">Create one</a>
        </p>
      )}
    >
      <div className="auth-copy">
        <h2>Welcome back</h2>
        <p>Enter your email and password to continue.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
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
          <span>Password</span>
          <input
            autoComplete="current-password"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
            placeholder="Minimum 8 characters"
            required
          />
        </label>

        <div className="auth-inline-actions">
          <button type="button" className="auth-link-button" onClick={() => { window.location.hash = 'forgot-password' }}>
            Forgot password?
          </button>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
