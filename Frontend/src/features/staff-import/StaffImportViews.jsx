import { useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { CSV_COLUMNS, downloadCsv, issueFields } from './staffImportCsv'

const deliveryLabels = {
  sent: 'Sent', pending: 'Pending', failed: 'Delivery failed',
  unconfirmed: 'Delivery unconfirmed', skipped: 'Delivery skipped',
}

function FileIssues({ issues }) {
  if (!issues?.length) return null
  return <div className="staff-notice staff-problem" role="alert">
    <strong>CSV validation failed</strong>
    <ul>{issues.map((issue, index) => <li key={index}>
      {issue.row && <span>Row {issue.row}. </span>}{issue.reason} {issue.fix}
    </li>)}</ul>
  </div>
}

export function StaffUpload({ onChoose, onFiles, checking, fileIssues }) {
  const [dragging, setDragging] = useState(false)
  return <div className="staff-upload-layout">
    <section className="staff-panel staff-upload">
      <h2>Upload a staff list</h2>
      <p>Choose a CSV or drop it here to check its rows.</p>
      <div className={`staff-drop-zone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
        }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files) }}
        aria-busy={checking}>
        <span className="staff-file-icon"><FileSpreadsheet aria-hidden="true" size={30} /></span>
        <Button onClick={onChoose}><Upload aria-hidden="true" />{checking ? 'Choose a different CSV' : 'Choose CSV file'}</Button>
        <p>UTF-8 CSV · Up to 100 staff rows · 256 KB max</p>
        {checking && <p role="status">Checking CSV rows…</p>}
      </div>
      <FileIssues issues={fileIssues} />
    </section>
    <aside className="staff-panel staff-template" aria-labelledby="staff-template-title">
      <h2 id="staff-template-title">CSV template</h2>
      <p>Use these four column names in the first row.</p>
      <ul>{CSV_COLUMNS.map(field => <li key={field}><code>{field}</code></li>)}</ul>
      <Button variant="outline" onClick={() => downloadCsv('staff-template.csv', [
        CSV_COLUMNS, ['Maya', 'Shah', 'maya.shah@example.com', 'Operations'],
      ])}><Download aria-hidden="true" />Download template</Button>
    </aside>
  </div>
}

function StaffTable({ label, headings, children }) {
  return <div className="staff-table-region" role="region" aria-label={label} tabIndex={0}>
    <table role="table" aria-label={label}>
      <thead role="rowgroup"><tr role="row">{headings.map(heading => <th role="columnheader" scope="col" key={heading}>{heading}</th>)}</tr></thead>
      <tbody role="rowgroup">{children}</tbody>
    </table>
  </div>
}

function StaffCell({ label, children }) {
  return <td role="cell" data-label={label}>{children}</td>
}

function Person({ row }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ')
  return <><strong>{name || `Staff row ${row.row}`}</strong>{row.email && <small>{row.email}</small>}</>
}

function exportIssues(preview) {
  const issues = preview.rows.flatMap(row => row.issues)
  downloadCsv('staff-import-issues.csv', [
    ['row', 'field', 'reason', 'how_to_fix'],
    ...issues.map(issue => [issue.row, issue.field, issue.reason, issue.fix]),
  ])
}

export function StaffReview({ preview, filename, busy, onReplace, onConfirm }) {
  const [issuesOnly, setIssuesOnly] = useState(false)
  const blocked = preview.invalid > 0 || !preview.validation_proof
  const rows = issuesOnly && preview.invalid ? preview.rows.filter(row => row.issues.length) : preview.rows

  return <section className="staff-panel staff-review" aria-labelledby="staff-review-title">
    <header className="staff-panel-head">
      <div><h2 id="staff-review-title" tabIndex={-1}>Review CSV rows</h2><p>{filename} · {preview.rows.length} staff {preview.rows.length === 1 ? 'row' : 'rows'}</p></div>
      <div className="staff-actions">
        {preview.invalid > 0 && <Button variant="outline" disabled={busy} onClick={() => exportIssues(preview)}>
          <Download aria-hidden="true" />Download issues
        </Button>}
        <Button variant="outline" disabled={busy} onClick={onReplace}>Replace CSV</Button>
      </div>
    </header>
    <div className={`staff-notice ${blocked ? 'staff-problem' : 'staff-success'}`} role="status">
      <strong>{blocked ? `Fix ${preview.invalid} ${preview.invalid === 1 ? 'row' : 'rows'} to continue` : 'All rows passed validation'}</strong>
      <p>{blocked ? 'Correct the issues and replace the CSV. Every row must pass before importing.' : 'Confirm to create the accounts and queue their invitations.'}</p>
    </div>
    <div className="staff-table-tools">
      <strong>{preview.ready} ready · {preview.invalid} with issues</strong>
      {preview.invalid > 0 && <label><input type="checkbox" checked={issuesOnly} onChange={(event) => setIssuesOnly(event.target.checked)} />Show issues only</label>}
    </div>
    <StaffTable label="CSV row results" headings={['CSV row', 'Employee', 'Department', 'Validation result']}>
      {rows.map(row => <tr role="row" key={row.row}>
        <StaffCell label="CSV row">{row.row}</StaffCell>
        <StaffCell label="Employee"><Person row={row} /></StaffCell>
        <StaffCell label="Department">{row.department || '—'}</StaffCell>
        <StaffCell label="Validation result">{row.issues.length ? row.issues.map((issue, index) => <div className="staff-row-issue" key={index}>
          <strong>{issue.field ? `${issueFields[issue.field] || issue.field} · ` : ''}{issue.reason}</strong>
          <small>{issue.fix}</small>
        </div>) : <span className="staff-state staff-success">Ready</span>}</StaffCell>
      </tr>)}
    </StaffTable>
    <footer className="staff-panel-foot">
      <p>Employees receive invitations to set up their accounts. Assign policy groups in Users after import.</p>
      <Button disabled={blocked || busy} onClick={onConfirm}>{busy ? 'Importing…' : blocked ? 'Import staff' : `Import ${preview.ready} staff`}</Button>
    </footer>
  </section>
}

export function StaffReceipt({ receipt, onStart }) {
  const metrics = [
    ['Accounts created', receipt.accounts_created], ['Invitations sent', receipt.invitations_sent],
    ['Pending', receipt.invitations_pending], ['Needs attention', receipt.needs_attention],
  ]
  return <section className="staff-panel staff-receipt" aria-labelledby="staff-receipt-title">
    <header className="staff-panel-head">
      <div><h2 id="staff-receipt-title" tabIndex={-1}>Import complete</h2><p>Staff accounts have been created.</p></div>
      <div className="staff-actions">
        <Button variant="outline" onClick={onStart}>Import another file</Button>
        <Button asChild><a href="#users">Back to Users</a></Button>
      </div>
    </header>
    <dl className="staff-receipt-metrics" aria-live="polite">
      {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {receipt.invitations_pending > 0 && <p className="staff-notice" role="status">Invitations are queued. Delivery status updates here.</p>}
    {receipt.needs_attention > 0 && <div className="staff-notice staff-problem">
      <strong>{receipt.needs_attention} {receipt.needs_attention === 1 ? 'invitation needs' : 'invitations need'} attention</strong>
      <p>The accounts were created. Open <a href="#users">Users</a> to check the employee record and resend eligible invitations.</p>
    </div>}
    <StaffTable label="Invitation delivery results" headings={['Employee', 'Department', 'Invitation delivery']}>
      {receipt.rows.map(row => <tr role="row" key={row.row}>
        <StaffCell label="Employee"><Person row={row} /></StaffCell>
        <StaffCell label="Department">{row.department || '—'}</StaffCell>
        <StaffCell label="Invitation delivery">
          <span className={`staff-state ${row.delivery === 'sent' ? 'staff-success' : row.delivery === 'pending' ? 'staff-pending' : 'staff-problem'}`}>
            {deliveryLabels[row.delivery]}
          </span>
        </StaffCell>
      </tr>)}
    </StaffTable>
  </section>
}
