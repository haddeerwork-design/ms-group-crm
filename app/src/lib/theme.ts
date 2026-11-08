const KEY = 'ms_theme'
export function getTheme(): 'light' | 'dark' {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function applyTheme(t: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', t === 'dark')
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
}
