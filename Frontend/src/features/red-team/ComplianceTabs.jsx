import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { Badge } from '../../components/ui/badge.jsx'
import { controlStatusLabel } from './labels.js'
import './red-team.css'

const FRAMEWORK_ORDER = { owasp: 0, nist: 1, atlas: 2, eu: 3 }
const RULE =
  'A control fails when any mapped attack worked, and passes when mapped attacks were decided and none worked. Synthetic coverage, not certification.'

function summary({ failed, passed, not_tested }) {
  if (![failed, passed, not_tested].every(Number.isFinite)) return 'Control counts unavailable'
  return `${failed} failed · ${passed} passed · ${not_tested} not tested`
}

function evidence({ status, reason, worked, decided }) {
  if (status === 'not_tested') return reason?.trim() ? reason : 'Reason not available.'
  if (status !== 'passed' && status !== 'failed') return 'Control decision not available.'
  if (!Number.isFinite(worked) || !Number.isFinite(decided)) return 'Attack counts not available.'
  return `${worked} of ${decided} mapped attacks worked`
}

function ControlList({ controls }) {
  if (!controls?.length) return <p className="rt-empty">No control results for this framework.</p>
  return (
    <ul role="list" className="m-0 list-none px-[18px] pt-[6px] pb-[14px]">
      {controls.map((control) => {
        const status = controlStatusLabel(control.status)
        return (
          <li key={control.key ?? control.id}
            className="grid grid-cols-[96px_minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 border-t border-[var(--rt-line-subtle)] py-[11px] text-[13px] first:border-t-0 max-[1180px]:grid-cols-[96px_minmax(0,1fr)_110px] max-[600px]:grid-cols-[minmax(0,1fr)_auto] max-[600px]:gap-x-2.5">
            <span className="rt-mono rt-muted wrap-anywhere text-xs max-[600px]:col-span-full">{control.id}</span>
            <span className="wrap-anywhere font-medium">{control.name}</span>
            <Badge variant="ghost" className={`rt-badge rt-badge-sm rt-tone-${status.tone} justify-self-start transition-none!`}>
              {status.label}
            </Badge>
            <span className="rt-muted wrap-anywhere text-xs max-[1180px]:col-start-2 max-[1180px]:col-end-[-1] max-[600px]:col-span-full">
              {evidence(control)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default function ComplianceTabs({ compliance, provisional = false }) {
  const base = useId()
  const tablist = useRef(null)
  const detachedFocus = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const frameworks = provisional || !Array.isArray(compliance) ? [] : compliance
    .map((framework) => ({ ...framework, id: framework.id ?? framework.framework }))
    .sort((left, right) => (FRAMEWORK_ORDER[left.id] ?? Infinity) - (FRAMEWORK_ORDER[right.id] ?? Infinity))
  const activeId = frameworks.find(({ id }) => id === selectedId)?.id ?? frameworks[0]?.id ?? null
  if (selectedId !== activeId) setSelectedId(activeId)

  const trackTab = useCallback((node) => {
    if (!node) return
    return () => {
      if (node.ownerDocument.activeElement === node) detachedFocus.current = node
    }
  }, [])

  useLayoutEffect(() => {
    const removed = detachedFocus.current
    detachedFocus.current = null
    if (removed && !removed.isConnected && removed.ownerDocument.activeElement === removed.ownerDocument.body) {
      tablist.current?.querySelector('[aria-selected="true"]')?.focus()
    }
  }, [activeId])

  if (provisional || !frameworks.length) {
    return (
      <section className="rt-panel" aria-labelledby={`${base}-title`}>
        <div className="rt-panel-head">
          <h2 className="rt-panel-title" id={`${base}-title`}>Compliance coverage</h2>
        </div>
        <p className="rt-empty">
          {provisional ? 'Control results are available after the run finishes.' : 'No framework coverage is available for this test.'}
        </p>
      </section>
    )
  }

  const onKeyDown = (event, index) => {
    const last = frameworks.length - 1
    const targets = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }
    if (!Object.hasOwn(targets, event.key)) return
    const target = targets[event.key]
    event.preventDefault()
    setSelectedId(frameworks[target].id)
    tablist.current?.children[target]?.focus()
  }

  return (
    <section className="rt-panel" aria-labelledby={`${base}-title`}>
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={`${base}-title`}>Compliance coverage</h2>
        <span className="rt-panel-note">{RULE}</span>
      </div>
      <div ref={tablist} role="tablist" aria-label="Framework"
        className="flex max-w-full gap-1 overflow-x-auto border-b border-[var(--rt-line-subtle)] px-3.5">
        {frameworks.map((framework, index) => (
          <button
            key={framework.id}
            ref={trackTab}
            type="button"
            role="tab"
            id={`${base}-tab-${framework.id}`}
            aria-selected={framework.id === activeId}
            aria-controls={`${base}-panel-${framework.id}`}
            tabIndex={framework.id === activeId ? 0 : -1}
            className="flex min-h-11 shrink-0 cursor-pointer flex-col items-start gap-0.5 border-b-2 border-transparent px-3 py-2 whitespace-nowrap text-[13px] font-medium text-[var(--rt-ink-secondary)] transition-none! aria-selected:border-[var(--rt-accent)] aria-selected:text-[var(--rt-accent)]"
            style={{ outlineOffset: -3 }}
            onClick={() => setSelectedId(framework.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {framework.name}
            <span className="rt-muted text-[11px] font-normal">{summary(framework.totals ?? framework)}</span>
          </button>
        ))}
      </div>
      {frameworks.map((framework) => (
        <div
          key={framework.id}
          role="tabpanel"
          id={`${base}-panel-${framework.id}`}
          aria-labelledby={`${base}-tab-${framework.id}`}
          className="transition-none!"
          tabIndex={framework.id === activeId ? 0 : -1}
          hidden={framework.id !== activeId}
        >
          <ControlList controls={framework.controls} />
        </div>
      ))}
    </section>
  )
}
