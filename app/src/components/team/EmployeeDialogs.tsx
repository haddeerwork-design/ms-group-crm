import { useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { adminUsers } from '@/lib/adminUsers'
import { ROLES, ROLE_LABEL, type AppRole } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Shows a temporary password once, with a copy button and a ready-to-send message. */
function TempPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const link = 'https://haddeerwork-design.github.io/ms-group-crm/app/'
  const msg = `Your MS El-brancy platform account:\n${link}\nEmail: ${email}\nTemporary password: ${password}\nYou will choose your own password at first login.`
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copied'), () => toast.error('Copy failed, select the text and copy it.'))
  return (
    <div className="space-y-4 text-sm">
      <p>Send these details to the employee privately (WhatsApp or in person). <b>The password is shown only now.</b></p>
      <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        <div>Email: {email}</div>
        <div className="flex items-center gap-2">Temporary password: <b className="select-all text-sm">{password}</b></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => copy(password)}><Copy />Copy password</Button>
        <Button variant="outline" onClick={() => copy(msg)}><Copy />Copy full message</Button>
        <Button className="ml-auto" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

export function AddEmployeeDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<AppRole[]>(['sales_officer'])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ email: string; password: string } | null>(null)
  function close() { onOpenChange(false); setTimeout(() => { setName(''); setEmail(''); setRoles(['sales_officer']); setDone(null) }, 200) }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return toast.error('Enter the employee name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Enter a valid email.')
    if (!roles.length) return toast.error('Choose at least one role.')
    setBusy(true)
    try {
      const r = await adminUsers({ action: 'create', full_name: name.trim(), email: email.trim(), roles })
      setDone({ email: r.email ?? email.trim().toLowerCase(), password: r.password }); onCreated()
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{done ? 'Employee added' : 'Add employee'}</DialogTitle>
          {!done && <DialogDescription>Creates their login with a temporary password. They choose their own password at first login.</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          {done ? <TempPassword {...done} onClose={close} /> : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="en">Full name</Label><Input id="en" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="ee">Work email</Label><Input id="ee" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Roles</legend>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-[#23856B]" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Create account</Button>
            </form>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export function ResetPasswordDialog({ person, onOpenChange }: { person: { id: string; email: string | null; full_name: string | null } | null; onOpenChange: (o: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState<string | null>(null)
  function close() { onOpenChange(false); setTimeout(() => setPw(null), 200) }
  async function reset() {
    setBusy(true)
    try { const r = await adminUsers({ action: 'reset_password', user_id: person!.id }); setPw(r.password) }
    catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Reset password — {person?.full_name || person?.email}</DialogTitle></DialogHeader>
        <DialogBody>
          {pw ? <TempPassword email={person?.email ?? ''} password={pw} onClose={close} /> : (
            <div className="space-y-4 text-sm">
              <p>This gives {person?.full_name || 'the employee'} a new temporary password. Their old password stops working immediately, and they choose a new one at next login.</p>
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={reset} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Reset password</Button></div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
