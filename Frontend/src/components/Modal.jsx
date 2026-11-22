import { useRef } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

export default function Modal({ title, onClose, dirty = false, wide = false, className = '', children }) {
  const returnFocus = useRef(typeof document === 'undefined' ? null : document.activeElement)
  function close() { if (dirty && !window.confirm('Discard unsaved changes?')) return; onClose() }
  return <Dialog open onOpenChange={(open) => { if (!open) close() }}><DialogContent className={`admin-modal ${wide ? 'admin-modal-wide' : ''} ${className}`} showCloseButton={false} aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus?.() }}><div className="admin-modal-heading"><DialogTitle>{title}</DialogTitle><Button type="button" variant="ghost" size="icon" onClick={close} aria-label={`Close ${title}`}><X size={18} /></Button></div>{children}</DialogContent></Dialog>
}
