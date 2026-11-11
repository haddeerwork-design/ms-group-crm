import { useTx } from '@/lib/i18n'
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...p} />
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...p} />
}
export function CardTitle({ className, children, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  const tx = useTx()
  return <h3 className={cn('text-base font-semibold tracking-tight', className)} {...p}>{tx(children)}</h3>
}
export function CardDescription({ className, children, ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  const tx = useTx()
  return <p className={cn('text-sm text-muted-foreground', className)} {...p}>{tx(children)}</p>
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...p} />
}
