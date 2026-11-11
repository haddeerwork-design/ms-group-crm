import { useTx } from '@/lib/i18n'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, placeholder, ...props }, ref) => {
    const tx = useTx()
    return (
    <input
      ref={ref}
      placeholder={typeof placeholder === 'string' ? (tx(placeholder) as string) : placeholder}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
    )
  },
)
Input.displayName = 'Input'
