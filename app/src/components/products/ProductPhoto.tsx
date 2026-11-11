import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { productImageUrl } from '@/lib/catalog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PhotoChange = { file: File | null } | null // null = no change; { file: null } = remove

/** Photo of the product for the catalog: pick (or drop) a picture; it is saved with the product. */
export function ProductPhotoPicker({ path, change, onChange, disabled }: { path?: string | null; change: PhotoChange; onChange: (c: PhotoChange) => void; disabled?: boolean }) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!change?.file) { setPreview(null); return }
    const u = URL.createObjectURL(change.file); setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [change])
  const src = change ? preview : productImageUrl(path)
  function take(f: File | undefined) {
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return alert(t('Choose a JPG, PNG or WebP photo.'))
    if (f.size > 15 * 1024 * 1024) return alert(t('This photo is too big (max 15 MB).'))
    onChange({ file: f })
  }
  return (
    <div className="flex items-center gap-4">
      <button type="button" disabled={disabled} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]) }}
        aria-label={t(src ? 'Change photo' : 'Add a photo')}
        className={cn('grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary hover:text-primary disabled:pointer-events-none',
          over && 'border-primary bg-primary/5', src && 'border-solid')}>
        {src ? <img src={src} alt="" className="size-full object-cover" /> : <ImagePlus className="size-7" />}
      </button>
      <div className="space-y-1.5 text-sm">
        <div className="font-medium">{t('Product photo')}</div>
        <p className="text-xs text-muted-foreground">{t('Used in the product catalog. Click or drop a photo; big phone photos are made smaller automatically.')}</p>
        {!disabled && <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>{src ? 'Change photo' : 'Add a photo'}</Button>
          {src && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(path ? { file: null } : null)}><Trash2 />Remove</Button>}
        </div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
