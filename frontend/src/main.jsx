// (c) 2026 William Li
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LangProvider } from './i18n.jsx'
import { NumberBaseProvider } from './numberBase.jsx'

// A deploy replaces every hashed chunk and `rsync --delete` removes the old ones, so a
// tab still holding the previous index.html 404s the moment it lazy-loads a tab it has
// not opened yet (Phil Green hit this on the Analysis tab across two same-day beta
// redeploys: "error loading dynamically imported module …/AnalysisPanel-<oldhash>.js").
// Vite reports that failure as `vite:preloadError` before rethrowing. Reloading fetches
// the current index.html, whose chunks exist. The sessionStorage guard allows ONE reload
// per tab per failing chunk, so a genuinely missing chunk (or an offline user) cannot
// loop the page; a second failure falls through to the normal error path.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'profiletool.preloadReload'
  const chunk = String(event?.payload?.message || '').replace(/^.*\//, '') || 'unknown'
  let seen = null
  try { seen = sessionStorage.getItem(key) } catch { /* storage unavailable: still reload once */ }
  if (seen === chunk) return                          // already reloaded for this chunk: give up
  try { sessionStorage.setItem(key, chunk) } catch { /* ignore */ }
  event.preventDefault()
  window.location.reload()
})

// Render first, unconditionally. Nothing in the app's mount path may depend on
// analytics — see the dynamic import below.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <NumberBaseProvider>
        <App />
      </NumberBaseProvider>
    </LangProvider>
  </StrictMode>
)

// Analytics is loaded lazily and defensively, AFTER render. A content blocker
// (uBlock / Brave shields / etc.) blocks lib/analytics.js with
// ERR_BLOCKED_BY_CLIENT because its path matches ad-filter lists — and a *static*
// import of it would take the whole ES-module graph down with it, so React would
// never mount (a blank "Loading the app…" page in any browser with a blocker).
// A caught dynamic import keeps that failure fully contained: if it's blocked or
// fails to load, the app simply runs without GA.
import('./lib/analytics.js')
  .then((m) => m.initAnalytics())
  .catch(() => { /* analytics blocked/unavailable — run without it */ })
