import { useT } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, FileText, Info, Loader2, Lock, MailCheck, Package, Tag, Truck, User } from 'lucide-react'
import { isResetLink, useAuth } from '@/lib/auth'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Form = z.infer<typeof schema>
const BASE = import.meta.env.BASE_URL
const MODULES = [{ icon: Package, label: 'Products' }, { icon: Tag, label: 'Pricing' }, { icon: Truck, label: 'Shipping' }, { icon: FileText, label: 'Quotations' }]

export function Login() {
  const { t, lang, setLang } = useT()
  const { signIn, sendPasswordReset, finishRecovery } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [help, setHelp] = useState<'forgot' | 'access' | null>(null)
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  // forgot password: we email a reset link
  const [resetEmail, setResetEmail] = useState('')
  const [reset, setReset] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetError, setResetError] = useState<string | null>(null)
  // a reset link that could not log in (opened in another browser, or too old)
  const [badLink] = useState(isResetLink)
  useEffect(() => { if (badLink) finishRecovery() }, [badLink, finishRecovery])
  async function sendReset(e: React.FormEvent) {
    e.preventDefault()
    const email = resetEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setResetError('Enter a valid email')
    setResetError(null); setReset('sending')
    const err = await sendPasswordReset(email)
    if (err) { setResetError(err); setReset('idle') } else setReset('sent')
  }
  const onSubmit = async (v: Form) => { setError(null); const e = await signIn(v.email, v.password); if (e) setError(e) }

  const field = 'flex h-14 items-center gap-1 rounded-full border border-white/25 bg-white/10 px-5 text-white transition focus-within:border-lime-300/80 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-lime-300/30'

  return (
    <div className="min-h-screen">
      {/* the picture side keeps its place; only the form side follows the language direction */}
      <div dir="ltr" className="relative grid min-h-screen w-full overflow-hidden bg-gradient-to-br from-[#227d4c] to-[#0b4429] lg:grid-cols-[1.1fr_1fr]">
        {/* white side with a wavy edge (large screens) */}
        <svg aria-hidden="true" className="absolute inset-y-0 start-0 hidden h-full w-[60%] lg:block" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0 0 H80 C86 16 97 34 93 53 C89 71 74 82 71 100 H0 Z" fill="#f7f8f5" />
        </svg>
        <div className="relative hidden flex-col px-12 pb-10 pt-10 lg:flex">
          <img src={`${BASE}logo.png`} alt="MS El-brancy Group" className="h-14 w-auto self-start" />
          <img src={`${BASE}login-illustration.webp`} alt="A crate of Egyptian fruit and vegetables in front of the farm, with a plane flying over a world map"
            className="mx-auto my-auto w-full max-w-[640px] select-none drop-shadow-[0_18px_30px_rgba(20,83,45,0.12)]" draggable={false} />
          <p className="mt-auto pe-16 text-center text-2xl font-medium italic text-[#14532d]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('From our farms to global markets.')}</p>
          <div className="mx-auto mt-3 h-1 w-24 rounded-full bg-[#8bc34a] pe-16" />
        </div>

        {/* form side */}
        <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="relative mx-auto flex w-full max-w-xl flex-col justify-center px-6 py-10 text-white sm:px-12 lg:py-14">
          <img src={`${BASE}logo-white.png`} alt="MS El-brancy Group" className="mb-8 h-11 w-auto self-start lg:hidden" />
          <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} lang={lang === 'ar' ? 'en' : 'ar'}
            className="absolute end-6 top-6 rounded-full border border-white/30 px-3 py-1 text-sm font-semibold text-white hover:bg-white/10">{lang === 'ar' ? 'English' : 'عربي'}</button>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('System Login')}</h1>
          <p className="mt-2 text-lg text-white/85">{t('El Brancy Group Export System')}</p>
          <div className="mt-4 h-1 w-20 rounded-full bg-gradient-to-r from-lime-300 to-lime-500" />

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-10 space-y-4">
            {badLink && !error && <p role="alert" className="rounded-2xl border border-amber-200/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-50">{t('That reset link could not be used. It works once, for one hour, in the same browser where you asked for it. Ask for a new one below.')}</p>}
            {error && <p role="alert" className="rounded-2xl border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">{t(error)}</p>}
            <div>
              <label htmlFor="email" className="sr-only">{t('Email')}</label>
              <div className={field}>
                <User className="size-5 shrink-0 text-white/90" />
                <input id="email" type="email" autoComplete="email" placeholder={t('Enter your work email')} {...register('email')}
                  className="h-full w-full bg-transparent px-3 text-[15px] text-white outline-none placeholder:text-white/70" />
              </div>
              {errors.email && <p className="mt-1 px-5 text-xs text-red-200">{t(errors.email.message ?? '')}</p>}
            </div>
            <div>
              <label htmlFor="password" className="sr-only">{t('Password')}</label>
              <div className={field}>
                <Lock className="size-5 shrink-0 text-white/90" />
                <div className="h-full flex-1 [&_button]:end-0 [&_button]:text-white/80 [&_button:hover]:text-white [&_input]:h-14 [&_input]:border-0 [&_input]:bg-transparent [&_input]:px-3 [&_input]:text-[15px] [&_input]:text-white [&_input]:shadow-none [&_input]:placeholder:text-white/70 [&_input]:focus-visible:ring-0">
                  <PasswordInput id="password" autoComplete="current-password" placeholder={t('Enter your password')} {...register('password')} />
                </div>
              </div>
              {errors.password && <p className="mt-1 px-5 text-xs text-red-200">{t(errors.password.message ?? '')}</p>}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => { setHelp(help === 'forgot' ? null : 'forgot'); setResetEmail(getValues('email') ?? ''); setReset('idle'); setResetError(null) }} className="text-sm text-white underline underline-offset-4 hover:text-lime-200">{t('Forgot password?')}</button>
            </div>
            <button type="submit" disabled={isSubmitting}
              className="mx-auto flex h-14 w-full max-w-sm items-center justify-center gap-3 rounded-full bg-gradient-to-r from-lime-200 to-lime-500 text-lg font-bold text-[#0b3d22] shadow-[0_10px_24px_rgba(132,204,22,0.35)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b4a2c] disabled:opacity-70">
              {isSubmitting && <Loader2 className="size-5 animate-spin" />}{t('Login')} <ArrowRight className="size-5 rtl:-scale-x-100" />
            </button>
            <p className="text-center text-sm text-white/85">
              {t('Don’t have an account?')}{' '}
              <button type="button" onClick={() => setHelp(help === 'access' ? null : 'access')} className="font-medium text-lime-300 underline underline-offset-4 hover:text-lime-200">{t('Request access')}</button>
            </p>
            {help === 'access' && (
              <p role="status" className="flex gap-2 rounded-2xl border border-white/20 bg-white/10 p-3 text-sm text-white/90">
                <Info className="mt-0.5 size-4 shrink-0 text-lime-300" />
                {t('Accounts are created by the Super Admin. Ask them to add you from Team & Roles; you will receive your email and a temporary password.')}
              </p>
            )}
          </form>
          {help === 'forgot' && (
            <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white/90">
              {reset === 'sent' ? (
                <p role="status" className="flex gap-2"><MailCheck className="mt-0.5 size-4 shrink-0 text-lime-300" />
                  {t('If {email} has an account, a reset link is on its way. Open it on this device and browser; it works once and expires in one hour. Check the spam folder too.', { email: resetEmail.trim() })}</p>
              ) : (
                <form onSubmit={sendReset} noValidate className="space-y-3">
                  <label htmlFor="reset-email" className="block font-medium text-white">{t('We will email you a link to choose a new password.')}</label>
                  <div className="flex flex-wrap gap-2">
                    <input id="reset-email" type="email" autoComplete="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder={t('Enter your work email')} autoFocus
                      className="h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-4 text-white outline-none placeholder:text-white/70 focus:border-lime-300/80 focus:ring-2 focus:ring-lime-300/30" />
                    <button type="submit" disabled={reset === 'sending'} className="inline-flex h-11 items-center gap-2 rounded-full bg-lime-300 px-5 font-semibold text-[#0b3d22] hover:bg-lime-200 disabled:opacity-70">
                      {reset === 'sending' && <Loader2 className="size-4 animate-spin" />}{t('Send link')}</button>
                  </div>
                  {resetError && <p role="alert" className="text-xs text-red-200">{t(resetError)}</p>}
                  <p className="text-xs text-white/70">{t('No email? The Super Admin can also give you a temporary password from Team & Roles.')}</p>
                </form>
              )}
            </div>
          )}

          <ul className="mt-12 grid grid-cols-4" aria-label={t('What you can do in the platform')}>
            {MODULES.map(({ icon: Icon, label }, i) => (
              <li key={label} className={cn('flex flex-col items-center gap-2 text-center text-xs text-white/90 sm:text-sm', i > 0 && 'border-s border-white/20')}>
                <Icon className="size-8 text-lime-300" strokeWidth={1.5} />{t(label)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
