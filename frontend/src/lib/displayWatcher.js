// (c) 2026 William Li
//
// Keep the Environment panel's DISPLAY facts current when the window moves to another
// monitor. environment.js OBSERVES once; this file SUBSCRIBES.
//
// WHAT CAN CHANGE BETWEEN MONITORS. Only the display block: `dynamic-range`,
// `video-dynamic-range`, `color-gamut`, devicePixelRatio, and the screen's HDR headroom.
// Codec support, the float16 canvas, the WebGPU adapter and the browser itself do not — so
// they are never re-probed here. A re-read is cheap because it is only media queries.
//
// TWO TRIGGERS, AND WHY BOTH.
//   (1) Media-query `change` listeners. Always on, no permission, every browser. CSSOM View
//       fires `change` whenever a query's result changes for any reason, which includes
//       the window landing on a different display. Blind spot: two monitors that agree on
//       HDR, gamut and pixel ratio produce no event at all.
//   (2) Window Management `getScreenDetails()` → `currentscreenchange`. Chromium only,
//       needs the `window-management` permission, so it is opt-in from a user gesture. It
//       fires on the move itself even when every media query agrees, names the monitor, and
//       is the only route to the HDR headroom value (behind Chromium's experimental flag).
//
// HOW THEY COEXIST. One drag can fire several media-query changes and a
// currentscreenchange, in different ticks and in no promised order. Every event therefore
// goes through one scheduler that collapses a burst into a SINGLE re-read, and the re-read
// reads fresh state — event payloads and order are never trusted.
//
// Everything browser-facing is injectable (matchMedia, getScreenDetails, permissions,
// timers) so scripts/check-display-watcher.mjs can drive the logic in Node with fakes.
// Nothing touches `window` at import time.

// ── the display block ───────────────────────────────────────────────────────
// Media queries whose result can differ between monitors. `source` is the name the event
// log shows, so a user dragging between screens can see exactly which one fired.
export const DISPLAY_QUERIES = [
  { key: 'hdr', source: 'media:dynamic-range', query: '(dynamic-range: high)' },
  { key: 'videoHdr', source: 'media:video-dynamic-range', query: '(video-dynamic-range: high)' },
  { key: 'p3', source: 'media:color-gamut-p3', query: '(color-gamut: p3)' },
  { key: 'rec2020', source: 'media:color-gamut-rec2020', query: '(color-gamut: rec2020)' },
]

function defaultMatchMedia() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window) : null
}
function defaultDpr() {
  return typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
    ? window.devicePixelRatio : null
}

/**
 * Read the display block now. Pure given its inputs.
 * A query that cannot be evaluated is null — "cannot tell" — never false.
 */
export function readDisplay({ matchMedia = defaultMatchMedia(), getDpr = defaultDpr } = {}) {
  const out = {}
  for (const { key, query } of DISPLAY_QUERIES) {
    try {
      if (!matchMedia) { out[key] = null; continue }
      // A media feature the browser does not know does not throw: it parses to 'not all' and
      // never matches (Firefox has no video-dynamic-range). That is "cannot tell", not "no".
      const mql = matchMedia(query)
      out[key] = mql?.media === 'not all' ? null : !!mql?.matches
    } catch { out[key] = null }
  }
  const dpr = getDpr()
  out.dpr = typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? dpr : null
  return out
}

// MediaQueryList gained addEventListener in Safari 14; older WebKit has only addListener.
// Returns the matching remover so callers never have to know which one was used.
function listenMql(mql, fn) {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', fn)
    return () => mql.removeEventListener('change', fn)
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(fn)
    return () => mql.removeListener(fn)
  }
  return () => {}
}

/**
 * Trigger (1). Calls onEvent({ source }) whenever a display media query changes.
 * Returns unsubscribe.
 */
export function watchDisplay(onEvent, { matchMedia = defaultMatchMedia(), getDpr = defaultDpr } = {}) {
  if (!matchMedia) return () => {}
  const removers = []
  for (const { source, query } of DISPLAY_QUERIES) {
    try { removers.push(listenMql(matchMedia(query), () => onEvent({ source }))) } catch { /* unsupported query: skip */ }
  }

  // devicePixelRatio has no change event. The idiom is a `resolution` query pinned to the
  // CURRENT ratio: it fires once, on leaving that value, and never again for the next
  // change — so it must be re-created at the new ratio every time it fires.
  let removeRes = () => {}
  let stopped = false
  const armResolution = () => {
    removeRes()
    const dpr = getDpr()
    if (stopped || !(typeof dpr === 'number' && dpr > 0)) return
    try {
      removeRes = listenMql(matchMedia(`(resolution: ${dpr}dppx)`), () => {
        onEvent({ source: 'media:resolution' })
        armResolution()
      })
    } catch { removeRes = () => {} }
  }
  armResolution()

  return () => {
    stopped = true
    removeRes()
    for (const r of removers) r()
  }
}

// ── trigger (2): Window Management ──────────────────────────────────────────
// Headroom is exposed under two names: Chromium ships `hdrHeadroom` / `hdrheadroomchange`
// (Blink ScreenDetailedHdrHeadroom, experimental); the open W3C proposal
// (w3c/window-management PR #150) names it `headroom` / `headroomchange`. Accept both, and
// report which one answered.
const HEADROOM_NAMES = [
  { prop: 'hdrHeadroom', event: 'hdrheadroomchange' },
  { prop: 'headroom', event: 'headroomchange' },
]

export function readHeadroom(screen) {
  if (!screen) return { value: null, api: null }
  for (const { prop } of HEADROOM_NAMES) {
    const v = screen[prop]
    if (typeof v === 'number' && Number.isFinite(v)) return { value: v, api: prop }
  }
  return { value: null, api: null }
}

// Headroom in stops → linear multiple of SDR white. Chromium defines hdrHeadroom as
// log2(max(peakLuminance / sdrWhiteLevel, 1)) (Blink screen_detailed.cc), so 0 stops = 1×
// (no headroom) and each stop doubles it. The W3C proposal (PR #150) is still open; if a
// browser ever ships `headroom` with a different unit, this is the one place to change.
export function headroomRatio(stops) {
  return typeof stops === 'number' && Number.isFinite(stops) ? 2 ** stops : null
}

/** What trigger (2) knows about the screen the window is on. Plain data, no handles. */
export function readScreen(details) {
  const s = details?.currentScreen
  if (!s) return null
  const { value, api } = readHeadroom(s)
  // Windows reports labels with trailing padding ("H32T13 "); an all-space label is no label.
  const label = typeof s.label === 'string' ? s.label.trim() : ''
  return {
    label: label || null,
    isPrimary: typeof s.isPrimary === 'boolean' ? s.isPrimary : null,
    isInternal: typeof s.isInternal === 'boolean' ? s.isInternal : null,
    dpr: typeof s.devicePixelRatio === 'number' ? s.devicePixelRatio : null,
    screenCount: Array.isArray(details.screens) ? details.screens.length : null,
    headroom: value,
    headroomApi: api,
  }
}

/**
 * Permission state for window-management WITHOUT prompting.
 * Measured in Chromium 149: the name 'window-management' is queryable; the older
 * 'window-placement' throws TypeError. A throw here means "cannot tell", reported as null.
 */
export async function windowManagementPermission({ permissions = globalThis.navigator?.permissions } = {}) {
  try {
    if (!permissions?.query) return null
    return (await permissions.query({ name: 'window-management' })).state
  } catch { return null }
}

/**
 * Trigger (2). With `prompt: false` it attaches ONLY if permission is already granted, so it
 * is safe on mount. With `prompt: true` it calls getScreenDetails(), which may show the
 * permission prompt — call that only from a user gesture.
 *
 * Resolves { ok: true, details, unsubscribe } or { ok: false, reason } where reason is
 * 'unsupported' | 'not-granted' | 'denied' | 'error'.
 */
export async function watchScreenDetails(onEvent, {
  getScreenDetails = typeof window !== 'undefined' ? window.getScreenDetails : undefined,
  permissions = globalThis.navigator?.permissions,
  prompt = false,
} = {}) {
  // Absent in Safari, Firefox, and in an insecure context even on Chromium.
  if (typeof getScreenDetails !== 'function') return { ok: false, reason: 'unsupported' }

  if (!prompt) {
    const state = await windowManagementPermission({ permissions })
    if (state !== 'granted') return { ok: false, reason: state === 'denied' ? 'denied' : 'not-granted' }
  }

  let details
  try {
    // Called as a method of window: an unbound call throws "Illegal invocation".
    details = await getScreenDetails.call(typeof window !== 'undefined' ? window : undefined)
  } catch (e) {
    return e?.name === 'NotAllowedError'
      ? { ok: false, reason: 'denied' }
      : { ok: false, reason: 'error', message: e?.message || String(e) }
  }
  if (!details) return { ok: false, reason: 'error', message: 'getScreenDetails() returned nothing' }

  // Headroom listeners live on ONE ScreenDetailed — the current one. When the window moves,
  // a listener left on the old screen keeps reporting the monitor the window just LEFT, so
  // it is unbound and re-bound on every currentscreenchange.
  let unbindHeadroom = () => {}
  const bindHeadroom = () => {
    unbindHeadroom()
    const s = details.currentScreen
    if (!s || typeof s.addEventListener !== 'function') { unbindHeadroom = () => {}; return }
    const bound = []
    for (const { prop, event } of HEADROOM_NAMES) {
      if (!(prop in s) && !(`on${event}` in s)) continue
      const fn = () => onEvent({ source: event })
      s.addEventListener(event, fn)
      bound.push(() => s.removeEventListener(event, fn))
    }
    unbindHeadroom = () => { for (const b of bound) b() }
  }

  const onCurrent = () => { bindHeadroom(); onEvent({ source: 'currentscreenchange' }) }
  // screenschange: a monitor connected or disconnected. The current screen may not change,
  // but the screen count shown does.
  const onScreens = () => onEvent({ source: 'screenschange' })
  details.addEventListener('currentscreenchange', onCurrent)
  details.addEventListener('screenschange', onScreens)
  bindHeadroom()

  return {
    ok: true,
    details,
    unsubscribe: () => {
      details.removeEventListener('currentscreenchange', onCurrent)
      details.removeEventListener('screenschange', onScreens)
      unbindHeadroom()
    },
  }
}

// ── coalescing ──────────────────────────────────────────────────────────────
// Headroom tracks screen brightness and can fire continuously while a slider moves, so it
// waits longer before re-rendering than a monitor switch does.
export const SETTLE_MS = { default: 120, headroom: 250 }
const isHeadroomSource = (s) => s === 'hdrheadroomchange' || s === 'headroomchange'

/**
 * Collapse bursts of events into one call of run(sources[]). Trailing debounce, then one
 * animation frame so the read happens after the browser has applied the new display's
 * media-query results. Timers are injectable for tests.
 */
export function createScheduler(run, {
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn(),
} = {}) {
  let timer = null
  let pending = new Set()
  let wait = 0
  let cancelled = false
  return {
    schedule(source) {
      if (cancelled) return
      pending.add(source)
      wait = Math.max(wait, isHeadroomSource(source) ? SETTLE_MS.headroom : SETTLE_MS.default)
      if (timer !== null) clearTimer(timer)
      timer = setTimer(() => {
        timer = null
        const sources = [...pending]
        pending = new Set()
        wait = 0
        frame(() => { if (!cancelled) run(sources) })
      }, wait)
    },
    cancel() {
      cancelled = true
      if (timer !== null) clearTimer(timer)
      timer = null
      pending = new Set()
    },
  }
}

/**
 * The whole thing, as the Environment panel uses it.
 *
 * onUpdate({ display, screen, sources }) is called after each coalesced burst with a FRESH
 * read. `screen` is null unless trigger (2) is active.
 *
 * start()     — attach trigger (1), and trigger (2) silently if permission is already granted.
 *               Resolves the trigger-(2) status: 'active' | 'unsupported' | 'not-granted' | 'denied' | 'error'.
 * identify()  — user gesture: attach trigger (2), prompting if needed. Resolves the same statuses.
 * stop()      — detach everything. Safe to call more than once, and before start() settles.
 *
 * deps.onStatus(status), optional, reports a status change that did NOT come from this
 * monitor's own start()/identify() — today, permission granted through ANOTHER monitor on the
 * page (Settings' Identify displays while the HDR tab is open), which this monitor then
 * attaches to silently rather than showing its own Identify button until remounted.
 */
// Monitors started and not yet stopped, so a permission granted through one reaches the rest.
const liveMonitors = new Set()

export function createDisplayMonitor(onUpdate, deps = {}) {
  const { matchMedia, getDpr, getScreenDetails, permissions, timers, onStatus } = deps
  const readOpts = {
    ...(matchMedia ? { matchMedia } : {}),
    ...(getDpr ? { getDpr } : {}),
  }
  const screenOpts = {
    ...('getScreenDetails' in deps ? { getScreenDetails } : {}),
    ...('permissions' in deps ? { permissions } : {}),
  }
  let details = null
  let unwatch1 = () => {}
  let unwatch2 = () => {}
  let stopped = false

  const emit = (sources) => onUpdate({
    display: readDisplay(readOpts),
    screen: details ? readScreen(details) : null,
    sources,
  })
  const scheduler = createScheduler(emit, timers)
  const onEvent = ({ source }) => scheduler.schedule(source)

  const attach2 = async (prompt) => {
    if (details) return 'active'
    const r = await watchScreenDetails(onEvent, { ...screenOpts, prompt })
    if (!r.ok) return r.reason
    if (stopped) { r.unsubscribe(); return 'not-granted' }
    details = r.details
    unwatch2 = r.unsubscribe
    // Report the screen facts straight away rather than waiting for the next move.
    scheduler.schedule(prompt ? 'identify' : 'permission-granted')
    // Granted by the user just now: every other monitor on the page can attach without asking.
    if (prompt) for (const m of liveMonitors) if (m !== api) m.permissionGranted()
    return 'active'
  }

  const api = {
    async start() {
      if (!stopped) liveMonitors.add(api)
      unwatch1 = watchDisplay(onEvent, readOpts)
      return attach2(false)
    },
    identify() { return attach2(true) },
    // Called by another monitor after its identify() succeeded. Never prompts.
    async permissionGranted() {
      if (stopped || details) return
      const s = await attach2(false)
      if (!stopped) onStatus?.(s)
    },
    stop() {
      stopped = true
      liveMonitors.delete(api)
      scheduler.cancel()
      unwatch1(); unwatch2()
      unwatch1 = unwatch2 = () => {}
      details = null
    },
  }
  return api
}
