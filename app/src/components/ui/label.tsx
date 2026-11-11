import { useTx } from '@/lib/i18n'
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, children, ...props }, ref) => {
  const tx = useTx()
  return <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props}>{tx(children)}</LabelPrimitive.Root>
})
Label.displayName = 'Label'
