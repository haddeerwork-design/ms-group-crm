import { useTx } from '@/lib/i18n'
import * as React from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-card shadow-xl focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute end-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  )
}
export function DialogHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-5 py-4 pe-12', className)} {...p} />
}
export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof D.Title>>(
  ({ className, children, ...p }, ref) => { const tx = useTx(); return <D.Title ref={ref} className={cn('text-base font-semibold', className)} {...p}>{tx(children)}</D.Title> },
)
DialogTitle.displayName = 'DialogTitle'
export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof D.Description>>(
  ({ className, children, ...p }, ref) => { const tx = useTx(); return <D.Description ref={ref} className={cn('mt-1 text-sm text-muted-foreground', className)} {...p}>{tx(children)}</D.Description> },
)
DialogDescription.displayName = 'DialogDescription'
export function DialogBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...p} />
}
export function DialogFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3', className)} {...p} />
}
