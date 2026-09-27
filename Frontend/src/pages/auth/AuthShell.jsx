export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}) {
  return (
    <div className="auth-root">
      <section className="auth-hero">
        <div className="auth-badge">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="auth-hero-grid">
          <div>
            <span className="auth-stat-label">Security</span>
            <strong>JWT sessions</strong>
          </div>
          <div>
            <span className="auth-stat-label">Storage</span>
            <strong>Hashed credentials</strong>
          </div>
          <div>
            <span className="auth-stat-label">Access</span>
            <strong>FastAPI REST</strong>
          </div>
          <div>
            <span className="auth-stat-label">State</span>
            <strong>Persistent login</strong>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </section>
    </div>
  )
}
