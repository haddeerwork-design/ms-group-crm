import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, getTheme } from './lib/theme'
import './index.css'

applyTheme(getTheme())
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)

// installable app (Add to Home Screen); the worker never caches the app, so updates show at once
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* not critical */ }) })
}
