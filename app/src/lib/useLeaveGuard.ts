import { tr } from './i18n'
import { useEffect, useRef } from 'react'

/**
 * Warns before leaving a page with unsaved changes:
 * closing/reloading the tab (browser dialog) and clicking any in-app link.
 * Also gives Ctrl/Cmd+S to save.
 */
export function useLeaveGuard(dirty: boolean, onSave?: () => unknown) {
  const save = useRef(onSave)
  save.current = onSave
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#/"], a[href="#"]')
      if (!a || a.getAttribute('target') === '_blank' || e.ctrlKey || e.metaKey) return
      if (!window.confirm(tr('You have unsaved changes. Leave without saving?'))) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', onClick, true) }
  }, [dirty])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && save.current) { e.preventDefault(); save.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
