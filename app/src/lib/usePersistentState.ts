import { useEffect, useState } from 'react'

/** useState that is remembered in this browser (filters, views). Falls back silently if storage is blocked. */
export function usePersistentState<T>(key: string, initial: T) {
  const k = `ms_ui:${key}`
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(k)
      if (raw == null) return initial
      const saved = JSON.parse(raw)
      // objects: keep new keys added later; other values: use as saved if the type matches
      if (initial && typeof initial === 'object' && !Array.isArray(initial)) return { ...initial, ...saved } as T
      return typeof saved === typeof initial ? (saved as T) : initial
    }
    catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }, [k, v])
  return [v, setV] as const
}
