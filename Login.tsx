import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/ui/states'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Form = z.infer<typeof schema>

export function Login() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (v: Form) => { setError(null); const e = await signIn(v.email, v.password); if (e) setError(e) }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-emerald-brand/30 blur-3xl" />
        <p className="relative text-sm font-medium tracking-wide text-white/70">Export Management Platform</p>
        <div className="relative">
          <h2 className="text-4xl font-semibold leading-tight">Rooted in Egypt,<br />Reaching the World.</h2>
          <p className="mt-4 max-w-sm text-white/70">From the farm to the final shipment — importers, pricing, shipping and documents in one place.</p>
        </div>
        <p className="relative text-xs text-white/50">MS El-brancy Group · Internal use only</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-5" noValidate>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="MS El-brancy Group" className="mb-2 h-12 w-auto dark:rounded dark:bg-white dark:p-1" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your company email and password.</p>
          </div>
          {error && <ErrorState message={error} />}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
