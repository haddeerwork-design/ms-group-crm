import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { ROLES, ROLE_LABEL, type AppRole } from '@/lib/roles'
import { PageHeader } from '@/components/layout/AppShell'
import { AddEmployeeDialog, ResetPasswordDialog } from '@/components/team/EmployeeDialogs'
import { Button } from '@/components/ui/button'
import { KeyRound, UserPlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, ErrorState, Loading } from '@/components/ui/states'

type Row = { id: string; full_name: string | null; email: string | null; role: string | null }
type RoleRow = { user_id: string; role: AppRole; source: string }

export function Team() {
  const { hasRole, session } = useAuth()
  const isSuper = hasRole('super_admin')
  const [people, setPeople] = useState<Row[] | null>(null)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<Row | null>(null)

  async function load() {
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, role').order('full_name'),
      supabase.from('user_roles').select('user_id, role, source'),
    ])
    if (p.error || r.error) return setError((p.error || r.error)!.message)
    setPeople(p.data ?? []); setRoles((r.data ?? []) as RoleRow[])
  }
  useEffect(() => { load() }, [])

  async function toggle(userId: string, role: AppRole, on: boolean) {
    const key = userId + role
    setBusy(key)
    const res = on
      ? await supabase.from('user_roles').insert({ user_id: userId, role, granted_by: session?.user.id })
      : await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role)
    setBusy(null)
    if (res.error) return toast.error(res.error.message)
    toast.success(`${ROLE_LABEL[role]} ${on ? 'added' : 'removed'}`)
    load()
  }

  return (
    <>
      <PageHeader title="Team & Roles"
        summary="One employee can hold several roles. Roles marked “from CRM” follow the role set in the current CRM."
        action={isSuper ? <Button onClick={() => setAdding(true)}><UserPlus />Add employee</Button> : undefined} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {error ? <div className="p-5"><ErrorState message={error} /></div> : !people ? <Loading /> : !people.length ? (
            <div className="p-5"><Empty title="No employees visible" hint="Only the Super Admin can see the whole team." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Employee</th>
                  {ROLES.map((r) => <th key={r} className="px-2 py-3 text-center font-medium">{ROLE_LABEL[r]}</th>)}
                  {isSuper && <th className="px-2 py-3" />}
                </tr>
              </thead>
              <tbody>
                {[...people].sort((a, b) => Number(roles.some((x) => x.user_id === a.id)) - Number(roles.some((x) => x.user_id === b.id))).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium">{p.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                      {!roles.some((x) => x.user_id === p.id) && <div className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Waiting for role</div>}
                    </td>
                    {ROLES.map((r) => {
                      const has = roles.find((x) => x.user_id === p.id && x.role === r)
                      return (
                        <td key={r} className="px-2 py-3 text-center">
                          <input type="checkbox" className="size-4 accent-[#23856B]" checked={!!has}
                            disabled={!isSuper || busy === p.id + r}
                            onChange={(e) => toggle(p.id, r, e.target.checked)}
                            aria-label={`${ROLE_LABEL[r]} for ${p.email}`} />
                          {has?.source === 'legacy' && <div className="text-[10px] text-muted-foreground">from CRM</div>}
                        </td>
                      )
                    })}
                    {isSuper && (
                      <td className="px-2 py-3 text-right">
                        {p.id !== session?.user.id && <Button variant="ghost" size="sm" onClick={() => setResetting(p)} title="Give a new temporary password"><KeyRound />Reset</Button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <AddEmployeeDialog open={adding} onOpenChange={setAdding} onCreated={load} />
      <ResetPasswordDialog person={resetting} onOpenChange={(o) => !o && setResetting(null)} />
      <p className="mt-3 text-xs text-muted-foreground">New employee: “Add employee” gives you a temporary password to send them; they choose their own at first login. Forgot password: “Reset”. To block someone, remove all their roles.</p>
    </>
  )
}
