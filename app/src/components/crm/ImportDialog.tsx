import { T } from '@/lib/i18n'
import { useState } from 'react'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file'
import { CheckCircle2, Download, FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { download, findDuplicates, toCSV, type DuplicateHit } from '@/lib/crm'
import { autoMap, buildRows, IMPORT_FIELDS, toInsert, type ImportKey, type Mapping, type ParsedRow } from '@/lib/crmImport'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Step = 'upload' | 'map' | 'review' | 'done'
type Reviewed = ParsedRow & { dups: DuplicateHit[]; include: boolean }

export function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { session } = useAuth()
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [data, setData] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [rows, setRows] = useState<Reviewed[]>([])
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ ok: number; failed: { line: number; name: string; error: string }[] } | null>(null)

  function reset() { setStep('upload'); setFileName(''); setHeaders([]); setData([]); setMapping({}); setRows([]); setSummary(null) }

  async function onFile(file: File) {
    setFileName(file.name)
    try {
      let table: string[][]
      if (/\.xlsx$/i.test(file.name)) {
        table = (await readXlsxFile(file)).map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
      } else if (/\.csv$/i.test(file.name)) {
        const text = await file.text()
        table = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false }).data
      } else throw new Error('Please choose a .csv or .xlsx file')
      if (table.length < 2) throw new Error('The file has no data rows')
      if (table.length > 2001) throw new Error('Please import at most 2,000 rows at a time')
      setHeaders(table[0].map((h) => String(h ?? '')))
      setData(table.slice(1))
      setMapping(autoMap(table[0].map(String)))
      setStep('map')
    } catch (e) { toast.error((e as Error).message) }
  }

  async function review() {
    if (mapping.name == null) return toast.error('Choose which column holds the company name.')
    setBusy(true)
    try {
      const parsed = buildRows(data, mapping)
      const cands = parsed.map((r) => ({ name: r.values.name, website: r.values.website, email: r.values.email, phone: r.values.phone ?? r.values.whatsapp, country: r.values.country }))
      const hits: DuplicateHit[] = []
      for (let i = 0; i < cands.length; i += 200) {
        const part = await findDuplicates(cands.slice(i, i + 200))
        hits.push(...part.map((h) => ({ ...h, idx: h.idx + i })))
      }
      setRows(parsed.map((r, i) => {
        const dups = hits.filter((h) => h.idx === i)
        return { ...r, dups, include: !r.errors.length && !dups.length && r.fileDuplicateOf == null }
      }))
      setStep('review')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  async function runImport() {
    const chosen = rows.filter((r) => r.include && !r.errors.length)
    if (!chosen.length) return toast.error('No rows selected.')
    if (!window.confirm(`Import ${chosen.length} companies? Existing records are never changed.`)) return
    setBusy(true)
    let ok = 0
    const failed: { line: number; name: string; error: string }[] = []
    for (const r of chosen) {
      const { company, contact } = toInsert(r.values)
      const res = await supabase.from('companies').insert({ ...company, owner_id: session?.user.id }).select('id').single()
      if (res.error) { failed.push({ line: r.line, name: company.name, error: res.error.message }); continue }
      ok++
      if (contact) {
        const c = await supabase.from('company_contacts').insert({ ...contact, company_id: res.data.id })
        if (c.error) failed.push({ line: r.line, name: company.name, error: 'Company saved, contact failed: ' + c.error.message })
      }
    }
    setBusy(false); setSummary({ ok, failed }); setStep('done'); onDone()
  }

  function errorReport() {
    const lines = [
      ...rows.filter((r) => !r.include || r.errors.length).map((r) => ({
        line: r.line, company: r.values.name ?? '', reason: [...r.errors, ...r.warnings, r.fileDuplicateOf ? `Same as line ${r.fileDuplicateOf}` : '',
          ...r.dups.map((d) => `Possible duplicate of ${d.company_name} (${d.owner_name}): ${d.reasons.join(', ')}`), !r.errors.length ? 'Not selected' : ''].filter(Boolean).join(' | '),
      })),
      ...(summary?.failed ?? []).map((f) => ({ line: f.line, company: f.name, reason: f.error })),
    ]
    download(`import-report-${fileName.replace(/\.[^.]+$/, '')}.csv`, toCSV(lines))
  }

  const counts = { total: rows.length, selected: rows.filter((r) => r.include).length, errors: rows.filter((r) => r.errors.length).length, dups: rows.filter((r) => r.dups.length || r.fileDuplicateOf).length }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Import companies</DialogTitle>
          <DialogDescription>{step === 'upload' ? 'CSV or Excel (.xlsx), first row = column names. Imported companies are assigned to you.' : fileName}</DialogDescription></DialogHeader>
        <DialogBody>
          {step === 'upload' && (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center hover:bg-accent/40">
              <FileUp className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium"><T>Choose a file</T></span>
              <span className="text-xs text-muted-foreground">.csv or .xlsx · up to 2,000 rows</span>
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          )}
          {step === 'map' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{data.length} rows found. Check which column goes where:</p>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {IMPORT_FIELDS.map((fld) => (
                  <div key={fld.key} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 text-sm">{fld.label}{'required' in fld && fld.required ? ' *' : ''}</span>
                    <Select value={mapping[fld.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [fld.key as ImportKey]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                      <option value="">— not in file —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 'review' && (
            <div className="space-y-3">
              <p className="text-sm"><b>{counts.selected}</b> of {counts.total} rows will be imported · {counts.errors} with errors · {counts.dups} possible duplicates (not selected — tick to import anyway).</p>
              <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-start text-xs text-muted-foreground">
                    <th className="p-2" /><th className="p-2"><T>Line</T></th><th className="p-2"><T>Company</T></th><th className="p-2"><T>Country</T></th><th className="p-2"><T>Check</T></th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.line} className={cn('border-b border-border last:border-0', r.errors.length && 'bg-red-50/60 dark:bg-red-950/30')}>
                        <td className="p-2"><input type="checkbox" className="size-4 accent-[#23856B]" disabled={!!r.errors.length} checked={r.include}
                          onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label={`Import line ${r.line}`} /></td>
                        <td className="p-2 text-muted-foreground">{r.line}</td>
                        <td className="p-2 font-medium">{r.values.name ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{r.values.country ?? ''}</td>
                        <td className="p-2 text-xs">
                          {r.errors.map((e) => <div key={e} className="text-destructive">{e}</div>)}
                          {r.fileDuplicateOf && <div className="text-amber-700 dark:text-amber-300">Same as line {r.fileDuplicateOf} in this file</div>}
                          {r.dups.map((d) => <div key={d.company_id} className="text-amber-700 dark:text-amber-300">Already exists: {d.company_name} ({d.owner_name}) — {d.reasons.join(', ')}</div>)}
                          {r.warnings.map((w) => <div key={w} className="text-muted-foreground">{w}</div>)}
                          {!r.errors.length && !r.dups.length && !r.fileDuplicateOf && !r.warnings.length && <span className="text-primary">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {step === 'done' && summary && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto size-10 text-primary" />
              <p className="text-lg font-semibold">{summary.ok} companies imported</p>
              {summary.failed.length > 0 && <p className="text-sm text-destructive">{summary.failed.length} problems — download the report for details.</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {(step === 'review' || step === 'done') && <Button variant="ghost" className="me-auto" onClick={errorReport}><Download />Download report</Button>}
          {step === 'map' && <Button onClick={review} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Check rows</Button>}
          {step === 'review' && <><Button variant="outline" onClick={() => setStep('map')}>Back</Button><Button onClick={runImport} disabled={busy || !counts.selected}>{busy && <Loader2 className="animate-spin" />}Import {counts.selected}</Button></>}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
