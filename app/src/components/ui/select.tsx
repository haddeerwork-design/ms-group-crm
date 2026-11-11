import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, useTx } from '@/lib/i18n'

// ---------------------------------------------------------------------
// One dropdown for the whole app.
//  • Short lists (≤ 7 choices) stay the native dropdown — fastest, and the
//    phone shows its own picker.
//  • Longer lists open a searchable list: type a few letters to filter,
//    ↑ ↓ to move, Enter to pick, Esc to close; groups keep their titles.
// The real <select> stays in the page (hidden), so forms, validation and
// every existing onChange keep working exactly as before.
// ---------------------------------------------------------------------

type Opt = { value: string; label: string; group?: string; disabled?: boolean }
const SEARCH_FROM = 8

const text = (n: React.ReactNode): string =>
  n == null || typeof n === 'boolean' ? '' : typeof n === 'string' || typeof n === 'number' ? String(n)
    : Array.isArray(n) ? n.map(text).join('') : React.isValidElement(n) ? text((n.props as { children?: React.ReactNode }).children) : ''

/** Reads <option> / <optgroup> children (also inside fragments and arrays). */
export function readOptions(children: React.ReactNode, group?: string): Opt[] {
  const out: Opt[] = []
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return
    const p = c.props as { value?: unknown; children?: React.ReactNode; label?: string; disabled?: boolean }
    if (c.type === 'option') out.push({ value: p.value === undefined ? text(p.children) : String(p.value), label: text(p.children), group, disabled: !!p.disabled })
    else if (c.type === 'optgroup') out.push(...readOptions(p.children, p.label))
    else if (c.type === React.Fragment) out.push(...readOptions(p.children, group))
  })
  return out
}
/** Search ignores case, accents and Arabic letter forms. */
export const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    const tx = useTx()
    const translated = tx(children)
    const options = React.useMemo(() => readOptions(translated), [translated])
    const searchable = options.filter((o) => o.value !== '').length >= SEARCH_FROM && !props.multiple
    const native = (
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full appearance-none rounded-lg border border-input bg-card py-1 ps-3 pe-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...props}
      >
        {translated}
      </select>
    )
    if (!searchable) {
      return (
        <div className="relative">
          {native}
          <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      )
    }
    return <SearchSelect native={native} options={options} className={className} selectProps={props} forwardedRef={ref} />
  },
)
Select.displayName = 'Select'

function SearchSelect({ native, options, className, selectProps, forwardedRef }: {
  native: React.ReactElement; options: Opt[]; className?: string
  selectProps: React.SelectHTMLAttributes<HTMLSelectElement>; forwardedRef: React.ForwardedRef<HTMLSelectElement>
}) {
  const { t } = useT()
  const sel = React.useRef<HTMLSelectElement | null>(null)
  const btn = React.useRef<HTMLButtonElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const list = React.useRef<HTMLUListElement>(null)
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [active, setActive] = React.useState(0)
  const [up, setUp] = React.useState(false)
  const [maxH, setMaxH] = React.useState(300)
  // current value: from the value prop when controlled, otherwise from the hidden select
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  const value = selectProps.value !== undefined ? String(selectProps.value ?? '') : sel.current?.value ?? String(selectProps.defaultValue ?? '')
  const current = options.find((o) => o.value === value)
  const placeholder = options.find((o) => o.value === '')

  const shown = React.useMemo(() => {
    const f = fold(q.trim())
    return f ? options.filter((o) => o.value !== '' && fold(`${o.label} ${o.group ?? ''}`).includes(f)) : options
  }, [q, options])

  const setRef = (el: HTMLSelectElement | null) => {
    sel.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }
  function pick(o: Opt) {
    if (o.disabled || !sel.current) return
    // set the real select and fire its change event, so onChange / react-hook-form see it as usual
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel.current, o.value)
    sel.current.dispatchEvent(new Event('change', { bubbles: true }))
    setOpen(false); setQ(''); force(); btn.current?.focus()
  }
  function openList() {
    if (selectProps.disabled) return
    // open upwards when there is not enough room below (inside dialogs and near the bottom)
    const r = btn.current!.getBoundingClientRect()
    let bottom = window.innerHeight, top = 0
    for (let el = btn.current!.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el)
      if (/(auto|scroll|hidden)/.test(s.overflowY)) { const b = el.getBoundingClientRect(); bottom = Math.min(bottom, b.bottom); top = Math.max(top, b.top); break }
    }
    const below = bottom - r.bottom - 8, above = r.top - top - 8
    const goUp = below < 220 && above > below
    setUp(goUp); setMaxH(Math.max(160, Math.min(320, goUp ? above : below)))
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  React.useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])
  React.useEffect(() => { setActive(0) }, [q])
  React.useEffect(() => { force() }, []) // read the hidden select's value once it exists

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQ(''); btn.current?.focus() }
    else if (e.key === 'Tab') { setOpen(false); setQ('') }
  }

  let lastGroup: string | undefined
  return (
    <div className="relative" ref={box}>
      {/* the real select: hidden, but it holds the value for forms and onChange */}
      {React.cloneElement(native as React.ReactElement<{ ref?: unknown; id?: string; className?: string; tabIndex?: number; 'aria-hidden'?: boolean; onChange?: unknown }>, {
        ref: setRef, id: undefined, className: 'sr-only', tabIndex: -1, 'aria-hidden': true,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => { selectProps.onChange?.(e); force() },
      })}
      <button ref={btn} type="button" id={selectProps.id} disabled={selectProps.disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={selectProps['aria-label']}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openList() } }}
        className={cn('flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-card py-1 pe-8 ps-3 text-start text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60', className)}>
        <span className={cn('min-w-0 flex-1 truncate', !current?.value && 'text-muted-foreground')}>{current?.label || placeholder?.label || t('Choose…')}</span>
      </button>
      <ChevronDown className={cn('pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform', open && 'rotate-180')} />
      {open && (
        <div className={cn('absolute z-50 w-full min-w-[260px] overflow-hidden rounded-xl border border-border bg-card shadow-xl', up ? 'bottom-full mb-1' : 'top-full mt-1')}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder={t('Type to search…')}
              role="combobox" aria-expanded aria-controls={`${id}-list`} aria-activedescendant={shown[active] ? `${id}-o${active}` : undefined}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <ul ref={list} id={`${id}-list`} role="listbox" className="overflow-y-auto py-1" style={{ maxHeight: maxH - 44 }}>
            {!shown.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('Nothing found.')}</li>}
            {shown.map((o, i) => {
              const head = o.group && o.group !== lastGroup ? (lastGroup = o.group) : null
              if (!o.group) lastGroup = undefined
              const selected = o.value === value
              return (
                <React.Fragment key={`${o.group ?? ''}|${o.value}`}>
                  {head && <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{head}</li>}
                  <li id={`${id}-o${i}`} data-i={i} role="option" aria-selected={selected} aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                    className={cn('mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-accent', o.disabled && 'cursor-not-allowed opacity-50', o.value === '' && 'text-muted-foreground')}>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {selected && <Check className="size-4 shrink-0 text-primary" />}
                  </li>
                </React.Fragment>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
