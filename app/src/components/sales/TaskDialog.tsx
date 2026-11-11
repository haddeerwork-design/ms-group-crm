import { T } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { CRM_ASSIGNERS } from '@/lib/roles'
import { PRIORITY, type Company, type TeamMember } from '@/lib/crm'
import { TASK_STATUS, type Opportunity, type Task } from '@/lib/sales'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'

export function TaskDialog({ open, onOpenChange, task, companies, opportunities, team, defaults, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; task: Task | null; companies: Company[]; opportunities: Opportunity[]
  team: TeamMember[]; defaults?: { company_id?: string; opportunity_id?: string; due_date?: string }; onSaved: () => void
}) {
  const { hasRole, session } = useAuth()
  const canAssign = hasRole(...CRM_ASSIGNERS)
  const init = () => ({
    title: task?.title ?? '', description: task?.description ?? '', company_id: task?.company_id ?? defaults?.company_id ?? '',
    opportunity_id: task?.opportunity_id ?? defaults?.opportunity_id ?? '', assignee_id: task?.assignee_id ?? session?.user.id ?? '',
    due_date: task?.due_date ?? defaults?.due_date ?? '', priority: task?.priority ?? 'medium', status: task?.status ?? 'open',
    reminder_at: task?.reminder_at ? task.reminder_at.slice(0, 16) : '',
  })
  const [f, setF] = useState(init())
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(init()) }, [open, task, defaults]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof ReturnType<typeof init>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const canEditTask = !task || task.created_by === session?.user.id || task.assignee_id === session?.user.id || canAssign

  async function save() {
    if (!f.title.trim()) return toast.error('Write the task.')
    const row: Record<string, unknown> = {
      title: f.title.trim(), description: f.description.trim() || null, company_id: f.company_id || null, opportunity_id: f.opportunity_id || null,
      due_date: f.due_date || null, priority: f.priority, status: f.status, reminder_at: f.reminder_at ? new Date(f.reminder_at).toISOString() : null,
    }
    if (canAssign) row.assignee_id = f.assignee_id || session?.user.id
    setBusy(true)
    const res = task ? await supabase.from('tasks').update(row).eq('id', task.id).select('id')
      : await supabase.from('tasks').insert({ ...row, created_by: session?.user.id, ...(canAssign ? {} : { assignee_id: session?.user.id }) }).select('id')
    setBusy(false)
    if (res.error || !res.data?.length) return toast.error(res.error?.message ?? 'Not allowed.')
    toast.success(task ? 'Task updated' : 'Task added'); onOpenChange(false); onSaved()
  }
  async function remove() {
    if (!task || !window.confirm('Delete this task?')) return
    const { error, data } = await supabase.from('tasks').delete().eq('id', task.id).select('id')
    if (error || !data?.length) return toast.error(error?.message ?? 'Only the person who created it (or a manager) can delete it.')
    toast.success('Task deleted'); onOpenChange(false); onSaved()
  }
  const opps = opportunities.filter((o) => !o.archived_at && (!f.company_id || o.company_id === f.company_id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle></DialogHeader>
        <DialogBody>
          <fieldset disabled={!canEditTask} className="grid gap-3 sm:grid-cols-2">
            <Field label="Task *" className="sm:col-span-2"><Input value={f.title} onChange={set('title')} placeholder="e.g. Follow up on sample feedback" /></Field>
            <Field label="Details" className="sm:col-span-2"><Textarea value={f.description} onChange={set('description')} /></Field>
            <Field label="Company"><Select value={f.company_id} onChange={(e) => setF((x) => ({ ...x, company_id: e.target.value, opportunity_id: '' }))}><option value="">—</option>{companies.filter((c) => !c.archived_at || c.id === f.company_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Deal"><Select value={f.opportunity_id} onChange={set('opportunity_id')}><option value="">—</option>{opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</Select></Field>
            <Field label="Due date"><Input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
            <Field label="Priority"><Select value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            <Field label="Assigned to" hint={canAssign ? 'They get a notification' : 'Only managers can assign to others'}>
              <Select value={f.assignee_id} onChange={set('assignee_id')} disabled={!canAssign}>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            </Field>
            <Field label="Status"><Select value={f.status} onChange={set('status')}>{Object.entries(TASK_STATUS).map(([k, l]) => <option key={k} value={k}><T>{l}</T></option>)}</Select></Field>
            <Field label="Remind me at (in the app)" className="sm:col-span-2"><Input type="datetime-local" value={f.reminder_at} onChange={set('reminder_at')} /></Field>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {task && canEditTask && <Button variant="ghost" className="me-auto text-destructive" onClick={remove}>Delete</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {canEditTask && <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
