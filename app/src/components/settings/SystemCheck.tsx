import { T } from '@/lib/i18n'
import { useState } from 'react'
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type Finding = { severity: 'high' | 'medium' | 'legacy'; kind: string; object: string; detail: string }

/** Super Admin tools: database security self-check and refreshing the old-CRM archive. */
export function SystemCheck() {
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [busy, setBusy] = useState<'check' | 'archive' | null>(null)
  const [copied, setCopied] = useState<{ record_type: string; copied: number }[] | null>(null)

  async function check() {
    setBusy('check')
    const { data, error } = await supabase.rpc('app_security_report')
    setBusy(null)
    if (error) return toast.error(/app_security_report/.test(error.message) ? 'Run migration 0011_production first.' : error.message)
    setFindings(data as Finding[])
  }
  async function archive() {
    setBusy('archive')
    const { data, error } = await supabase.rpc('refresh_legacy_archive')
    setBusy(null)
    if (error) return toast.error(error.message)
    setCopied(data ?? []); toast.success('Archive updated')
  }
  const real = (findings ?? []).filter((f) => f.severity !== 'legacy')
  const legacy = (findings ?? []).filter((f) => f.severity === 'legacy')

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>System check</CardTitle>
        <CardDescription>Only the Super Admin sees this.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={check} disabled={!!busy}>{busy === 'check' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Run security check</Button>
            <span className="text-sm text-muted-foreground"><T>Looks for tables or functions that someone who is not logged in could reach.</T></span>
          </div>
          {findings && (
            <div className="mt-3 space-y-2 text-sm">
              {real.length === 0
                ? <p className="flex items-center gap-2 text-primary"><CheckCircle2 className="size-4" /><T>No problems in the new platform.</T></p>
                : real.map((f) => <p key={f.kind + f.object} className="flex items-start gap-2 text-destructive"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span><b>{f.object}</b> — {f.kind}. {f.detail}</span></p>)}
              {legacy.length > 0 && (
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">{legacy.length} note(s) about the old CRM's own tables/functions (left unchanged on purpose)</summary>
                  <ul className="mt-1 list-disc ps-5">{legacy.map((f) => <li key={f.kind + f.object}>{f.object} — {f.kind}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={archive} disabled={!!busy}>{busy === 'archive' && <Loader2 className="animate-spin" />}Refresh old-CRM archive</Button>
            <span className="text-sm text-muted-foreground"><T>Copies the latest data from the current CRM into the read-only archive. Do this one last time before switching the old CRM off.</T></span>
          </div>
          {copied && <p className="mt-2 text-sm">{copied.length ? copied.map((c) => <Badge key={c.record_type} className="me-1">{c.record_type}: {c.copied}</Badge>) : 'Nothing changed since the last copy.'}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
