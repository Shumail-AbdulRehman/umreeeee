export default function FieldErrors({ errors = {}, field }) {
  const messages = Object.entries(errors)
    .filter(([key]) => key === field || key.startsWith(`${field}.`))
    .flatMap(([, values]) => Array.isArray(values) ? values : [values])
  if (messages.length === 0) return null
  return <span className="admin-field-error" role="alert">{messages.join(' ')}</span>
}
