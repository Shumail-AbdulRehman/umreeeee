import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowLeft, ArrowUpRight, CheckCircle2, PauseCircle, Shield, TriangleAlert, Users, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import {
  AccessBadge, AttentionBanners, AuditTable, CompanyMark, ErrorState, LoadingState,
  MetricStrip, OnboardingLabel, PeriodControl, WorkspaceChart,
} from './PlatformComponents'
import { getPlatformCompany, setPlatformCompanyStatus } from './platformService'
import usePlatformResource from './usePlatformResource'
import { formatDate } from './platformFormat'

function AccessDialog({ company, targetStatus, open, refreshing, refreshError, onOpenChange, onChanged, onConflict }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const returnFocus = useRef(null)
  const active = targetStatus === 'suspended'
  const action = active ? 'Suspend' : 'Reactivate'
  const alreadyApplied = company.status === targetStatus

  async function submit(event) {
    event.preventDefault()
    if (busy || refreshing || refreshError || alreadyApplied) return
    const trimmed = reason.trim()
    if (!trimmed) { setError('Enter a reason for the access change.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await setPlatformCompanyStatus(company.id, {
        status: targetStatus, version: company.version, reason: trimmed,
      })
      setReason('')
      onOpenChange(false)
      onChanged(result)
    } catch (problem) {
      if (problem.code === 'stale_version') {
        setError('This company changed. Its latest details are being loaded. Review them before confirming again.')
        onConflict()
      } else setError(problem.message || 'Access could not be changed. Try again.')
    } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return
    if (next) { returnFocus.current = document.activeElement; setError('') }
    onOpenChange(next)
  }}>
    <DialogContent className="platform-workspace platform-access-dialog" showCloseButton={false}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement }}
      onCloseAutoFocus={(event) => {
        const target = document.querySelector('[data-platform-access-action]') || returnFocus.current
        if (target?.isConnected) { event.preventDefault(); target.focus() }
      }}>
      <div className="dialog-header"><span className={`issue-icon ${active ? 'rose' : 'green'}`} aria-hidden="true">{active ? <PauseCircle /> : <CheckCircle2 />}</span>
        <button className="icon-button" type="button" aria-label="Close access dialog" disabled={busy} onClick={() => onOpenChange(false)}><X /></button></div>
      <DialogTitle>{action} {company.name}?</DialogTitle>
      <DialogDescription>{active ? 'Members lose access to the workspace while the company is suspended.' : 'Members regain access to the company workspace.'} This change is recorded in the audit log.</DialogDescription>
      <form onSubmit={submit}>
        <label className="reason-label" htmlFor="platform-access-reason">Reason</label>
        <textarea id="platform-access-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError('') }}
          placeholder="Why are you changing access?" maxLength={180} required disabled={busy}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'platform-access-error' : 'platform-access-consequences'} />
        <p className="dialog-caption" id="platform-access-consequences">{active ? 'External requests already sent may still finish. Existing sessions are blocked during suspension.' : 'Existing unexpired sessions may become usable again. Reactivation does not renew expired sessions.'}</p>
        {alreadyApplied && <p role="status">This company is already {active ? 'suspended' : 'active'}. Your intended access state is already in place; no additional change is needed.</p>}
        {error && !alreadyApplied && <p className="platform-error" id="platform-access-error" role="alert">{error}</p>}
        {refreshError && <div role="alert"><p>The latest company state could not be loaded. Your reason is preserved. Retry before confirming.</p><button type="button" className="button" onClick={onConflict}>Reload company details</button></div>}
        <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={() => onOpenChange(false)}>{alreadyApplied ? 'Close' : 'Cancel'}</button>
          {!alreadyApplied && <button type="submit" className={`button ${active ? 'confirm-danger' : 'primary'}`} disabled={busy || refreshing || Boolean(refreshError) || !reason.trim()}>{busy ? 'Updating access…' : `${action} company`}</button>}</div>
      </form>
    </DialogContent>
  </Dialog>
}

export default function PlatformCompany({ companyId, days = 7, onDaysChange, onMetadata }) {
  const { data, error, loading, reload } = usePlatformResource((signal) => getPlatformCompany(companyId, { days, signal }), [companyId, days])
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessIntent, setAccessIntent] = useState(null)
  const [notice, setNotice] = useState('')
  const focusAfterChange = useRef(false)

  useEffect(() => {
    if (data) onMetadata?.({ companyName: data.company.name, generatedAt: data.generated_at })
  }, [data, onMetadata])

  useEffect(() => {
    if (!loading && focusAfterChange.current) {
      focusAfterChange.current = false
      const selector = error ? '.platform-company-page .platform-error button' : '[data-platform-access-action]'
      document.querySelector(selector)?.focus()
    }
  }, [loading, error])

  if (!data && loading) return <LoadingState label="Loading company details…" />
  if (!data) return <><a className="back-link" href="#platform-companies"><ArrowLeft aria-hidden="true" />All companies</a><ErrorState error={error || new Error('Company details are unavailable.')} onRetry={reload} /></>

  const { company, metrics, history, series, window: interval, attention } = data
  const active = company.status === 'active'
  const coverage = metrics.evaluation_coverage
  const policy = metrics.policy_coverage
  const metricItems = [
    { label: 'Active accounts', value: metrics.active_accounts, description: `${metrics.verified_admins} verified admins`, tone: 'violet', icon: Users },
    { label: 'Workspace runs', value: company.workspace_runs, description: `${metrics.submitting_users} submitting users in ${days} days`, tone: 'green', icon: Activity },
    { label: 'Blocked runs', value: metrics.blocked_runs, description: `${metrics.other_runs} other outcomes`, tone: 'amber', icon: Shield },
    { label: 'Open violations', value: company.open_violations, description: `${company.high_severity_violations} high severity`, tone: 'rose', icon: TriangleAlert },
  ]

  return <div className="platform-company-page" aria-busy={loading}>
    <a className="back-link" href="#platform-companies"><ArrowLeft aria-hidden="true" />All companies</a>
    <div className="page-heading company-heading"><div className="company-heading-start"><CompanyMark company={company} /><div><h1>{company.name}</h1><p>{company.slug} · Joined {formatDate(company.created_at, { dateOnly: true })}</p></div></div>
      <div className="heading-actions"><AccessBadge status={company.status} />{company.is_own ? <span className="muted">Your organization</span> : <button data-platform-access-action className={`button ${active ? 'danger' : 'primary'}`} type="button" disabled={loading || Boolean(error)} onClick={() => { setAccessIntent(active ? 'suspended' : 'active'); setAccessOpen(true) }}>{active ? <PauseCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{active ? 'Suspend company' : 'Reactivate company'}</button>}</div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <ErrorState error={error} onRetry={reload} />}
    <AttentionBanners items={attention} />
    <div className="section-row"><div><h2>Company overview</h2><p>Current setup and recorded workspace outcomes</p></div><PeriodControl days={days} onChange={onDaysChange} /></div>
    <MetricStrip items={metricItems} />
    <div className="dashboard-grid"><WorkspaceChart series={series} window={interval} title="Company activity" />
      <section className="panel setup-panel" aria-labelledby="platform-setup-title"><div className="panel-head"><div><h2 id="platform-setup-title">Workspace setup</h2><p>Onboarding and policy readiness</p></div><OnboardingLabel status={company.onboarding} /></div>
        <dl className="setup-list">
          <div><dt>Verified administrators</dt><dd>{metrics.verified_admins}</dd></div>
          <div><dt>Pending invitations</dt><dd>{metrics.pending_invitations}{metrics.failed_invitations > 0 && <small> · {metrics.failed_invitations} failed delivery</small>}</dd></div>
          <div><dt>Active integrations</dt><dd>{metrics.active_integrations}</dd></div>
          <div><dt>Active groups</dt><dd>{metrics.active_groups}</dd></div>
          <div><dt>Configured policies</dt><dd>{metrics.dlp_policies} DLP · {metrics.guardrail_policies} Guardrail</dd></div>
        </dl>
        <div className="coverage"><div><strong>Evaluation coverage</strong><span>{coverage === null ? 'Unavailable' : `${Number(coverage.toFixed(1))}%`}</span></div>
          {coverage !== null && <progress max={100} value={coverage} aria-label="Workspace runs evaluated" />}
          <p>{coverage === null ? 'Coverage appears when workspace runs are evaluated.' : 'Recorded terminal runs with completed policy checks.'}</p>
          {policy && <p>{policy.required ? `${policy.covered_members} of ${policy.eligible_members} eligible members have input-policy coverage for every active integration.` : 'Input policies are optional for ordinary members.'}</p>}
        </div>
      </section>
    </div>
    <section className="panel directory-panel" aria-labelledby="platform-history-title"><div className="panel-head"><div><h2 id="platform-history-title">Company history</h2><p>Workspace milestones and platform actions</p></div><a className="button" href={`#platform-audit?company_id=${encodeURIComponent(company.id)}`}>View audit log<ArrowUpRight aria-hidden="true" /></a></div><AuditTable items={history.items} companyDetail /></section>
    {!company.is_own && <AccessDialog company={company} targetStatus={accessIntent} open={accessOpen} refreshing={loading} refreshError={error} onOpenChange={setAccessOpen} onConflict={reload} onChanged={(result) => {
      focusAfterChange.current = true
      setNotice(`${company.name} ${result.organization.status === 'suspended' ? 'suspended' : 'reactivated'}. The change was added to the audit log.`)
      reload()
    }} />}
  </div>
}
