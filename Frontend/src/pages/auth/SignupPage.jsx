import { useState } from 'react'

import { signupUser } from '../../services/auth/authService'
import AuthShell from './AuthShell'

export default function SignupPage({ onVerificationRequired }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    password: '',
    confirm_password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    setLoading(true)
    setError('')

    try {
      const response = await signupUser(form)
      onVerificationRequired(response)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Sentinel AI Access"
      title="Create your organization"
      subtitle="Start a new workspace. If your organization already exists, ask an administrator for an invitation."
      footer={(
        <p>
          Already registered? <a href="#login">Sign in</a>
        </p>
      )}
    >
      <div className="auth-copy">
        <h2>Create account</h2>
        <p>Use a work email, your company name, and a password with at least 8 characters.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>First name</span>
          <input
            autoComplete="given-name"
            name="first_name"
            type="text"
            value={form.first_name}
            onChange={updateField}
            placeholder="Maya"
            required
          />
        </label>

        <label className="field">
          <span>Last name</span>
          <input
            autoComplete="family-name"
            name="last_name"
            type="text"
            value={form.last_name}
            onChange={updateField}
            placeholder="Ramirez"
            required
          />
        </label>

        <label className="field">
          <span>Company</span>
          <input
            autoComplete="organization"
            name="company_name"
            type="text"
            value={form.company_name}
            onChange={updateField}
            placeholder="Sentinel AI Security"
            required
          />
        </label>

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
          <input
            autoComplete="new-password"
            name="confirm_password"
            type="password"
            value={form.confirm_password}
            onChange={updateField}
            placeholder="Re-enter your password"
            required
          />
        </label>

        {error ? <div className="auth-error">{error}</div> : null}

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
