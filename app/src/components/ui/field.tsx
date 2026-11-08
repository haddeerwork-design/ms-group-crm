import type { ReactNode } from 'react'
import { Label } from './label'
import { cn } from '@/lib/utils'

export function Field({ label, htmlFor, error, hint, className, children }:
  { label: string; htmlFor?: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
