import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InlineLoadingBar } from '../components/LoadingSurface'
import { formatDate, formatNumber } from '../lib/format'
import { fetchLLMIntegrations } from '../services/integrations/llmIntegrationService'
import { fetchManagedUsers } from '../services/users/userManagementService'
import useRedTeamTest from '../hooks/useRedTeamTest'
import * as api from '../services/redTeam/redTeamService'
import TestList from '../features/red-team/TestList'
import TestEditor from '../features/red-team/TestEditor'
import RunProgress from '../features/red-team/RunProgress'
import ReportSummary from '../features/red-team/ReportSummary'
import ReportBreakdown from '../features/red-team/ReportBreakdown'
import { statusLabel } from '../features/red-team/labels'
import ComplianceTabs from '../features/red-team/ComplianceTabs'
import ResultsTable from '../features/red-team/ResultsTable'
import AttackDetailDialog from '../features/red-team/AttackDetailDialog'
import { CancelledBanner, FailedBanner, NoJudgeNote } from '../features/red-team/ReportStates'
import './red-team.css'

const terminal = new Set(['completed', 'partially_failed', 'failed', 'cancelled'])
const emptyResults = { items: [], total: 0, counts: {}, page_size: 20 }
const navigate = (id = '', fresh = false) => { window.location.hash = fresh ? '#red-team?new=1' : id ? `#red-team?test=${encodeURIComponent(id)}` : '#red-team' }

function describeError(message, fields) {
  return [...new Set([message, ...Object.values(fields ?? {}).flat()].filter(Boolean))].join(' ')
}

function readiness(caps, now) {
  if (!caps) return undefined
  const stamp = caps.observed_at?.worker || caps.worker_observed_at || caps.worker_last_seen_at
  return {
    promptfoo: caps.promptfoo,
    broker_transport_reachable: caps.broker_transport_reachable,
    worker_observed: caps.worker_observed,
    dispatcher_observed: caps.dispatcher_observed,
    lastSeenSeconds: stamp ? Math.max(0, Math.round((now - Date.parse(stamp)) / 1000)) : undefined,
  }
}

function Workspace({ testId, fresh, capabilities, integrations, users, launchKeys }) {
  const { test, error: testError, setTest } = useRedTeamTest(testId)
  const [list, setList] = useState({ items: [], total: 0, page_size: 20 })
  const [listFilters, setListFilters] = useState({ query: '', status: '', mode: '' })
  const [page, setPage] = useState(1)
  const [resultQuery, setResultQuery] = useState({
    filters: { verdict: '', plugin: '', strategy: '', verdict_source: '' }, page: 1,
  })
  const [resultRead, setResultRead] = useState(null)
  const [reportRead, setReportRead] = useState(null)
  const [reportAttempt, setReportAttempt] = useState(0)
  const [detail, setDetail] = useState({ result: null, loading: false, error: '' })
  const [preview, setPreview] = useState({ yaml: '', loading: false, error: '', stale: false, signature: '' })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const saved = useRef(null)
  const detailRequest = useRef(0)
  const previewRequest = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false
    detailRequest.current += 1
    previewRequest.current += 1
  } }, [])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      api.listRedTeamTests({ page, q: listFilters.query, status: listFilters.status, mode: listFilters.mode })
        .then((value) => { if (active) setList(value) })
        .catch((problem) => { if (active) setError(problem.message) })
    }, listFilters.query ? 250 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [page, listFilters])

  const readableTest = fresh || test?.status === 'draft' ? null : test

  useEffect(() => {
    if (!readableTest) return undefined
    let active = true
    api.getRedTeamReport(readableTest.id)
      .then((data) => { if (active) setReportRead({ status: readableTest.status, attempt: reportAttempt, data }) })
      .catch(() => { if (active) setReportRead({ status: readableTest.status, attempt: reportAttempt, failed: true }) })
    return () => { active = false }
  }, [readableTest, reportAttempt])

  useEffect(() => {
    if (!readableTest) return undefined
    let active = true
    const { filters } = resultQuery
    const query = {
      plugin: filters.plugin, strategy: filters.strategy, verdict_source: filters.verdict_source,
      verdict: filters.verdict, page: resultQuery.page,
    }
    api.listRedTeamResults(readableTest.id, query)
      .then((data) => { if (active) setResultRead({ status: readableTest.status, query: resultQuery, data }) })
      .catch(() => { if (active) setResultRead({ status: readableTest.status, query: resultQuery, failed: true }) })
    return () => { active = false }
  }, [readableTest, resultQuery])

  const run = async (operation) => {
    setBusy(true); setError(''); setFieldErrors({})
    try { await operation() }
    catch (problem) {
      if (mounted.current) {
        setError(problem.message)
        setFieldErrors(problem.fieldErrors || {})
      }
    } finally { if (mounted.current) setBusy(false) }
  }

  const save = (values, launch) => run(async () => {
    const signature = JSON.stringify(values)
    let draft = saved.current?.signature === signature ? saved.current.test : null
    if (!draft) {
      const prior = saved.current?.test || test
      const response = prior
        ? await api.updateRedTeamTest(prior.id, { ...values, version: prior.version })
        : await api.createRedTeamTest(values)
      draft = response.test
      saved.current = { signature, test: draft }
    }
    if (launch) {
      const fingerprint = `${draft.id}:${draft.version}`
      if (!launchKeys.current.has(fingerprint)) launchKeys.current.set(fingerprint, crypto.randomUUID())
      const response = await api.launchRedTeamTest(draft.id, draft.version, launchKeys.current.get(fingerprint))
      if (!mounted.current) return
      if (draft.id === testId) setTest(response.test)
    } else if (draft.id === testId) setTest(draft)
    if (mounted.current) navigate(draft.id)
  })

  const clone = (mode) => run(async () => {
    const response = await api.cloneRedTeamTest(test.id, mode)
    if (mounted.current) navigate(response.test.id)
  })
  const openResult = async (id, { input } = {}) => {
    const request = ++detailRequest.current
    setDetail({ result: null, loading: true, error: '', input })
    try {
      const response = await api.getRedTeamResult(test.id, id)
      if (mounted.current && request === detailRequest.current) setDetail({ result: response.result, loading: false, error: '', input })
    } catch (problem) {
      if (mounted.current && request === detailRequest.current) setDetail({ result: null, loading: false, error: problem.message, input })
    }
  }
  const closeDetail = () => { detailRequest.current += 1; setDetail({ result: null, loading: false, error: '' }) }
  const changeResultQuery = (next) => {
    closeDetail()
    setResultQuery(next)
  }
  const editor = fresh || test?.status === 'draft'
  const running = test && !terminal.has(test.status) && !editor
  const callTotals = [
    test?.model_calls != null && `${formatNumber(test.model_calls)} model calls`,
    test?.judge_calls != null && `${formatNumber(test.judge_calls)} judge calls`,
  ].filter(Boolean).join(' · ')
  const currentReport = reportRead?.status === test?.status && reportRead?.attempt === reportAttempt ? reportRead : null
  const report = currentReport?.data
  const reportStatus = statusLabel(test?.status)
  const runMode = test?.mode === 'raw' ? 'Raw' : 'With policies'
  const integrationName = test?.config_snapshot?.integration_name || report?.snapshot?.integration_name
  const resultsOpened = Boolean(resultRead && resultRead.status === test?.status)
  const currentResults = resultsOpened && resultRead.query === resultQuery ? resultRead : null
  const results = currentResults?.data ?? emptyResults
  const compliance = report?.compliance?.map((fw) => ({ ...fw, id: fw.framework || fw.id, ...fw.totals }))
  const visibleError = error || testError

  const loadPreview = async (values) => {
    const request = ++previewRequest.current
    setPreview((current) => ({ ...current, loading: true, error: '', stale: false }))
    try {
      const response = request === 1 && test?.id
        ? await api.getRedTeamTestConfigPreview(test.id)
        : test?.suite_id
          ? await api.previewRedTeamConfig(values, test.id)
          : await api.previewRedTeamConfig(values)
      if (mounted.current && request === previewRequest.current) {
        setPreview({ yaml: response.yaml, loading: false, error: '', stale: false, signature: JSON.stringify(values) })
      }
    } catch (problem) {
      if (mounted.current && request === previewRequest.current) {
        setPreview((current) => ({ ...current, loading: false, error: describeError(problem.message, problem.fieldErrors) || 'Preview failed' }))
      }
    }
  }

  return <div className="red-team-page">
    {visibleError && !editor && <div className="rt-banner rt-tone-fail" role="alert">{visibleError}</div>}
    {!testId && !fresh ? <TestList {...listFilters} items={list.items} total={list.total} page={page}
      pageSize={list.page_size} readiness={readiness(capabilities, now)}
      onFilterChange={(next) => { setListFilters(next); setPage(1) }} onPageChange={setPage}
      onNew={() => navigate('', true)} onOpen={navigate} /> : <>
      <div className="rt-page-actions"><Button variant="ghost" onClick={() => navigate()}>Back to tests</Button></div>
      {testId && !test && !testError && <p role="status">Loading test…</p>}
      {editor && <><h1 className="rt-page-title">{test ? 'Edit draft test' : 'New Red Team test'}</h1>
        <TestEditor initial={test} capabilities={capabilities} integrations={integrations} users={users}
          busy={busy} fieldErrors={fieldErrors} message={describeError(visibleError, fieldErrors)}
          preview={preview} onPreview={loadPreview}
          onSaveDraft={(values) => save(values, false)} onLaunch={(values) => save(values, true)} onCancel={() => navigate()} /></>}
      {test && !editor && <>
        <header className={running ? 'rt-page-heading' : 'rt-page-heading rt-finished-heading'}>
          <div>
            {!running && <div className="rt-finished-status">
              <span className={`rt-badge rt-badge-sm rt-tone-${reportStatus.tone}`}>{reportStatus.label}</span>
              <span>{test.mode === 'raw' ? 'Raw model' : runMode}</span>
            </div>}
            <h1 className="rt-page-title">{test.name}</h1>
            <p className="rt-muted">{[
              running && runMode,
              integrationName,
              test.model,
              running && test.status.replaceAll('_', ' '),
              test.finished_at && formatDate(test.finished_at),
            ].filter(Boolean).join(' · ')}</p>
            {callTotals && <p className="rt-muted">{callTotals}</p>}
          </div>
          {!running && <div className="rt-page-actions">
            {report?.paired ? <Button variant="outline" onClick={() => navigate(report.paired.test_id)}>Open paired run <ArrowUpRight aria-hidden="true" /></Button>
              : <Button variant="outline" disabled={busy} onClick={() => clone(test.mode === 'raw' ? 'protected' : 'raw')}>Clone as {test.mode === 'raw' ? 'protected' : 'raw'}</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" disabled={busy}>Export <ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {['json', 'csv'].map((format) => <DropdownMenuItem key={format}
                  onSelect={() => run(() => api.downloadRedTeamExport(test.id, format))}>Download {format.toUpperCase()}</DropdownMenuItem>)}
                <DropdownMenuItem onSelect={() => window.print()}>Print / Save PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>}
        </header>
        {running ? <RunProgress test={test} provisional={{ attack_success_rate: report?.attack_success?.rate,
          worked: report?.attack_success?.worked, decided: report?.attack_success?.decided }}
          latest={results.items}
          requestsPerMinute={capabilities?.requests_per_minute} dispatchPending={test.dispatch_pending}
          updatedAgo={test.updated_at ? Math.max(0, Math.floor((now - Date.parse(test.updated_at)) / 1000)) : 0}
          busy={busy || test.status === 'cancelling'} onCancel={() => run(async () => { const next = await api.cancelRedTeamTest(test.id); if (mounted.current) setTest(next.test) })} /> :
          <div className="rt-page-report">
            {test.status === 'cancelled' && <CancelledBanner finished={test.counts?.executed} total={test.counts?.planned} onClone={() => clone(test.mode)} />}
            {test.status === 'failed' && <FailedBanner failureReason={test.failure_reason}
              errorCode={results.items.find((r) => r.error_code)?.error_code}
              total={test.counts?.planned} actionLabel="Clone and try again" onAction={() => clone(test.mode)} />}
            {report ? <>
              <ReportSummary report={report} mode={test.mode} />
              <ReportBreakdown key={test.id} plugins={report.plugins} strategies={report.strategies} paired={report.paired} />
              <ComplianceTabs compliance={compliance} provisional={report.provisional} />
              {!test.grader && report.decided?.inconclusive > 0 && <NoJudgeNote undecided={report.decided.inconclusive} onClone={() => clone(test.mode)} />}
            </> : currentReport?.failed ? <div className="rt-panel rt-panel-body">
              <p className="rt-banner rt-tone-fail" role="alert">Could not load report.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setReportAttempt((attempt) => attempt + 1)}>Retry report</Button>
            </div> : <InlineLoadingBar label="Loading report…" />}
            {resultsOpened ? <ResultsTable {...results} items={results.items.map((row) => ({ ...row, plugin_name: row.plugin_name || row.category,
              strategy_name: row.strategy_name || 'Plain' }))} filters={resultQuery.filters} plugins={capabilities?.plugins}
              strategies={capabilities?.strategies} page={resultQuery.page} pageSize={results.page_size}
              loading={!currentResults} error={currentResults?.failed} onRetry={() => changeResultQuery({ ...resultQuery })}
              onFilterChange={(next) => changeResultQuery({ filters: next, page: 1 })}
              onPageChange={(page) => changeResultQuery({ ...resultQuery, page })} onView={openResult} />
              : <InlineLoadingBar label="Loading results…" />}
          </div>}
      </>}
    </>}
    <AttackDetailDialog {...detail} mode={test?.mode} onClose={closeDetail} />
  </div>
}

export default function RedTeamPage({ testId = '' }) {
  const [hash, setHash] = useState(() => window.location.hash)
  const [context, setContext] = useState({ capabilities: null, integrations: [], users: [] })
  const [error, setError] = useState('')
  const launchKeys = useRef(new Map())
  useEffect(() => {
    const change = () => setHash(window.location.hash)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api.redTeamCapabilities(), fetchLLMIntegrations(), fetchManagedUsers('?page_size=100&status=active')])
      .then(([capabilities, integrations, people]) => { if (active) setContext({ capabilities, integrations, users: people.items || [] }) })
      .catch((problem) => { if (active) setError(problem.message) })
    return () => { active = false }
  }, [])
  const params = new URLSearchParams(hash.split('?')[1] || '')
  const fresh = params.get('new') === '1'
  const id = fresh ? '' : params.get('test') || testId
  if (error) return <div className="rt-banner rt-tone-fail" role="alert">{error}</div>
  return <Workspace key={fresh ? 'new' : id || 'list'} {...context} testId={id} fresh={fresh} launchKeys={launchKeys} />
}
