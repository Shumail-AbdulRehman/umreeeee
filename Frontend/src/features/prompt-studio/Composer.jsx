import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export default function Composer({
  form,
  setForm,
  onSubmit,
  onKeyDown,
  promptRef,
  selected,
  integrations,
  busy,
  loadingChat,
  historyReady,
  historyUnavailable,
  historyLoading,
  policySetupRequired,
  error,
  onRetryHistory,
  chat,
  contextNote,
}) {
  const textareaRef = useRef(null)
  const temperatureRef = useRef(null)
  const tokensRef = useRef(null)
  const invalidSettingRef = useRef(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  useImperativeHandle(promptRef, () => textareaRef.current, [])

  useLayoutEffect(() => {
    const field = textareaRef.current
    if (!field) return
    const style = getComputedStyle(field)
    const maxHeight = Number.parseFloat(style.maxHeight)
    if (!Number.isFinite(maxHeight) || !field.scrollHeight) return

    field.style.height = 'auto'
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    const naturalHeight = style.boxSizing === 'border-box' ? field.scrollHeight + border : field.scrollHeight - padding
    const height = Math.max(Number.parseFloat(style.minHeight) || 0, Math.min(naturalHeight, maxHeight))
    field.style.height = `${height}px`
    field.style.overflowY = naturalHeight > maxHeight ? 'auto' : 'hidden'
  }, [form.prompt])

  function revealInvalidSetting(event, setting) {
    event.preventDefault()
    if (!invalidSettingRef.current) invalidSettingRef.current = setting
    setOptionsOpen(true)
  }

  return (
    <form id="studio-composer-form" className="studio-composer" aria-label="Message composer" aria-busy={busy} onSubmit={onSubmit}>
      {error && <p className="studio-form-error" role="alert">{error}</p>}
      {(!historyReady || historyUnavailable) && !historyLoading && (
        <div className="studio-history-notice" role="status">
          <span>Sending is paused until chat history is available.</span>
          <Button type="button" variant="ghost" onClick={onRetryHistory}>Retry</Button>
        </div>
      )}
      {/* Keep native generation limits active while the portal fields are unmounted. */}
      {!optionsOpen && <>
        <input hidden aria-hidden="true" tabIndex={-1} disabled={busy} type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} onInvalid={(event) => revealInvalidSetting(event, 'temperature')} />
        <input hidden aria-hidden="true" tabIndex={-1} disabled={busy} type="number" min="1" max="8192" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })} onInvalid={(event) => revealInvalidSetting(event, 'max_tokens')} />
      </>}
      <label className="studio-prompt-label sr-only" htmlFor="studio-prompt">{chat ? 'Continue the conversation' : 'Start a conversation'}</label>
      <textarea
        id="studio-prompt"
        ref={textareaRef}
        required
        disabled={busy || loadingChat}
        maxLength="24000"
        rows="2"
        placeholder={chat ? 'Ask a follow-up…' : 'Message Averiq…'}
        value={form.prompt}
        onKeyDown={onKeyDown}
        onChange={(event) => setForm({ ...form, prompt: event.target.value })}
      />
      <div className="studio-composer-controls">
        <label>
          <span className="sr-only">Integration</span>
          <select required disabled={busy || loadingChat} value={form.integration_id} onChange={(event) => {
            const integration = integrations.find((item) => item.id === event.target.value)
            setForm({ ...form, integration_id: event.target.value, model: integration?.models?.[0] || '' })
          }}>
            <option value="">Select integration</option>
            {integrations.map((item) => <option key={item.id} value={item.id}>{item.account_name} · {item.provider}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Model</span>
          <select required disabled={busy || loadingChat} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>
            <option value="">Select model</option>
            {selected?.models?.map((model) => <option key={model}>{model}</option>)}
          </select>
        </label>
        <div className="studio-options">
          <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" className="studio-options-trigger" aria-label="Generation options">
                <SlidersHorizontal size={15} aria-hidden="true" /> <span className="studio-options-label">Options</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="studio-options-content" side="top" align="end" aria-label="Generation options" onOpenAutoFocus={(event) => {
              if (!invalidSettingRef.current) return
              event.preventDefault()
              const field = invalidSettingRef.current === 'temperature' ? temperatureRef.current : tokensRef.current
              invalidSettingRef.current = null
              field?.focus()
              field?.reportValidity()
            }}>
              <div className="studio-generation-fields">
                <label>Temperature<input ref={temperatureRef} form="studio-composer-form" disabled={busy} type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></label>
                <label>Max tokens<input ref={tokensRef} form="studio-composer-form" disabled={busy} type="number" min="1" max="8192" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) })} /></label>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button type="submit" className="studio-send" disabled={busy || loadingChat || !historyReady || historyUnavailable || policySetupRequired || !form.integration_id || !form.model || !form.prompt.trim()} aria-label={busy ? 'Waiting for reply' : 'Send message'}>
          <span className="studio-send-label">{busy ? 'Thinking…' : 'Send'}</span> <ArrowUp size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="studio-composer-note">
        <span title={contextNote}>Recent allowed messages provide context.</span>
        <span className="studio-keyboard-hint">Enter to send · Shift + Enter for a new line</span>
      </div>
    </form>
  )
}
