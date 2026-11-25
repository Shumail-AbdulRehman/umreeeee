import { useEffect, useId, useRef, useState } from 'react'
import FieldErrors from '../../components/FieldErrors.jsx'
import { Button } from '../../components/ui/button.jsx'
import { Input } from '../../components/ui/input.jsx'
import { Textarea } from '../../components/ui/textarea.jsx'
import { estimateAttackLoad } from './attackEstimate.js'
import ConfigPreview from './ConfigPreview.jsx'
import { severityLabel } from './labels.js'
import './red-team.css'

const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
const linkButton = 'text-xs font-medium text-[var(--rt-accent)] underline-offset-4 hover:underline disabled:opacity-50'
const MAX_PLUGINS = 20
const MAX_STRATEGIES = 8
const DEFAULTS = {
  name: '', purpose: '', integration_id: '', model: '', mode: 'raw', subject_user_id: '',
  plugins: [], strategies: [], tests_per_plugin: 1, grader: { integration_id: '', model: '' },
  threshold_score: 0.8,
}

const idOf = (item) => String(item?.id ?? item?._id ?? '')

function toState(initial) {
  const merged = { ...DEFAULTS, ...(initial ?? {}) }
  return {
    ...merged,
    subject_user_id: merged.subject_user_id ?? '',
    plugins: [...new Set(merged.plugins ?? [])],
    strategies: [...new Set((merged.strategies ?? []).filter((id) => id !== 'basic'))],
    grader_integration_id: merged.grader?.integration_id ?? '',
    grader_model: merged.grader?.model ?? '',
    threshold_percent: Math.round(Number(merged.threshold_score ?? .8) * 100),
  }
}

function groupBy(items, key) {
  const groups = new Map()
  for (const item of items) {
    const group = item[key] || 'Other'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(item)
  }
  return [...groups]
}

function frameworkMapping(framework, plugins) {
  const offered = new Set(plugins.map((plugin) => plugin.id))
  const controls = Array.isArray(framework.controls) ? framework.controls : []
  const explicit = [framework.plugin_ids, framework.mapped_plugins, framework.plugins]
    .find((value) => Array.isArray(value)) ?? []
  const candidates = [...explicit]
  for (const control of controls) candidates.push(...(control.plugins ?? control.plugin_ids ?? []))
  if (!candidates.length) {
    for (const plugin of plugins) {
      const maps = plugin.frameworks
      if (Array.isArray(maps) && maps.includes(framework.id)) candidates.push(plugin.id)
      if (maps && typeof maps === 'object' && maps[framework.id]?.length) candidates.push(plugin.id)
    }
  }
  const pluginIds = [...new Set(candidates.filter((id) => offered.has(id)))]
  const unmapped = controls.filter((control) => {
    const ids = control.plugins ?? control.plugin_ids ?? []
    return !ids.some((id) => offered.has(id))
  }).length
  return { pluginIds, unmapped }
}

function formValues(state) {
  return {
    name: state.name.trim(),
    purpose: state.purpose.trim(),
    integration_id: state.integration_id,
    model: state.model,
    mode: state.mode,
    subject_user_id: state.mode === 'protected' ? state.subject_user_id || null : null,
    plugins: [...new Set(state.plugins)],
    strategies: [...new Set(state.strategies.filter((id) => id !== 'basic'))],
    tests_per_plugin: Number(state.tests_per_plugin),
    grader: { integration_id: state.grader_integration_id, model: state.grader_model },
    threshold_score: Number(state.threshold_percent) / 100,
  }
}

function validate(values, integrations, maxCalls, estimate) {
  const errors = {}
  const target = integrations.find((item) => idOf(item) === values.integration_id)
  const grader = integrations.find((item) => idOf(item) === values.grader.integration_id)
  if (values.name.length < 2) errors.name = ['Enter a test name of at least 2 characters.']
  if (values.purpose.length < 20) errors.purpose = ['Describe the target purpose in at least 20 characters.']
  if (!target) errors.integration_id = ['Choose an active target integration.']
  else if (!target.models?.includes(values.model)) errors.model = ['Choose a model enabled for this integration.']
  if (values.mode === 'protected' && !values.subject_user_id) errors.subject_user_id = ['Choose the person whose policies will be used.']
  if (!values.plugins.length) errors.plugins = ['Choose at least one plugin.']
  else if (values.plugins.length > MAX_PLUGINS) errors.plugins = [`Choose at most ${MAX_PLUGINS} plugins. ${values.plugins.length} selected.`]
  if (values.strategies.length > MAX_STRATEGIES) errors.strategies = [`Choose at most ${MAX_STRATEGIES} optional strategies. ${values.strategies.length} selected.`]
  if (!Number.isInteger(values.tests_per_plugin) || values.tests_per_plugin < 1 || values.tests_per_plugin > 10) {
    errors.tests_per_plugin = ['Cases per plugin must be from 1 to 10.']
  } else if (estimate.targetCalls > maxCalls) {
    errors.tests_per_plugin = [`This configuration needs ${estimate.targetCalls} target calls; the limit is ${maxCalls}.`]
  }
  if (!grader) errors.grader = ['Choose a grader integration and model.']
  else if (!grader.models?.includes(values.grader.model)) errors.grader = ['Choose a grader model enabled for this integration.']
  if (!(values.threshold_score >= 0 && values.threshold_score <= 1)) errors.threshold_score = ['Pass threshold must be from 0% to 100%.']
  return errors
}

function Field({ id, label, help, errors, field, children }) {
  const hasError = Boolean(errors?.[field]?.length)
  return (
    <div className="grid gap-1.5 text-sm" data-error-field={field}>
      <label htmlFor={id} className="font-medium text-[var(--rt-ink-secondary)]">{label}</label>
      {children}
      {help && <small id={`${id}-help`} className="text-xs text-[var(--rt-ink-muted)]">{help}</small>}
      {hasError && <FieldErrors errors={errors} field={field} />}
    </div>
  )
}

function Section({ id, title, children, actions, errorField }) {
  return (
    <section className="rt-panel" aria-labelledby={id} data-error-field={errorField}>
      <div className="rt-panel-head"><h2 id={id} className="rt-panel-title">{title}</h2>{actions}</div>
      <div className="rt-panel-body grid gap-4">{children}</div>
    </section>
  )
}

export default function TestEditor({
  initial, capabilities, integrations = [], users = [], fieldErrors = {}, message = '', busy = false,
  preview = {}, onSaveDraft, onLaunch, onCancel, onPreview,
}) {
  const uid = useId()
  const usesStoredSuite = Boolean(initial?.suite_id)
  const [state, setState] = useState(() => toState(initial))
  const previewRequested = useRef(false)
  const set = (patch) => setState((current) => ({ ...current, ...patch }))
  const usable = integrations.filter((item) => !item.status || item.status === 'active')
  const target = usable.find((item) => idOf(item) === state.integration_id)
  const grader = usable.find((item) => idOf(item) === state.grader_integration_id)
  const plugins = capabilities?.plugins ?? []
  const strategies = (capabilities?.strategies ?? []).filter((item) => item.id !== 'basic')
  const maxCalls = capabilities?.limits?.max_target_calls ?? capabilities?.max_target_calls ?? 200
  const estimate = estimateAttackLoad({
    plugins: state.plugins,
    strategies: state.strategies,
    testsPerPlugin: state.tests_per_plugin,
    catalog: capabilities?.strategies ?? [],
  })
  const values = formValues(state)
  const clientErrors = validate(values, usable, maxCalls, estimate)
  const errors = { ...clientErrors, ...fieldErrors }
  const errorFields = Object.keys(clientErrors)
  const capExceeded = estimate.targetCalls > maxCalls
  const runtimeReason = capabilities && capabilities.promptfoo?.available === false
    ? 'Promptfoo runtime is unavailable.'
    : capabilities && capabilities.promptfoo?.cloud_key_configured === false
      ? 'Promptfoo Cloud API key is not configured.'
      : ''

  useEffect(() => {
    if (!previewRequested.current && onPreview && capabilities && errorFields.length === 0) {
      previewRequested.current = true
      onPreview(values)
    }
  }, [onPreview, capabilities, errorFields.length, values])

  function focusFirstError() {
    const field = errorFields[0]
    const container = document.querySelector(`[data-error-field="${field}"]`)
    const control = container?.querySelector?.('input, textarea, select, button') ?? container
    control?.focus?.()
  }

  function submit(action) {
    if (errorFields.length) {
      focusFirstError()
      return
    }
    action?.(values)
  }

  function toggle(key, id) {
    set({ [key]: state[key].includes(id) ? state[key].filter((item) => item !== id) : [...state[key], id] })
  }

  function selectIntegration(key, modelKey, id) {
    const integration = usable.find((item) => idOf(item) === id)
    set({ [key]: id, [modelKey]: integration?.models?.[0] ?? '' })
  }

  function quickSelect(framework) {
    const mapping = frameworkMapping(framework, plugins)
    set({ plugins: [...new Set([...state.plugins, ...mapping.pluginIds])] })
  }

  const modelOptions = (integration, current) => {
    const models = integration?.models ?? []
    return current && !models.includes(current) ? [current, ...models] : models
  }
  const warning = runtimeReason || (errorFields.length ? clientErrors[errorFields[0]]?.[0] : '')
  const previewState = {
    ...preview,
    stale: preview.stale || Boolean(preview.signature && preview.signature !== JSON.stringify(values)),
  }

  return (
    <form className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" noValidate onSubmit={(event) => {
      event.preventDefault()
      if (!busy && !runtimeReason) submit(onLaunch)
    }}>
      <div className="grid min-w-0 gap-5">
        {message && <div className="rt-banner rt-tone-fail" role="alert">{message}</div>}
        <Section id={`${uid}-target`} title="Target">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${uid}-name`} label="Test name" errors={errors} field="name">
              <Input id={`${uid}-name`} value={state.name} maxLength={120} aria-invalid={Boolean(errors.name)} onChange={(event) => set({ name: event.target.value })} />
            </Field>
            <Field id={`${uid}-integration`} label="Integration" errors={errors} field="integration_id">
              <select id={`${uid}-integration`} className={selectClass} value={state.integration_id} aria-invalid={Boolean(errors.integration_id)} onChange={(event) => selectIntegration('integration_id', 'model', event.target.value)}>
                <option value="">Select integration</option>
                {usable.map((item) => <option key={idOf(item)} value={idOf(item)}>{item.account_name} · {item.provider}</option>)}
              </select>
            </Field>
            <Field id={`${uid}-model`} label="Model" errors={errors} field="model">
              <select id={`${uid}-model`} className={selectClass} value={state.model} aria-invalid={Boolean(errors.model)} onChange={(event) => set({ model: event.target.value })}>
                <option value="">Select model</option>
                {modelOptions(target, state.model).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </Field>
            <div className="grid gap-1.5 text-sm">
              <span id={`${uid}-mode`} className="font-medium text-[var(--rt-ink-secondary)]">Mode</span>
              <div role="radiogroup" aria-labelledby={`${uid}-mode`} className="inline-flex w-fit overflow-hidden rounded-md border border-[var(--rt-line)]">
                {[['raw', 'Raw model'], ['protected', 'With policies']].map(([value, label]) => (
                  <label key={value} className={`cursor-pointer px-3 py-2 text-sm ${state.mode === value ? 'bg-[var(--rt-accent-soft)] text-[var(--rt-accent)]' : 'text-[var(--rt-ink-secondary)]'}`}>
                    <input type="radio" className="rt-sr-only" name={`${uid}-mode`} checked={state.mode === value} onChange={() => set({ mode: value, subject_user_id: value === 'raw' ? '' : state.subject_user_id })} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {state.mode === 'protected' && <Field id={`${uid}-subject`} label="Run as" help="Their active group policies are frozen when the test launches." errors={errors} field="subject_user_id">
              <select id={`${uid}-subject`} className={selectClass} value={state.subject_user_id} aria-invalid={Boolean(errors.subject_user_id)} onChange={(event) => set({ subject_user_id: event.target.value })}>
                <option value="">Select a verified user</option>
                {users.filter((item) => item.is_active !== false && item.is_email_verified !== false).map((item) => <option key={idOf(item)} value={idOf(item)}>{[item.first_name, item.last_name].filter(Boolean).join(' ') || item.email}</option>)}
              </select>
            </Field>}
          </div>
          <Field id={`${uid}-purpose`} label="Purpose" help={usesStoredSuite ? 'This draft reuses the stored test cases and their generation settings.' : 'Describe what the target should do and what it should refuse. Promptfoo uses this to generate test cases.'} errors={errors} field="purpose">
            <Textarea id={`${uid}-purpose`} value={state.purpose} readOnly={usesStoredSuite} minLength={20} maxLength={2000} aria-invalid={Boolean(errors.purpose)} onChange={(event) => set({ purpose: event.target.value })} />
          </Field>
        </Section>

        <Section id={`${uid}-plugins`} title="What to attack" errorField="plugins" actions={<div className="flex gap-3">
          <button type="button" className={linkButton} disabled={usesStoredSuite} onClick={() => set({ plugins: plugins.map((item) => item.id) })}>Select all</button>
          <button type="button" className={linkButton} disabled={usesStoredSuite} onClick={() => set({ plugins: [] })}>Clear</button>
        </div>}>
          <p className="rt-panel-note">Select up to {MAX_PLUGINS} plugins.</p>
          <FieldErrors errors={errors} field="plugins" />
          {(capabilities?.frameworks ?? []).length > 0 && <div className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--rt-ink-secondary)]">Framework quick-select</span>
            <div className="flex flex-wrap gap-2">
              {capabilities.frameworks.map((framework) => {
                const mapping = frameworkMapping(framework, plugins)
                return <div key={framework.id} className="grid gap-1">
                  <Button type="button" variant="outline" disabled={usesStoredSuite || !mapping.pluginIds.length} onClick={() => quickSelect(framework)}>Use {framework.name}</Button>
                  {mapping.unmapped > 0 && <small className="text-xs text-[var(--rt-ink-muted)]">{mapping.unmapped} {mapping.unmapped === 1 ? 'control does' : 'controls do'} not map to offered plugins.</small>}
                </div>
              })}
            </div>
          </div>}
          {groupBy(plugins, 'group').map(([group, items]) => <fieldset key={group} disabled={usesStoredSuite} className="grid gap-1 border-0 p-0">
            <legend className="mb-1 text-xs font-semibold text-[var(--rt-ink-muted)]">{group}</legend>
            {items.map((plugin) => {
              const severity = severityLabel(plugin.severity)
              return <label key={plugin.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--rt-line-subtle)] px-3 py-2">
                <input type="checkbox" className="mt-1" checked={state.plugins.includes(plugin.id)} onChange={() => toggle('plugins', plugin.id)} />
                <span className="min-w-0 flex-1"><strong className="block text-sm font-medium text-[var(--rt-ink)]">{plugin.name}</strong><small className="block text-xs text-[var(--rt-ink-muted)]">{plugin.description}</small></span>
                <span className="flex shrink-0 flex-wrap gap-1"><span className={`rt-badge rt-badge-sm rt-tone-${severity.tone}`}>{severity.label}</span>{plugin.remote_only && <span className="rt-badge rt-badge-sm">Hosted generation</span>}</span>
              </label>
            })}
          </fieldset>)}
        </Section>

        <Section id={`${uid}-strategies`} title="How attacks are disguised" errorField="strategies">
          <p className="rt-panel-note">Baseline testing is always included once. Select up to {MAX_STRATEGIES} optional strategies.</p>
          <FieldErrors errors={errors} field="strategies" />
          {groupBy(strategies, 'group').map(([group, items]) => <fieldset key={group} disabled={usesStoredSuite} className="grid gap-2 border-0 p-0">
            <legend className="text-xs font-semibold text-[var(--rt-ink-muted)]">{group}</legend>
            <div className="grid gap-2 sm:grid-cols-2">{items.map((strategy) => <label key={strategy.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--rt-line-subtle)] px-3 py-2">
              <input type="checkbox" className="mt-1" checked={state.strategies.includes(strategy.id)} onChange={() => toggle('strategies', strategy.id)} />
              <span><strong className="block text-sm font-medium text-[var(--rt-ink)]">{strategy.name}</strong><small className="block text-xs text-[var(--rt-ink-muted)]">{strategy.description}</small><span className="mt-1 flex flex-wrap gap-1">{strategy.remote_only && <span className="rt-badge rt-badge-sm">Hosted generation</span>}{strategy.multi_turn && <span className="rt-badge rt-badge-sm">{strategy.target_calls_per_test} target calls per test case</span>}</span></span>
            </label>)}</div>
          </fieldset>)}
        </Section>

        <Section id={`${uid}-grader`} title="Grader" errorField="grader">
          <p className="rt-panel-note">Promptfoo sends each target reply to this organization integration for grading.</p>
          <FieldErrors errors={errors} field="grader" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${uid}-grader-integration`} label="Grader integration" errors={{}} field="grader">
              <select id={`${uid}-grader-integration`} className={selectClass} value={state.grader_integration_id} aria-invalid={Boolean(errors.grader)} onChange={(event) => selectIntegration('grader_integration_id', 'grader_model', event.target.value)}>
                <option value="">Select integration</option>
                {usable.map((item) => <option key={idOf(item)} value={idOf(item)}>{item.account_name} · {item.provider}</option>)}
              </select>
            </Field>
            <Field id={`${uid}-grader-model`} label="Grader model" errors={{}} field="grader">
              <select id={`${uid}-grader-model`} className={selectClass} value={state.grader_model} aria-invalid={Boolean(errors.grader)} onChange={(event) => set({ grader_model: event.target.value })}>
                <option value="">Select model</option>
                {modelOptions(grader, state.grader_model).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section id={`${uid}-settings`} title="Run settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${uid}-count`} label="Cases per plugin" help="From 1 to 10." errors={errors} field="tests_per_plugin">
              <Input id={`${uid}-count`} type="number" min={1} max={10} value={state.tests_per_plugin} readOnly={usesStoredSuite} aria-invalid={Boolean(errors.tests_per_plugin)} onChange={(event) => set({ tests_per_plugin: event.target.value === '' ? '' : Number(event.target.value) })} />
            </Field>
            <Field id={`${uid}-threshold`} label="Pass threshold" help="Share of graded cases that must be defended." errors={errors} field="threshold_score">
              <div className="flex items-center gap-2"><Input id={`${uid}-threshold`} type="number" min={0} max={100} value={state.threshold_percent} aria-invalid={Boolean(errors.threshold_score)} onChange={(event) => set({ threshold_percent: event.target.value === '' ? '' : Number(event.target.value) })} /><span aria-hidden="true">%</span></div>
            </Field>
          </div>
        </Section>
      </div>

      <aside className="grid min-w-0 gap-5 lg:sticky lg:top-4" aria-labelledby={`${uid}-summary`}>
        <div className="rt-panel">
          <div className="rt-panel-head"><h2 id={`${uid}-summary`} className="rt-panel-title">Summary</h2></div>
          <div className="rt-panel-body grid gap-4">
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt>{usesStoredSuite ? 'Stored test cases' : 'Generated test cases'}</dt><dd className="rt-num font-medium">{usesStoredSuite ? initial.counts?.planned ?? estimate.generatedTests : estimate.generatedTests}</dd></div>
              <div className="flex justify-between gap-3"><dt>Estimated target calls</dt><dd className="rt-num font-medium">{estimate.targetCalls} / {maxCalls}</dd></div>
            </dl>
            <p className="rt-panel-note">{usesStoredSuite ? 'Promptfoo reuses the saved test cases and evaluates them with the selected target and grader.' : 'Test cases are generated by promptfoo’s hosted service and graded by the selected grader model.'}</p>
            <p id={`${uid}-warning`} role="status" className={warning ? 'rt-banner rt-tone-warn' : 'rt-sr-only'}>{warning}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || capExceeded} onClick={() => submit(onSaveDraft)}>Save draft</Button>
              <Button type="submit" disabled={busy || Boolean(runtimeReason) || errorFields.length > 0} aria-describedby={`${uid}-warning`}>{busy ? 'Working…' : 'Launch test'}</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => onCancel?.()}>Cancel</Button>
            </div>
          </div>
        </div>
        <ConfigPreview {...previewState} values={values} onRefresh={onPreview} blocked={errorFields.length > 0} />
      </aside>
    </form>
  )
}
