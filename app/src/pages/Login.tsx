import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, FileText, Info, Loader2, Lock, Package, Tag, Truck, User } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { PasswordInput } from '@/components/ui/password-input'
import { ErrorState } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Form = z.infer<typeof schema>
const BASE = import.meta.env.BASE_URL

/** Leaf mark used next to "Export System". */
function Leaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M20.5 3.5c-7.7.2-13.6 3.3-15.6 9-1 2.9-.6 5.3.3 7.1C7 15 10.5 11.7 15 9.6c-3.8 2.6-6.7 6.1-8.4 10.4 2.2 1 5.2 1 8-.9 4.5-3 6-8.8 5.9-15.6Z" />
    </svg>
  )
}

export function Login() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState<'forgot' | 'access' | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  const onSubmit = async (v: Form) => { setError(null); const e = await signIn(v.email, v.password); if (e) setError(e) }

  const field = 'flex h-14 items-center rounded-full border border-[#d6ddd8] bg-white shadow-[0_2px_10px_rgba(16,60,40,0.06)] focus-within:border-[#2f7d3a] focus-within:ring-2 focus-within:ring-[#2f7d3a]/20 dark:border-border dark:bg-card'
  const MODULES = [{ icon: Package, label: 'Products' }, { icon: Tag, label: 'Pricing' }, { icon: Truck, label: 'Shipping' }, { icon: FileText, label: 'Quotations' }]

  return (
    <div className="relative flex min-h-screen bg-[#f6f7f5] dark:bg-background">
      {/* Photo side (large screens) */}
      <div className="relative hidden w-[55%] overflow-hidden lg:block">
        <img src={`${BASE}login-hero.jpg`} alt="Fresh Egyptian fruit in an MS El-brancy crate in front of the farm at sunrise" className="absolute inset-0 size-full object-cover object-left" />
        {/* curved edge: green ribbons + the light panel */}
        <svg className="absolute inset-y-0 right-0 h-full w-[24%]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M94 0 C90 32 68 56 40 75 C25 85 12 93 0 100 L100 100 L100 0 Z" fill="#2f7d3a" />
          <path d="M100 0 C97 32 76 56 48 75 C33 85 20 93 8 100 L100 100 Z" fill="#7cb342" />
          <path d="M106 0 C103 32 83 56 55 75 C40 85 27 93 15 100 L100 100 L100 0 Z" className="fill-[#f6f7f5] dark:fill-background" />
        </svg>
      </div>

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <img src={`${BASE}logo.png`} alt="MS El-brancy Group" className="h-12 w-auto dark:hidden" />
            <img src={`${BASE}logo-white.png`} alt="MS El-brancy Group" className="hidden h-12 w-auto dark:block" />
          </div>
          <div className="mb-8">
            <div className="flex items-center gap-2 text-2xl font-semibold text-[#14532d] dark:text-emerald-300">
              <Leaf className="size-7 text-[#2f7d3a] dark:text-emerald-400" />Export System
            </div>
            <h1 className="mt-1 text-5xl font-bold tracking-tight text-[#0f3d22] dark:text-foreground">Login</h1>
            <div className="mt-3 h-1 w-16 rounded-full bg-[#2f7d3a]" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {error && <ErrorState message={error} />}
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <div className={field}>
                <span className="flex h-full w-14 shrink-0 items-center justify-center border-r border-[#e3e8e4] text-[#2f7d3a] dark:border-border"><User className="size-5" /></span>
                <input id="email" type="email" autoComplete="email" placeholder="Enter your work email" {...register('email')}
                  className="h-full w-full rounded-r-full bg-transparent px-4 text-[15px] outline-none placeholder:text-muted-foreground" />
              </div>
              {errors.email && <p className="mt-1 px-4 text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <div className={field}>
                <span className="flex h-full w-14 shrink-0 items-center justify-center border-r border-[#e3e8e4] text-[#2f7d3a] dark:border-border"><Lock className="size-5" /></span>
                <div className="h-full flex-1 [&_input]:h-14 [&_input]:rounded-r-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-4 [&_input]:text-[15px] [&_input]:shadow-none [&_input]:focus-visible:ring-0 [&_button]:right-2">
                  <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} />
                </div>
              </div>
              {errors.password && <p className="mt-1 px-4 text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setHelp(help === 'forgot' ? null : 'forgot')} className="text-sm font-semibold text-[#14532d] underline underline-offset-4 hover:text-[#2f7d3a] dark:text-emerald-300">Forgot password?</button>
            </div>
            <button type="submit" disabled={isSubmitting}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#3f8f2f] to-[#0f4d2a] text-lg font-semibold text-white shadow-[0_8px_20px_rgba(20,83,45,0.3)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f7d3a] focus-visible:ring-offset-2 disabled:opacity-70">
              {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : null}Log In <ArrowRight className="size-5" />
            </button>
            <p className="text-center text-sm text-muted-foreground">
              Don’t have an account?{' '}
              <button type="button" onClick={() => setHelp(help === 'access' ? null : 'access')} className="font-semibold text-[#14532d] underline underline-offset-4 hover:text-[#2f7d3a] dark:text-emerald-300">Request access</button>
            </p>
            {help && (
              <p role="status" className="flex gap-2 rounded-xl border border-[#d6ddd8] bg-white p-3 text-sm text-muted-foreground dark:border-border dark:bg-card">
                <Info className="mt-0.5 size-4 shrink-0 text-[#2f7d3a]" />
                {help === 'forgot'
                  ? 'Ask the Super Admin to reset your password (Team & Roles → Manage). You will get a temporary password and choose a new one when you log in.'
                  : 'Accounts are created by the Super Admin. Ask them to add you from Team & Roles; you will receive your email and a temporary password.'}
              </p>
            )}
          </form>

          <ul className="mt-10 grid grid-cols-4 gap-3" aria-label="What you can do in the platform">
            {MODULES.map(({ icon: Icon, label }, i) => (
              <li key={label} className={cn('flex flex-col items-center gap-2 rounded-2xl bg-white px-2 py-4 text-center text-xs font-medium text-[#1d2b22] shadow-[0_4px_14px_rgba(16,60,40,0.08)] dark:bg-card dark:text-foreground sm:text-sm', i && '')}>
                <Icon className="size-7 text-[#14532d] dark:text-emerald-300" strokeWidth={1.6} />{label}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-xs text-muted-foreground">MS El-brancy Group · Rooted in Egypt, Reaching the World.</p>
        </div>
      </div>
    </div>
  )
}
