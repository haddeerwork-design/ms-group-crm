import { T } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function passwordProblem(p: string, confirm: string) {
  if (p.length < 10) return 'Use at least 10 characters.'
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use letters and numbers.'
  if (p !== confirm) return 'The two passwords are not the same.'
  return null
}

export function NewPasswordForm({ onDone }: { onDone?: () => void }) {
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const bad = passwordProblem(p, c)
    if (bad) return toast.error(bad)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p, data: { must_change_password: false } })
    setBusy(false)
    if (error) return toast.error(/same|different/i.test(error.message) ? 'Choose a new password, not the temporary one.' : error.message)
    toast.success('Password changed'); onDone?.()
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="np">New password</Label><PasswordInput id="np" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="np2">Repeat new password</Label><PasswordInput id="np2" autoComplete="new-password" value={c} onChange={(e) => setC(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground"><T>At least 10 characters, with letters and numbers.</T></p>
      <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Save new password</Button>
    </form>
  )
}

/** Full screen shown after logging in with a temporary password. */
export function ForcedPasswordChange({ onSignOut, recovery, onDone }: { onSignOut: () => void; recovery?: boolean; onDone?: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold"><T>{recovery ? 'Set a new password' : 'Choose your own password'}</T></h1>
          <p className="text-sm text-muted-foreground"><T>{recovery ? 'You opened the reset link from your email. Choose a new password to continue.' : 'You logged in with a temporary password. Set a new one to continue.'}</T></p>
        </div>
        <NewPasswordForm onDone={onDone} />
        <button onClick={onSignOut} className="w-full text-center text-xs text-muted-foreground hover:underline">Sign out</button>
      </div>
    </div>
  )
}

/** Header button: change password any time. */
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const { t } = useT()
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t('Change password')} data-tip={t('Change password')}><KeyRound /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('Change password')}</DialogTitle><DialogDescription>{t('Pick a password only you know.')}</DialogDescription></DialogHeader>
          <DialogBody><NewPasswordForm onDone={() => setOpen(false)} /></DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
