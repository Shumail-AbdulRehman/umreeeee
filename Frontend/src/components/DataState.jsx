export function LoadingState({
  title = 'Loading dashboard data…',
  copy = 'Waiting for the data source to respond.',
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="state-block">
          <div className="state-title">{title}</div>
          <div className="state-copy">{copy}</div>
        </div>
      </div>
    </div>
  )
}

export function ErrorState({
  error,
  title = 'Could not load dashboard data',
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="state-block error">
          <div className="state-title">{title}</div>
          <div className="state-copy">{error?.message || 'Unknown error'}</div>
        </div>
      </div>
    </div>
  )
}
