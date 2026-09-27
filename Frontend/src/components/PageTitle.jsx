import { pageMeta } from '../config/navigation'

export default function PageTitle({ page }) {
  const meta = pageMeta[page]

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="h1">{meta.title}</h1>
        <p className="sub">{meta.subtitle}</p>
      </div>
    </div>
  )
}
