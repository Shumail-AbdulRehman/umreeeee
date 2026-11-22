import { useId, useRef, useState } from 'react'
import { controlStatusLabel } from './labels.js'
import './red-team.css'

const RULE =
  'A control fails when any mapped attack worked, and passes when mapped attacks were decided and none worked. Synthetic coverage, not certification.'

const styles = {
  tablist: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--rt-line-subtle)' },
  tab: (on) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px',
    minHeight: 44, border: 0, borderBottom: `2px solid ${on ? 'var(--rt-accent)' : 'transparent'}`,
    background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500,
    color: on ? 'var(--rt-ink)' : 'var(--rt-ink-secondary)', textAlign: 'left',
  }),
  tabCount: { fontSize: 12, fontWeight: 400, color: 'var(--rt-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 96px) minmax(0, 2fr) auto minmax(0, 2fr)',
    gap: 12, alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--rt-line-subtle)', fontSize: 13,
  },
}

function evidence(control) {
  if (control.status === 'not_tested') return control.reason || ''
  return `${control.worked} of ${control.decided} mapped attacks worked`
}

export default function ComplianceTabs({ compliance, provisional = false }) {
  const base = useId()
  const [selected, setSelected] = useState(0)
  const tabRefs = useRef([])
  const frameworks = Array.isArray(compliance) ? compliance : []

  if (provisional || !Array.isArray(compliance)) {
    return (
      <section className="rt-panel" aria-labelledby={`${base}-title`}>
        <div className="rt-panel-head">
          <h2 className="rt-panel-title" id={`${base}-title`}>Compliance coverage</h2>
        </div>
        <p className="rt-panel-body rt-muted">Compliance is calculated when the test finishes</p>
      </section>
    )
  }

  const active = Math.min(selected, Math.max(frameworks.length - 1, 0))
  const select = (index, focus) => {
    setSelected(index)
    if (focus) tabRefs.current[index]?.focus()
  }
  const onKeyDown = (event, index) => {
    const last = frameworks.length - 1
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key]
    if (target === undefined) return
    event.preventDefault()
    select(target, true)
  }

  return (
    <section className="rt-panel" aria-labelledby={`${base}-title`}>
      <div className="rt-panel-head">
        <h2 className="rt-panel-title" id={`${base}-title`}>Compliance coverage</h2>
        <span className="rt-panel-note">{RULE}</span>
      </div>
      {frameworks.length === 0 ? (
        <p className="rt-panel-body rt-muted">No framework coverage is available for this test.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Framework" style={styles.tablist}>
            {frameworks.map((fw, index) => (
              <button
                key={fw.id}
                type="button"
                role="tab"
                id={`${base}-tab-${fw.id}`}
                aria-selected={index === active}
                aria-controls={`${base}-panel-${fw.id}`}
                tabIndex={index === active ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node }}
                style={styles.tab(index === active)}
                onClick={() => select(index, false)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {fw.name}
                <span style={styles.tabCount}>
                  {fw.failed} failed · {fw.passed} passed · {fw.not_tested} not tested
                </span>
              </button>
            ))}
          </div>
          {frameworks.map((fw, index) => (
            <div
              key={fw.id}
              role="tabpanel"
              id={`${base}-panel-${fw.id}`}
              aria-labelledby={`${base}-tab-${fw.id}`}
              tabIndex={0}
              hidden={index !== active}
            >
              <ul style={styles.list}>
                {(fw.controls || []).map((control) => {
                  const status = controlStatusLabel(control.status)
                  return (
                    <li key={control.key} className="rt-compliance-control" style={styles.row}>
                      <span className="rt-mono rt-compliance-id">{control.id ?? ''}</span>
                      <span className="rt-compliance-name">{control.name}</span>
                      <span className={`rt-badge rt-badge-sm rt-compliance-status rt-tone-${status.tone}`}>{status.label}</span>
                      <span className="rt-muted rt-compliance-evidence">{evidence(control)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
