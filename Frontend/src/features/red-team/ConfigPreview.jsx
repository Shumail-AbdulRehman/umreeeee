import { Button } from '../../components/ui/button.jsx'

export default function ConfigPreview({ yaml = '', loading = false, error = '', stale = false, blocked = false, onRefresh, values }) {
  return (
    <section className="rt-panel" aria-labelledby="promptfoo-config-title">
      <div className="rt-panel-head">
        <div>
          <h2 id="promptfoo-config-title" className="rt-panel-title">promptfoo config</h2>
          {stale && <p className="rt-panel-note" role="status">Changed since the last preview</p>}
        </div>
        <Button type="button" variant="outline" disabled={loading || blocked} onClick={() => onRefresh?.(values)}>
          {loading ? 'Building preview…' : 'Refresh preview'}
        </Button>
      </div>
      <div className="rt-panel-body">
        {error ? <div className="rt-banner rt-tone-fail" role="alert">Could not build the config preview. {error}</div> : loading && !yaml ? (
          <p className="rt-panel-note" role="status">Building the config preview…</p>
        ) : (
          <div className="rt-config-preview" role="region" aria-label="promptfoo config YAML" tabIndex={0}>
            <pre>{yaml || 'No preview available.'}</pre>
          </div>
        )}
      </div>
    </section>
  )
}
