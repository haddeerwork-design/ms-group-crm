import { Fragment, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { AR } from './i18n-ar'

// Interface language. English text is the key; Arabic comes from i18n-ar.ts.
// A missing Arabic entry simply shows the English text (never a blank).
// Printed documents (quotations, proformas) have their own language and are not affected.
export type Lang = 'en' | 'ar'
type Vars = Record<string, string | number>
const KEY = 'ms_lang'

const fill = (s: string, v?: Vars) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`)) : s)
export function translate(lang: Lang, en: string, v?: Vars) { return fill(lang === 'ar' ? AR[en] ?? en : en, v) }

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => { try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en' } catch { return 'en' } })
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* ignore */ } }, [])
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useT() {
  const { lang, setLang } = useContext(Ctx)
  const t = useCallback((en: string, v?: Vars) => translate(lang, en, v), [lang])
  return { t, lang, setLang, rtl: lang === 'ar' }
}

/** For code outside React components (toasts in helpers, confirm dialogs): uses the current page language. */
export const tr = (en: string, v?: Vars) => translate(document.documentElement.lang === 'ar' ? 'ar' : 'en', en, v)

/**
 * Translates plain text inside shared UI parts (buttons, labels, card titles, select options…),
 * so most screens switch language without touching every page. Data never matches a key, so it stays as is.
 */
export function useTx() {
  const { t, lang } = useT()
  return useCallback(function tx(node: ReactNode): ReactNode {
    if (lang === 'en' || node == null || typeof node === 'boolean') return node
    if (typeof node === 'string') {
      const m = node.match(/^(\s*)(.*?)(\s*)$/s)!
      return m[2] ? m[1] + t(m[2]) + m[3] : node
    }
    if (Array.isArray(node)) return node.map((c, i) => { const r = tx(c); return isValidElement(r) && r.key == null ? cloneElement(r, { key: i }) : r })
    if (isValidElement(node)) {
      const el = node as ReactElement<{ children?: ReactNode }>
      if ((el.type === 'option' || el.type === Fragment || el.type === 'optgroup') && el.props.children != null) {
        // an <option> without value= uses its text as the value: keep the English value
        const keep = el.type === 'option' && (el.props as { value?: unknown }).value === undefined && typeof el.props.children === 'string'
        return cloneElement(el as ReactElement<Record<string, unknown>>, keep ? { value: el.props.children } : undefined, tx(el.props.children))
      }
    }
    return node
  }, [t, lang])
}

/** <T>Plain text</T>: translated text in any JSX without wiring a hook. */
export function T({ children }: { children?: ReactNode }) {
  const tx = useTx()
  return <>{tx(children)}</>
}

/** <TV k="{n} items" v={{ n: 3 }} />: translated text with values. */
export function TV({ k, v }: { k: string; v?: Vars }) {
  const { t } = useT()
  return <>{t(k, v)}</>
}
