import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/roles'
import { supabase, LEGACY_CRM_URL } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, Loading } from '@/components/ui/states'

// What the new platform contains so far, in build order. Status comes from
// the app_migrations table, not from this list.
const PLAN = [
  { version: '0001_foundation', label: 'Foundation: roles, company settings, audit log' },
  { version: '0002_products', label: 'Products catalog & packaging' },
  { version: '0003_pricing', label: 'Pricing, exchange rates & price history' },
  { version: '0004_containers', label: 'Container planner' },
  { version: '0005_quotations', label: 'Quotations & PDF' },
  { version: '0006_crm', label: 'CRM: importers, contacts, timeline' },
]

export function Dashboard() {
  const { profile, roles } = useAuth()
  const [applied, setApplied] = useState<Set<string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('app_migrations').select('version').then(({ data, error }) => {
      if (error) setError(error.message)
      else setApplied(new Set((data ?? []).map((r) => r.version)))
    })
  }, [])

  return (
    <>
      <PageHeader title={`Welcome, ${profile?.full_name || profile?.email || ''}`}
        summary="The new MS El-brancy platform is being built step by step. Daily work continues in the current CRM until each module moves here." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardDescription>Your access</CardDescription><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {roles.length ? roles.map((r) => <Badge key={r}>{ROLE_LABEL[r]}</Badge>) : <span className="text-sm text-muted-foreground">No role assigned</span>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardDescription>Still in use</CardDescription><CardTitle>Current CRM</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Invoices, shipping rates and market research are still managed there. Customers, products, pricing, the container planner and quotations now live here.</p>
            <Button variant="outline" asChild><a href={LEGACY_CRM_URL}><ExternalLink />Open current CRM</a></Button>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Build progress</CardTitle><CardDescription>Read live from the database.</CardDescription></CardHeader>
        <CardContent>
          {error ? <ErrorState message={error} /> : !applied ? <Loading /> : (
            <ul className="divide-y divide-border">
              {PLAN.map((p) => {
                const done = applied.has(p.version)
                return (
                  <li key={p.version} className="flex items-center gap-3 py-2.5 text-sm">
                    {done ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                    <span className={done ? '' : 'text-muted-foreground'}>{p.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{done ? 'Installed' : 'Not yet'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
