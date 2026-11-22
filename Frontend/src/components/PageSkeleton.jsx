import { Skeleton } from './ui/skeleton'
import { Activity, Bot, CircleDollarSign, Clock3, ShieldCheck, Users } from 'lucide-react'

function Bone({ width = '100%', height = 9, className = '' }) {
  return <Skeleton className={`sk-bone ${className}`} style={{ width, height }} />
}
function Heading({ title, icon: Icon, action = false }) {
  return <div className="sk-section-heading"><div>{Icon && <Icon size={15} />}<h3>{title}</h3></div>{action && <Bone width={76} height={25} />} </div>
}
function Toolbar({ filters = 2, search = true }) {
  return <div className="sk-toolbar">{search && <div className="sk-search"><Bone width={13} height={13} /><Bone width="min(160px,65%)" /></div>}<div className="sk-filters">{Array.from({ length: filters }, (_, i) => <Bone key={i} width={i === 0 ? 104 : 78} height={34} />)}</div></div>
}
function Metrics({ labels, icon: Icon = Activity }) {
  return <div className="sk-metrics" style={{ '--sk-metric-count': labels.length }}>{labels.map((label) => <div className="sk-metric" key={label}><div><span>{label}</span><Icon size={14} /></div><Bone width={76} height={26} /><Bone width="64%" height={7} /></div>)}</div>
}
function Table({ title, columns, rows = 5, avatar = false }) {
  return <section className="sk-panel sk-table"><Heading title={title} action /><div className="sk-table-scroll"><div className="sk-table-inner" style={{ '--sk-cols': columns.length }}><div className="sk-table-head">{columns.map((column) => <span key={column}>{column}</span>)}</div>{Array.from({ length: rows }, (_, i) => <div className="sk-table-row" key={i}>{columns.map((column, j) => <div className="sk-table-cell" key={column}>{j === 0 && avatar && <Bone width={29} height={29} className="sk-avatar" />}<div className="sk-cell-copy"><Bone width={`${[72, 56, 84, 64, 78][(i + j) % 5]}%`} height={j === 0 ? 10 : 8} />{j === 0 && avatar && <Bone width="52%" height={6} />}</div></div>)}</div>)}</div></div><div className="sk-table-footer"><Bone width={100} height={7} /><div><Bone width={65} height={25} /><Bone width={65} height={25} /></div></div></section>
}
function Chart({ title, legend = 3 }) {
  return <section className="sk-panel sk-chart"><Heading title={title} /><div className="sk-chart-key">{Array.from({ length: legend }, (_, i) => <span key={i}><Bone width={7} height={7} /><Bone width={55 + i * 12} height={7} /></span>)}</div><div className="sk-plot"><div className="sk-plot-axis">{Array.from({ length: 4 }, (_, i) => <Bone key={i} width={22} height={7} />)}</div><div className="sk-plot-grid">{Array.from({ length: 4 }, (_, i) => <div key={i} />)}</div></div><div className="sk-plot-dates">{Array.from({ length: 5 }, (_, i) => <Bone key={i} width={35} height={6} />)}</div></section>
}
function List({ title, rows = 4, icon: Icon = Users }) {
  return <section className="sk-panel sk-list"><Heading title={title} icon={Icon} />{Array.from({ length: rows }, (_, i) => <div className="sk-list-row" key={i}><Bone width={30} height={30} className="sk-avatar" /><div><Bone width={`${65 + (i % 3) * 10}%`} height={9} /><Bone width="48%" height={6} /></div><Bone width={32} height={9} /></div>)}</section>
}
function Policies({ kind }) {
  const dlp = kind === 'dlp-policy', guardrail = kind === 'guardrail-policy'
  return <><Toolbar filters={1} /><div className="sk-policy-overview"><div><ShieldCheck size={20} /><div><Bone width={170} height={13} /><Bone width={240} height={7} /></div></div><Bone width={100} height={32} /></div><div className="sk-policy-grid">{Array.from({ length: 4 }, (_, i) => <section className="sk-panel sk-policy-card" key={i}><div className="sk-policy-card-top"><Bone width={32} height={32} /><Bone width={48} height={18} /></div><Bone width={`${54 + i * 5}%`} height={13} /><Bone width="85%" /><Bone width="67%" height={7} /><div className="sk-policy-detail"><span>{dlp ? 'Sensitive data checks' : guardrail ? 'Safety checks' : 'Policy checks'}</span><Bone width={36} height={10} /></div><div className="sk-policy-card-bottom"><Bone width={94} height={7} /><Bone width={66} height={26} /></div></section>)}</div></>
}
function Integrations() {
  return <><div className="sk-library-intro"><span>PROVIDER LIBRARY</span><Bone width="min(340px,90%)" height={23} /><Bone width="min(480px,85%)" height={8} /></div><div className="sk-provider-grid">{['OpenAI', 'Groq', 'Ollama', 'Gemini', 'DeepSeek', 'Anthropic'].map((name) => <div className="sk-panel sk-provider" key={name}><div><Bone width={28} height={28} /><strong>{name}</strong><Bone width={44} height={17} /></div><Bone width="87%" /><Bone width="67%" height={7} /><div className="sk-provider-bottom"><Bone width={94} height={7} /><Bone width={12} height={12} /></div></div>)}</div><Table title="Provider connections" columns={['Account', 'Provider', 'Enabled models', 'Status']} rows={3} avatar /></>
}
function Settings() {
  return <><section className="sk-panel sk-settings"><Heading title="Organization settings" /><div className="sk-fields">{['Organization name', 'Slug', 'Content retention days'].map((label) => <div className="sk-field" key={label}><span>{label}</span><Bone height={38} /></div>)}</div><div className="sk-toggle"><Bone width={16} height={16} /><div><Bone width="min(310px,80%)" /><Bone width="min(410px,90%)" height={7} /></div></div><div className="sk-settings-action"><Bone width={112} height={35} /></div></section><Table title="Administrative history" columns={['Action', 'Resource', 'Request', 'Time']} rows={4} /></>
}
function Studio() {
  return <div className="sk-studio"><aside className="sk-studio-history"><div><span>Conversations</span><Bone width={22} height={22} /></div><Bone height={34} />{Array.from({ length: 6 }, (_, i) => <div className="sk-conversation" key={i}><Bone width={`${65 + (i % 3) * 9}%`} /><Bone width="40%" height={6} /></div>)}</aside><div className="sk-studio-main"><div className="sk-studio-top"><Bone width={155} height={13} /><Bone width={105} height={28} /></div><div className="sk-studio-welcome"><Bot size={28} /><Bone width={200} height={19} /><Bone width="min(310px,80%)" height={8} /><div>{Array.from({ length: 3 }, (_, i) => <Bone width={82} height={29} key={i} />)}</div></div><div className="sk-composer"><Bone width="72%" /><div><Bone width={120} height={24} /><Bone width={30} height={30} /></div></div></div></div>
}
function UserReport() {
  return <><Metrics labels={['Prompt runs', 'Allowed share', 'Policy incidents', 'Known estimated spend']} /><div className="sk-two-columns"><Chart title="Activity over time" /><Chart title="Execution outcomes" legend={2} /></div><Table title="Model usage & cost" columns={['Model', 'Runs', 'Tokens', 'Estimated cost']} rows={3} /></>
}
export default function PageSkeleton({ kind }) {
  let content
  switch (kind) {
    case 'my-activity': content = <><Metrics labels={['Your prompt runs', 'Allowed share', 'Known tokens', 'Known estimated spend']} /><div className="sk-two-columns"><Chart title="Your daily activity" /><Chart title="Your outcomes" /></div><Chart title="Models you use" legend={1} /><Table title="Your recent activity" columns={['Submitted', 'Model', 'Outcome', 'Tokens']} rows={4} /></>; break
    case 'violation-detail': content = <><div className="sk-library-intro"><Bone width="64%" height={19} /><Bone width="78%" height={8} /></div><div className="sk-filters"><Bone width={58} height={23} /><Bone width={58} height={23} /></div><section className="sk-panel"><Heading title="Safe evidence" /><div className="sk-fields"><Bone width="92%" height={9} /><Bone width="73%" height={9} /></div></section></>; break
    case 'prompt-studio': content = <Studio />; break
    case 'integrations': content = <Integrations />; break
    case 'users': content = <><Toolbar filters={4} /><Table title="People & access" columns={['Person', 'Role', 'Groups', 'Status', 'Actions']} avatar /></>; break
    case 'inventory': content = <><Toolbar filters={2} /><Table title="Groups & policy coverage" columns={['Group', 'Members', 'Policies', 'Status', 'Actions']} avatar /></>; break
    case 'activity-log': content = <><Toolbar filters={1} search={false} /><Table title="Prompt activity" columns={['Person', 'Model', 'Outcome', 'Tokens', 'Time']} avatar rows={6} /></>; break
    case 'violations': content = <><Toolbar filters={2} search={false} /><Table title="Recorded violations" columns={['Policy', 'Severity', 'Stage', 'Resolution', 'Time']} rows={6} /></>; break
    case 'catalog': content = <><Metrics labels={['Configured models', 'Active integrations', 'Models with observed use']} icon={Bot} /><Toolbar filters={0} /><Table title="Model directory" columns={['Model', 'Provider', 'Integration', 'Recorded runs']} avatar /></>; break
    case 'latency': content = <><Metrics labels={['Typical total time · p50', 'Total time · p95', 'Policy time · p50']} icon={Clock3} /><Chart title="Latency by execution stage" /><Table title="Measurement detail" columns={['Stage', 'Samples', 'P50', 'P95', 'P99']} rows={3} /></>; break
    case 'spend': content = <><Metrics labels={['Known estimated spend', 'Unknown or partial cost', 'Known token usage']} icon={CircleDollarSign} /><Chart title="Estimated cost by model" legend={1} /><Table title="Cost breakdown" columns={['Model', 'Runs', 'Known estimate', 'Unknown / partial cost', 'Known tokens']} rows={4} /></>; break
    case 'settings': content = <Settings />; break
    case 'red-team': content = <><Toolbar filters={3} /><div className="sk-evaluation-banner"><ShieldCheck size={23} /><div><Bone width={190} height={12} /><Bone width="min(400px,80%)" height={7} /></div><Bone width={103} height={34} /></div><Table title="Evaluation runs" columns={['Evaluation', 'Model', 'Mode', 'Progress', 'Status']} rows={5} /></>; break
    case 'user-insights': content = <div className="sk-user-insights"><div className="sk-directory"><Heading title="People" icon={Users} /><Toolbar filters={1} /><List title="Organization directory" rows={6} /></div><div className="sk-report"><div className="sk-report-heading"><Bone width={190} height={18} /><Bone width={102} height={32} /></div><UserReport /></div></div>; break
    case 'user-report': content = <UserReport />; break
    case 'policies': case 'dlp-policy': case 'guardrail-policy': content = <Policies kind={kind} />; break
    default: content = <><Metrics labels={['Prompt runs', 'Known tokens', 'Estimated spend', 'Policy incidents']} /><div className="sk-overview-main"><Chart title="Prompt activity" /><List title="Execution outcomes" icon={Activity} /></div><div className="sk-two-columns"><List title="Policy incidents" icon={ShieldCheck} /><List title="Activity by person" /></div><Table title="Recent prompt activity" columns={['Person', 'Model', 'Outcome', 'Time']} avatar rows={4} /></>
  }
  return <div className={`page-skeleton sk-${kind}`} aria-hidden="true">{content}</div>
}
