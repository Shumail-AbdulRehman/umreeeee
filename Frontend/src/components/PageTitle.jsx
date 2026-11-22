import { pageMeta } from '../config/navigation'
import { PeriodLabel } from './Surface'
export default function PageTitle({ page }) {
  const meta = pageMeta[page]
  return <header className={`page-heading ${page === 'prompt-studio' ? 'page-heading-studio' : ''}`}><div><span className="eyebrow">{meta.section}</span><h1 className="h1">{meta.title}</h1><p className="sub">{meta.subtitle}</p></div>{['insights', 'catalog', 'latency', 'spend'].includes(page) && <PeriodLabel />}</header>
}
