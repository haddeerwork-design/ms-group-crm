import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** "Install app" in the header: shown only when the phone / browser can install it and it is not installed yet. */
export function InstallApp() {
  const { t } = useT()
  const [evt, setEvt] = useState<PromptEvent | null>(null)
  const [help, setHelp] = useState(false)
  const [installed, setInstalled] = useState(standalone)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent) }
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (installed || (!evt && !isIOS())) return null

  async function install() {
    if (!evt) return setHelp(true) // iPhone / iPad: Safari has no install button, so show the 2 steps
    await evt.prompt()
    const { outcome } = await evt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setEvt(null)
  }
  return (
    <>
      <Button variant="ghost" size="icon" onClick={install} aria-label={t('Install the app')} data-tip={t('Install the app')}><Download /></Button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('Install the app')}</DialogTitle><DialogDescription>{t('Add it to your home screen to open it like any app.')}</DialogDescription></DialogHeader>
          <DialogBody>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted"><Share className="size-4" /></span>{t('In Safari, tap the Share button at the bottom of the screen.')}</li>
              <li className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted"><SquarePlus className="size-4" /></span>{t('Choose “Add to Home Screen”, then tap Add.')}</li>
            </ol>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
