export const pageGroups = [
  { title: 'Workspace', items: [{ key: 'prompt-studio', label: 'Prompt Studio' }] },
  { title: 'Observe', items: [{ key: 'insights', label: 'Overview', admin: true },
    { key: 'activity-log', label: 'Activity' }, { key: 'violations', label: 'Violations' },
    { key: 'catalog', label: 'Models' }, { key: 'latency', label: 'Latency' }, { key: 'spend', label: 'Spend' }] },
  { title: 'Manage', items: [
    { key: 'users', label: 'Users', admin: true },
    { key: 'inventory', label: 'Groups', admin: true },
    { key: 'integrations', label: 'Integrations', admin: true },
    { key: 'settings', label: 'Settings', admin: true },
  ] },
  { title: 'Policy', items: [
    { key: 'dlp-policy', label: 'DLP policy', admin: true },
    { key: 'guardrail-policy', label: 'Guardrail policy', admin: true },
  ] },
  { title: 'Evaluate', items: [{ key: 'red-team', label: 'Red Team', admin: true }] },
]

export const pageMeta = {
  'prompt-studio': { section: 'Workspace', title: 'Prompt Studio', subtitle: 'Run prompts through your organization policies.' },
  insights: { section: 'Observe', title: 'Organization overview', subtitle: 'Actual run outcomes from the last seven days.' },
  'activity-log': { section: 'Observe', title: 'Activity', subtitle: 'Recorded prompt runs and outcomes.' },
  violations: { section: 'Observe', title: 'Violations', subtitle: 'Review policy matches and resolutions.' },
  catalog: { section: 'Observe', title: 'Models', subtitle: 'Configured models and observed use.' },
  latency: { section: 'Observe', title: 'Latency', subtitle: 'Measured execution times.' },
  spend: { section: 'Observe', title: 'Spend', subtitle: 'Estimates from automatic pricing, custom rates, and reported tokens.' },
  users: { section: 'Manage', title: 'Users', subtitle: 'Invite people and manage access.' },
  inventory: { section: 'Manage', title: 'Groups', subtitle: 'Organize people and manage their policy assignments.' },
  policies: { section: 'Manage', title: 'Policies', subtitle: 'Select DLP patterns and guardrails, then assign them to user groups.' },
  'dlp-policy': { section: 'Policy', title: 'DLP policy', subtitle: 'Control which sensitive information your teams can share with AI.' },
  'guardrail-policy': { section: 'Policy', title: 'Guardrail policy', subtitle: 'Manage the safety checks applied to your teams’ AI conversations.' },
  integrations: { section: 'Manage', title: 'Integrations', subtitle: 'Manage organization-owned provider credentials and models.' },
  settings: { section: 'Manage', title: 'Settings', subtitle: 'Organization settings and administrative audit.' },
  'red-team': { section: 'Evaluate', title: 'Red Team', subtitle: 'Run bounded synthetic attacks against a connected model.' },
}

export function isValidPage(page) { return Boolean(pageMeta[page]) }
export function getInitialPage() {
  const hash = window.location.hash.replace('#', '').split('?')[0]
  return isValidPage(hash) ? hash : 'prompt-studio'
}
