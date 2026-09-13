// (c) 2026 William Li
import { useCallback, useEffect, useRef, useState } from 'react'
import { createDisplayMonitor, readDisplay } from '../lib/displayWatcher.js'

/**
 * The display the window is on NOW, kept current as it moves between monitors — the same
 * lib/displayWatcher.js monitor the Environment panel uses, for panels that need the live
 * display rather than the one detected when the page loaded.
 *
 * Returns { display, screen, status, identify }:
 *   display  { hdr, videoHdr, p3, rec2020, dpr } — media queries, always available
 *   screen   { label, headroom, … } or null — only once window-management is permitted
 *   status   'checking' | 'not-granted' | 'asking' | 'active' | 'denied' | 'unsupported' | 'error'
 *   identify() — call from a click: asks for the permission (may prompt)
 *
 * Never prompts on its own: start() attaches the screen watcher only if permission was
 * already granted (for example through Settings → Environment → Identify displays).
 */
export function useLiveDisplay() {
  const [state, setState] = useState(() => ({ display: readDisplay(), screen: null, status: 'checking' }))
  const monitorRef = useRef(null)

  useEffect(() => {
    let dead = false
    const monitor = createDisplayMonitor(({ display, screen }) => {
      if (!dead) setState((s) => ({ ...s, display, screen }))
    })
    monitorRef.current = monitor
    monitor.start().then((status) => { if (!dead) setState((s) => ({ ...s, status })) })
    return () => { dead = true; monitor.stop(); monitorRef.current = null }
  }, [])

  const identify = useCallback(async () => {
    const monitor = monitorRef.current
    if (!monitor) return
    setState((s) => ({ ...s, status: 'asking' }))
    const status = await monitor.identify()
    if (monitorRef.current === monitor) setState((s) => ({ ...s, status }))
  }, [])

  return { ...state, identify }
}
