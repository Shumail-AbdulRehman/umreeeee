import { useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

export default function ChatHistory({
  history,
  historyLoading,
  historyError,
  historyUnavailable,
  page,
  busy,
  chat,
  onNewChat,
  onSelect,
  onPageChange,
  onRetry,
  open,
  onOpenChange,
  formatTime,
}) {
  const returnFocusRef = useRef(null)
  const closeButtonRef = useRef(null)

  function focusDrawer(event) {
    returnFocusRef.current = document.activeElement
    event.preventDefault()
    closeButtonRef.current?.focus()
  }

  function restoreFocus(event) {
    event.preventDefault()
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
  }

  const content = <>
    <div className="studio-history-head">
      <div>
        <span className="studio-kicker">YOUR WORKSPACE</span>
        {open ? <DialogTitle asChild><h2>Chats</h2></DialogTitle> : <h2>Chats</h2>}
      </div>
      {open && <DialogClose asChild>
        <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" className="studio-history-close" aria-label="Close chats">
          <X size={16} aria-hidden="true" />
        </Button>
      </DialogClose>}
    </div>
    <Button type="button" variant="outline" className="studio-new-chat" disabled={busy} onClick={onNewChat}>
      <Plus size={14} aria-hidden="true" /> New chat
    </Button>
    <div className="studio-history-list">
      {historyLoading ? <p className="studio-history-empty" role="status">Loading your chats…</p> : null}
      {historyError && <div className="studio-history-error" role="alert">
        <strong>{historyUnavailable ? 'Chat history unavailable' : 'Could not load chats'}</strong>
        <p>{historyError}</p>
        <Button type="button" variant="outline" onClick={onRetry} disabled={historyLoading}>
          {historyLoading ? 'Retrying…' : 'Retry loading chats'}
        </Button>
      </div>}
      {!historyLoading && history.items.length ? history.items.map((item) =>
        <Button type="button" variant="ghost" key={item.id} disabled={busy} onClick={() => onSelect(item.id)}
          aria-current={chat?.id === item.id ? 'true' : undefined}
          className={'studio-history-item ' + (chat?.id === item.id ? 'is-active' : '')}>
          <span className="studio-history-title">{item.title}</span>
          <span className="studio-history-meta">
            <span className="studio-history-date">{formatTime(item.updated_at)}</span>
            <span>{item.message_count} {item.message_count === 1 ? 'message' : 'messages'}</span>
          </span>
        </Button>) : !historyLoading && !historyError ? <div className="studio-history-empty">
          <strong>A home for your conversations</strong>
          <p>Send a message to save your first chat. Follow-ups stay in the same thread.</p>
        </div> : null}
    </div>
    {history.total > history.page_size && <div className="studio-history-pager">
      <Button type="button" variant="ghost" disabled={page <= 1 || busy} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <span>{page} / {Math.ceil(history.total / history.page_size)}</span>
      <Button type="button" variant="ghost" disabled={page * history.page_size >= history.total || busy} onClick={() => onPageChange(page + 1)}>Next</Button>
    </div>}
    <p className="studio-history-footnote">{historyUnavailable ? 'Chat support requires a server update.' : 'Saved to your workspace account.'}</p>
  </>

  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open ? <DialogContent className="studio-history studio-history-drawer is-open top-0 left-auto right-0 translate-x-0 translate-y-0" showCloseButton={false}
      aria-describedby={undefined} onOpenAutoFocus={focusDrawer} onCloseAutoFocus={restoreFocus}>
      {content}
    </DialogContent> : <aside className="studio-history" aria-label="Chat history">{content}</aside>}
  </Dialog>
}
