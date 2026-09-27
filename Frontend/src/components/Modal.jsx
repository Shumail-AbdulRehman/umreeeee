import { useEffect, useRef } from 'react'

export default function Modal({ title, onClose, dirty = false, wide = false, children }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const returnFocusRef = useRef(typeof document === 'undefined' ? null : document.activeElement)
  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocusElement = returnFocusRef.current
    ;(dialog?.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || closeRef.current)?.focus()
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.click()
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); returnFocusElement?.focus?.() }
  }, [])
  function close() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <div className={`admin-modal ${wide ? 'admin-modal-wide' : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
      <div className="admin-modal-heading"><h2 id="admin-modal-title">{title}</h2><button className="btn" type="button" ref={closeRef} onClick={close} aria-label={`Close ${title}`}>✕</button></div>
      {children}
    </div>
  </div>
}
