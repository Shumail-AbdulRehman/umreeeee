import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { commitStaffCsv, fetchStaffImport, fetchStaffImportByRequest, validateStaffCsv } from '../../services/users/staffImportService'
import { StaffReceipt, StaffReview, StaffUpload } from './StaffImportViews'
import { MAX_CSV_BYTES } from './staffImportCsv'
import './staff-import.css'

const steps = ['Upload CSV', 'Review rows', 'Import complete']

function receiptUrl(id) {
  return `#users?import=${encodeURIComponent(id)}`
}

function showReceipt(id) {
  window.history.replaceState(window.history.state, '', receiptUrl(id))
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export default function StaffImportPage({ user, receiptId }) {
  const storageKey = `averiq.staff-import.pending.${user.company.id}.${user.id}`
  const [resumeKey, setResumeKey] = useState(() => receiptId ? null : sessionStorage.getItem(storageKey))
  const [draft, setDraft] = useState(null)
  const [fileIssues, setFileIssues] = useState([])
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const fileInput = useRef(null)
  const currentValidation = useRef(null)
  const commitLock = useRef(false)
  const mounted = useRef(false)
  const visibleReceipt = receipt?.id === receiptId ? receipt : null
  const activeStep = receiptId ? 2 : draft ? 1 : 0
  const reviewedValidation = draft?.validation
  const visibleReceiptId = visibleReceipt?.id

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; currentValidation.current?.abort() }
  }, [])

  useEffect(() => {
    if (!receiptId && !resumeKey) return undefined
    const controller = new AbortController()
    let timer
    const load = async () => {
      try {
        const next = receiptId ? await fetchStaffImport(receiptId, controller.signal)
          : await fetchStaffImportByRequest(resumeKey, controller.signal)
        if (controller.signal.aborted) return
        setReceipt(next)
        setLoadError(null)
        if (resumeKey) {
          sessionStorage.removeItem(storageKey)
          setResumeKey(null)
          showReceipt(next.id)
        } else if (next.invitations_pending > 0) {
          timer = setTimeout(load, 4000)
        }
      } catch (problem) {
        if (controller.signal.aborted) return
        setLoadError({ message: problem.message, status: problem.status })
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [receiptId, resumeKey, storageKey, loadAttempt])

  useEffect(() => {
    if (reviewedValidation && !resumeKey && !receiptId) document.getElementById('staff-review-title')?.focus()
    if (visibleReceiptId) document.getElementById('staff-receipt-title')?.focus()
  }, [reviewedValidation, resumeKey, receiptId, visibleReceiptId])

  function onFiles(files) {
    if (commitLock.current || !files?.length) return
    if (files.length !== 1) {
      currentValidation.current?.abort()
      setChecking(false)
      setDraft(null)
      setFileIssues([{ reason: 'Choose one CSV file at a time.' }])
      return
    }
    void checkFile(files[0])
  }

  async function checkFile(file) {
    currentValidation.current?.abort()
    const controller = new AbortController()
    currentValidation.current = controller
    setDraft(null)
    setError('')
    setFileIssues([])
    if (!/\.csv$/i.test(file.name) || file.size > MAX_CSV_BYTES) {
      setChecking(false)
      setFileIssues([/\.csv$/i.test(file.name)
        ? { reason: 'The CSV exceeds 256 KB.', fix: 'Split the file into smaller CSVs.' }
        : { reason: 'Choose a .csv file.', fix: 'In your spreadsheet, use Save as CSV.' }])
      return
    }
    setChecking(true)
    try {
      const validation = await validateStaffCsv(file, controller.signal)
      if (controller.signal.aborted) return
      if (validation.file_issues.length) setFileIssues(validation.file_issues)
      else setDraft({ file, validation, key: crypto.randomUUID() })
    } catch (problem) {
      if (!controller.signal.aborted) setError(problem.message)
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  async function confirm() {
    if (commitLock.current || !draft?.validation.validation_proof || draft.validation.invalid) return
    commitLock.current = true
    setSubmitting(true)
    setError('')
    const { file, validation, key } = draft
    sessionStorage.setItem(storageKey, key)
    try {
      const next = await commitStaffCsv(file, validation.validation_proof, key)
      if (!mounted.current) return
      sessionStorage.removeItem(storageKey)
      setResumeKey(null)
      setDraft(null)
      setReceipt(next)
      showReceipt(next.id)
    } catch (problem) {
      if (!mounted.current) return
      if (problem.validation?.rows?.length && problem.validation.invalid) {
        sessionStorage.removeItem(storageKey)
        setDraft({ file, validation: problem.validation, key })
        return
      } else if (problem.code === 'invalid_import_proof') {
        sessionStorage.removeItem(storageKey)
        await checkFile(file)
        return
      } else if (!problem.status || problem.status >= 500 || [408, 429].includes(problem.status)) {
        setResumeKey(key)
      } else {
        sessionStorage.removeItem(storageKey)
      }
      setError(problem.message)
    } finally {
      commitLock.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  function startOver() {
    sessionStorage.removeItem(storageKey)
    setResumeKey(null)
    setLoadError(null)
    setError('')
    setFileIssues([])
    setDraft(null)
    setReceipt(null)
    if (receiptId) window.location.hash = 'users?import=1'
  }

  function retryCheck() {
    setLoadError(null)
    setLoadAttempt(attempt => attempt + 1)
  }

  function retryImport() {
    setResumeKey(null)
    setLoadError(null)
    if (draft) void confirm()
  }

  return <div className="staff-import">
    <header className="staff-intro">
      <a className="staff-back" href="#users"><ArrowLeft aria-hidden="true" size={16} /> Back to Users</a>
      <h1 className="h1">Import staff</h1>
      <p>Invite multiple employees to your workspace with one CSV file.</p>
    </header>
    <ol className="staff-steps" aria-label="Import steps">
      {steps.map((step, index) => <li key={step} aria-current={index === activeStep ? 'step' : undefined}
        className={index < activeStep ? 'is-complete' : undefined}>
        <span aria-hidden="true">{index + 1}</span>{step}
      </li>)}
    </ol>
    <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Staff CSV file" accept=".csv,text/csv"
      onChange={event => { onFiles(event.target.files); event.target.value = '' }} />
    {error && !resumeKey && <div className="staff-notice staff-problem" role="alert">{error}</div>}
    {loadError && <div className="staff-panel staff-recovery">
      <p role="alert">{loadError.message}</p>
      <div className="staff-actions">
        <Button variant="outline" onClick={retryCheck}>Check again</Button>
        {resumeKey && loadError.status === 404 && (draft
          ? <Button onClick={retryImport}>Retry import</Button>
          : <Button onClick={startOver}>Start a new import</Button>)}
      </div>
    </div>}
    {visibleReceipt ? <StaffReceipt receipt={visibleReceipt} onStart={startOver} />
      : receiptId || resumeKey ? !loadError && <p role="status" className="staff-panel staff-recovery">Checking import status…</p>
        : draft ? <StaffReview key={draft.key} preview={draft.validation} filename={draft.file.name} busy={submitting}
          onReplace={() => fileInput.current?.click()} onConfirm={confirm} />
          : <StaffUpload checking={checking} fileIssues={fileIssues} onFiles={onFiles} onChoose={() => fileInput.current?.click()} />}
  </div>
}
