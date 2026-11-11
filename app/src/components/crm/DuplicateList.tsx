import { T } from '@/lib/i18n'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DuplicateHit } from '@/lib/crm'

export function DuplicateList({ hits }: { hits: DuplicateHit[] }) {
  if (!hits.length) return null
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <p className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />Possible duplicate{hits.length > 1 ? 's' : ''} found</p>
      <ul className="space-y-1.5">
        {hits.map((h) => (
          <li key={h.company_id + h.idx}>
            <b>{h.company_name}</b>{h.country ? `, ${h.country}` : ''} — owner: {h.owner_name}{h.archived ? ' (archived)' : ''}
            <span className="text-xs"> · {h.reasons.join(', ')}</span>
            {h.can_open && <Link to={`/crm/${h.company_id}`} target="_blank" className="ms-1 inline-flex items-center gap-0.5 text-xs underline">open <ExternalLink className="size-3" /></Link>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs"><T>Records are never merged automatically. If it is the same company, ask the owner instead of creating a new one.</T></p>
    </div>
  )
}
