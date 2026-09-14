#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/displayWatcher.js with FAKE MediaQueryLists and ScreenDetails.
//
// Why fakes: the behaviour that matters happens when a window moves between two monitors,
// which headless Chromium cannot simulate. The subscription logic is independent of real
// hardware, so it is exercised here event by event. What this does NOT prove is that a
// real browser fires these events on a real move — that is the manual two-monitor check in
// hdr-display-triggers-plan.md §7.

import {
  readDisplay, watchDisplay, watchScreenDetails, readScreen, readHeadroom, headroomRatio,
  createScheduler, createDisplayMonitor, windowManagementPermission, SETTLE_MS,
} from '../frontend/src/lib/displayWatcher.js'

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`)
}

// ── fakes ──────────────────────────────────────────────────────────────────
class FakeTarget {
  constructor() { this.listeners = new Map() }
  addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, new Set()).get(type)).add(fn) }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
  count(type) { return this.listeners.get(type)?.size || 0 }
  total() { let n = 0; for (const s of this.listeners.values()) n += s.size; return n }
  fire(type) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type }) }
}

// A fake "display": query results live here, and every MQL created for a query shares them,
// like a browser. `legacy` builds MQLs with only addListener (Safari < 14).
function fakeMedia(initial = {}, { legacy = false } = {}) {
  const state = { '(dynamic-range: high)': false, '(video-dynamic-range: high)': false,
    '(color-gamut: p3)': false, '(color-gamut: rec2020)': false, ...initial }
  let dpr = 1
  const mqls = []
  const matchMedia = (q) => {
    const t = new FakeTarget()
    const mql = { media: q, get matches() {
      const m = /^\(resolution: ([\d.]+)dppx\)$/.exec(q)
      return m ? Number(m[1]) === dpr : !!state[q]
    } }
    if (legacy) { mql.addListener = (fn) => t.addEventListener('change', fn); mql.removeListener = (fn) => t.removeEventListener('change', fn) }
    else { mql.addEventListener = t.addEventListener.bind(t); mql.removeEventListener = t.removeEventListener.bind(t) }
    mql._t = t
    mqls.push(mql)
    return mql
  }
  return {
    matchMedia, getDpr: () => dpr, mqls,
    // Change a query result and fire `change` on every MQL for it whose result changed.
    set(q, v) { const before = mqls.filter((m) => m.media === q).map((m) => m.matches); state[q] = v
      mqls.filter((m) => m.media === q).forEach((m, i) => { if (m.matches !== before[i]) m._t.fire('change') }) },
    setDpr(v) { const res = mqls.filter((m) => m.media.startsWith('(resolution')); const before = res.map((m) => m.matches); dpr = v
      res.forEach((m, i) => { if (m.matches !== before[i]) m._t.fire('change') }) },
    listeners() { return mqls.reduce((n, m) => n + m._t.total(), 0) },
  }
}

function fakeScreen(props) { const s = new FakeTarget(); Object.assign(s, props); return s }
function fakeDetails(screens, current = 0) {
  const d = new FakeTarget()
  d.screens = screens
  d.currentScreen = screens[current]
  d.moveTo = (i) => { d.currentScreen = screens[i]; d.fire('currentscreenchange') }
  return d
}
const granted = { query: async () => ({ state: 'granted' }) }
const prompting = { query: async () => ({ state: 'prompt' }) }

// Manual timers: nothing runs until flush(), so "a burst" is exactly the events fired in between.
function manualTimers() {
  let next = 1; const q = new Map()
  return {
    setTimer: (fn, ms) => { const id = next++; q.set(id, { fn, ms }); return id },
    clearTimer: (id) => q.delete(id),
    frame: (fn) => fn(),
    pending: () => q.size,
    lastDelay: () => [...q.values()].at(-1)?.ms,
    flush() { const all = [...q.values()]; q.clear(); all.forEach((t) => t.fn()) },
  }
}

// ── readDisplay ────────────────────────────────────────────────────────────
{
  const m = fakeMedia({ '(dynamic-range: high)': true, '(color-gamut: p3)': true })
  const d = readDisplay(m)
  check('readDisplay reads each query', d.hdr === true && d.videoHdr === false && d.p3 === true && d.rec2020 === false, d)
  check('readDisplay reports dpr', d.dpr === 1, d)
  const none = readDisplay({ matchMedia: null, getDpr: () => undefined })
  check('no matchMedia → null (cannot tell), not false', none.hdr === null && none.p3 === null && none.dpr === null, none)
  const throwing = readDisplay({ matchMedia: () => { throw new Error('x') }, getDpr: () => 2 })
  check('throwing matchMedia → null per query', throwing.hdr === null && throwing.dpr === 2, throwing)
  // A feature the browser does not know parses to 'not all' and never matches — cannot tell.
  const notAll = readDisplay({ matchMedia: (q) => ({ media: /video-dynamic-range/.test(q) ? 'not all' : q, matches: false }), getDpr: () => 1 })
  check("unknown media feature ('not all') → null, a known one still false", notAll.videoHdr === null && notAll.hdr === false, notAll)
}

// ── trigger (1) ────────────────────────────────────────────────────────────
{
  const m = fakeMedia()
  const events = []
  const stop = watchDisplay((e) => events.push(e.source), m)
  m.set('(dynamic-range: high)', true)
  check('dynamic-range change fires once', events.length === 1 && events[0] === 'media:dynamic-range', events)
  m.set('(color-gamut: p3)', true)
  check('color-gamut change names its source', events.at(-1) === 'media:color-gamut-p3', events)

  // Resolution: the query is pinned to a ratio, so it must be re-created after each change.
  events.length = 0
  m.setDpr(1.5)
  check('dpr 1 → 1.5 fires media:resolution', events.join() === 'media:resolution', events)
  m.setDpr(2)
  check('dpr 1.5 → 2 ALSO fires (query was re-created at 1.5)', events.join() === 'media:resolution,media:resolution', events)
  const liveRes = m.mqls.filter((q) => q.media.startsWith('(resolution') && q._t.total() > 0).map((q) => q.media)
  check('exactly one live resolution listener, at the current ratio', liveRes.length === 1 && liveRes[0] === '(resolution: 2dppx)', liveRes)

  stop()
  check('unsubscribe removes every media listener', m.listeners() === 0, m.listeners())
  m.set('(dynamic-range: high)', false); m.setDpr(1)
  check('no events after unsubscribe', events.length === 2, events)
}
{
  const m = fakeMedia({}, { legacy: true })
  const events = []
  const stop = watchDisplay((e) => events.push(e.source), m)
  m.set('(dynamic-range: high)', true)
  check('legacy addListener-only MQL still fires', events.join() === 'media:dynamic-range', events)
  stop()
  check('legacy MQL listeners removed on unsubscribe', m.listeners() === 0, m.listeners())
}

// ── scheduler ──────────────────────────────────────────────────────────────
{
  const t = manualTimers()
  const runs = []
  const s = createScheduler((src) => runs.push(src), t)
  for (const src of ['media:dynamic-range', 'media:color-gamut-p3', 'media:dynamic-range', 'media:resolution', 'currentscreenchange']) s.schedule(src)
  check('burst leaves ONE pending timer', t.pending() === 1, t.pending())
  t.flush()
  check('burst of 5 events → one run', runs.length === 1, runs)
  check('run receives each distinct source once', runs[0]?.length === 4, runs[0])
  s.schedule('hdrheadroomchange')
  check('headroom waits longer to settle', t.lastDelay() === SETTLE_MS.headroom, t.lastDelay())
  s.schedule('currentscreenchange')
  check('a monitor switch after headroom does not shorten the wait', t.lastDelay() === SETTLE_MS.headroom, t.lastDelay())
  s.cancel(); t.flush()
  check('cancel drops the pending run', runs.length === 1, runs.length)
}
{
  // Unmount in the gap between the debounce firing and the animation frame: the frame is
  // already queued, so only the in-frame check stops a stale update reaching a dead panel.
  const t = manualTimers()
  const frames = []
  const runs = []
  const s = createScheduler((src) => runs.push(src), { ...t, frame: (fn) => frames.push(fn) })
  s.schedule('media:dynamic-range')
  t.flush()
  check('timer fired, frame queued, not yet run', frames.length === 1 && runs.length === 0)
  s.cancel()
  frames.forEach((f) => f())
  check('cancel after the timer but before the frame → no run', runs.length === 0, runs)
}

// ── trigger (2) ────────────────────────────────────────────────────────────
{
  const r = await watchScreenDetails(() => {}, { getScreenDetails: undefined, permissions: granted })
  check('no getScreenDetails → unsupported', !r.ok && r.reason === 'unsupported', r)

  let called = 0
  const gsd = async () => { called++; return fakeDetails([fakeScreen({})]) }
  const r2 = await watchScreenDetails(() => {}, { getScreenDetails: gsd, permissions: prompting, prompt: false })
  check('prompt:false and permission "prompt" → not-granted, and getScreenDetails NOT called',
    !r2.ok && r2.reason === 'not-granted' && called === 0, { r2, called })
  const r3 = await watchScreenDetails(() => {}, { getScreenDetails: gsd, permissions: { query: async () => { throw new TypeError('bad name') } } })
  check('permission query throws → not-granted, no call', !r3.ok && r3.reason === 'not-granted' && called === 0, r3)
  const r4 = await watchScreenDetails(() => {}, { getScreenDetails: gsd, permissions: { query: async () => ({ state: 'denied' }) } })
  check('permission denied → denied, no call', !r4.ok && r4.reason === 'denied' && called === 0, r4)

  const denied = async () => { const e = new Error('Permission denied.'); e.name = 'NotAllowedError'; throw e }
  const r5 = await watchScreenDetails(() => {}, { getScreenDetails: denied, permissions: prompting, prompt: true })
  check('prompt:true and user denies → denied', !r5.ok && r5.reason === 'denied', r5)
  const r6 = await watchScreenDetails(() => {}, { getScreenDetails: async () => { throw new Error('boom') }, prompt: true })
  check('other failure → error with message', !r6.ok && r6.reason === 'error' && r6.message === 'boom', r6)
}
{
  // Two screens: SDR laptop with Chromium's name, HDR monitor with the proposal's name.
  const sdr = fakeScreen({ label: 'Built-in', isPrimary: true, isInternal: true, devicePixelRatio: 1.5, hdrHeadroom: 0, onhdrheadroomchange: null })
  const hdr = fakeScreen({ label: 'External HDR', isPrimary: false, isInternal: false, devicePixelRatio: 1, headroom: 2.3, onheadroomchange: null })
  const details = fakeDetails([sdr, hdr], 0)
  const events = []
  const r = await watchScreenDetails((e) => events.push(e.source), { getScreenDetails: async () => details, permissions: granted })
  check('granted → ok', r.ok, r)
  check('headroom listener bound on current screen (hdrHeadroom name)', sdr.count('hdrheadroomchange') === 1 && hdr.total() === 0, { sdr: sdr.total(), hdr: hdr.total() })

  sdr.fire('hdrheadroomchange')
  check('hdrheadroomchange forwarded', events.join() === 'hdrheadroomchange', events)

  details.moveTo(1)
  check('currentscreenchange forwarded', events.at(-1) === 'currentscreenchange', events)
  check('headroom listener MOVED to the new screen (headroom name)', hdr.count('headroomchange') === 1 && sdr.total() === 0, { sdr: sdr.total(), hdr: hdr.total() })
  const before = events.length
  sdr.fire('hdrheadroomchange')
  check('old screen\'s headroom change no longer triggers', events.length === before, events)
  hdr.fire('headroomchange')
  check('new screen\'s headroomchange triggers', events.at(-1) === 'headroomchange', events)

  details.fire('screenschange')
  check('screenschange forwarded', events.at(-1) === 'screenschange', events)

  const s = readScreen(details)
  check('readScreen: label, primary, internal, dpr, count', s.label === 'External HDR' && s.isPrimary === false && s.isInternal === false && s.dpr === 1 && s.screenCount === 2, s)
  check('readScreen: headroom via `headroom`', s.headroom === 2.3 && s.headroomApi === 'headroom', s)
  check('readHeadroom: `hdrHeadroom` accepted, 0 is a value not "missing"', readHeadroom(sdr).value === 0 && readHeadroom(sdr).api === 'hdrHeadroom', readHeadroom(sdr))
  check('readHeadroom: absent → null, not 0', readHeadroom(fakeScreen({})).value === null)
  // Label padding as reported by Windows on the user's external monitor.
  check('readScreen: trailing-space label trimmed ("H32T13 " → "H32T13")',
    readScreen(fakeDetails([fakeScreen({ label: 'H32T13 ' })])).label === 'H32T13')
  check('readScreen: all-space label → null', readScreen(fakeDetails([fakeScreen({ label: '   ' })])).label === null)
  // Stops → multiple of SDR white; values are the user's measured laptop readings.
  const near = (a, b) => a !== null && Math.abs(a - b) < 0.01
  check('headroomRatio: 0 stops = 1×', headroomRatio(0) === 1)
  check('headroomRatio: 1 stop = 2×', headroomRatio(1) === 2)
  check('headroomRatio: measured 0.9697 / 1.3501 / 1.5478 → 1.96 / 2.55 / 2.92',
    near(headroomRatio(0.9697298407554626), 1.96) && near(headroomRatio(1.350074291229248), 2.55) && near(headroomRatio(1.5478384494781494), 2.92))
  check('headroomRatio: null / NaN → null', headroomRatio(null) === null && headroomRatio(NaN) === null)
  check('readHeadroom: NaN → null', readHeadroom(fakeScreen({ hdrHeadroom: NaN })).value === null)

  r.unsubscribe()
  check('unsubscribe removes details + headroom listeners', details.total() === 0 && sdr.total() === 0 && hdr.total() === 0,
    { d: details.total(), sdr: sdr.total(), hdr: hdr.total() })
}
{
  // A screen with no headroom API binds nothing (no pointless listeners).
  const plain = fakeScreen({ label: 'x' })
  const r = await watchScreenDetails(() => {}, { getScreenDetails: async () => fakeDetails([plain]), permissions: granted })
  check('no headroom API → no headroom listener; readScreen headroom null', r.ok && plain.total() === 0 && readScreen(r.details).headroom === null)
  r.unsubscribe()
}
{
  const states = []
  check('windowManagementPermission: no API → null', (await windowManagementPermission({ permissions: undefined })) === null)
  states.push(await windowManagementPermission({ permissions: prompting }))
  check('windowManagementPermission: reads state', states[0] === 'prompt', states)
}

// ── the monitor: (1) and (2) together ─────────────────────────────────────
{
  const m = fakeMedia()
  const sdr = fakeScreen({ label: 'SDR', devicePixelRatio: 1, hdrHeadroom: 0, onhdrheadroomchange: null })
  const hdr = fakeScreen({ label: 'HDR', devicePixelRatio: 1, hdrHeadroom: 1.8, onhdrheadroomchange: null })
  const details = fakeDetails([sdr, hdr])
  const t = manualTimers()
  const updates = []
  const mon = createDisplayMonitor((u) => updates.push(u), {
    matchMedia: m.matchMedia, getDpr: m.getDpr, timers: t,
    getScreenDetails: async () => details, permissions: prompting,
  })
  const st = await mon.start()
  check('start with permission "prompt" → not-granted, (1) still attached', st === 'not-granted' && m.listeners() > 0, { st, l: m.listeners() })

  m.set('(dynamic-range: high)', true); t.flush()
  check('(1) alone produces an update with screen null', updates.length === 1 && updates[0].display.hdr === true && updates[0].screen === null, updates)

  const id = await mon.identify()
  t.flush()
  check('identify → active, and screen facts reported straight away', id === 'active' && updates.at(-1).screen?.label === 'SDR' && updates.at(-1).sources.includes('identify'), updates.at(-1))
  check('identify again is a no-op', (await mon.identify()) === 'active' && details.count('currentscreenchange') === 1)

  // The drag: the browser fires media changes AND currentscreenchange for one move.
  const n = updates.length
  m.set('(dynamic-range: high)', false)
  details.moveTo(1)
  m.set('(color-gamut: p3)', true)
  m.set('(color-gamut: rec2020)', true)
  t.flush()
  check('one drag (3 media + currentscreenchange) → ONE update', updates.length === n + 1, updates.length - n)
  const u = updates.at(-1)
  check('update reads FRESH state from both triggers', u.display.hdr === false && u.display.p3 === true && u.screen.label === 'HDR' && u.screen.headroom === 1.8, u)

  hdr.hdrHeadroom = 2.4; hdr.fire('hdrheadroomchange'); hdr.hdrHeadroom = 2.6; hdr.fire('hdrheadroomchange')
  check('headroom updates wait the headroom settle time', t.lastDelay() === SETTLE_MS.headroom, t.lastDelay())
  t.flush()
  check('two headroom changes → one update with the latest value', updates.length === n + 2 && updates.at(-1).screen.headroom === 2.6, updates.at(-1))

  mon.stop()
  check('stop removes all listeners of both triggers', m.listeners() === 0 && details.total() === 0 && sdr.total() === 0 && hdr.total() === 0,
    { m: m.listeners(), d: details.total(), sdr: sdr.total(), hdr: hdr.total() })
  const k = updates.length
  m.set('(dynamic-range: high)', true); t.flush()
  check('no updates after stop', updates.length === k)
  mon.stop()
  check('stop is idempotent', true)
}
{
  // Permission already granted: (2) attaches on start with no gesture.
  const m = fakeMedia()
  const details = fakeDetails([fakeScreen({ label: 'Only' })])
  const t = manualTimers()
  const updates = []
  const mon = createDisplayMonitor((u) => updates.push(u), { matchMedia: m.matchMedia, getDpr: m.getDpr, timers: t,
    getScreenDetails: async () => details, permissions: granted })
  const st = await mon.start(); t.flush()
  check('already granted → active on start, no prompt path', st === 'active' && updates.at(-1)?.screen?.label === 'Only', { st, u: updates.at(-1) })
  mon.stop()
}
{
  // Unmount while getScreenDetails is still pending: nothing may stay attached.
  const m = fakeMedia()
  const details = fakeDetails([fakeScreen({ hdrHeadroom: 1, onhdrheadroomchange: null })])
  let resolve
  const mon = createDisplayMonitor(() => {}, { matchMedia: m.matchMedia, getDpr: m.getDpr, timers: manualTimers(),
    getScreenDetails: () => new Promise((r) => { resolve = r }), permissions: granted })
  const p = mon.start()
  await new Promise((r) => setTimeout(r, 0))
  mon.stop()
  resolve(details)
  await p
  check('stop before getScreenDetails settles → listeners detached when it does', details.total() === 0 && details.currentScreen.total() === 0 && m.listeners() === 0,
    { d: details.total(), s: details.currentScreen.total(), m: m.listeners() })
}
{
  // Two monitors on one page (Settings + HDR tab). Permission granted through ONE attaches the
  // other silently and reports its new status through onStatus — no second Identify needed.
  let state = 'prompt'
  const perms = { query: async () => ({ state }) }
  const details = fakeDetails([fakeScreen({ label: 'Shared' })])
  const getScreenDetails = async () => { state = 'granted'; return details }
  const statusesB = []
  const mA = fakeMedia(), mB = fakeMedia()
  const a = createDisplayMonitor(() => {}, { matchMedia: mA.matchMedia, getDpr: mA.getDpr, timers: manualTimers(), getScreenDetails, permissions: perms })
  const b = createDisplayMonitor(() => {}, { matchMedia: mB.matchMedia, getDpr: mB.getDpr, timers: manualTimers(), getScreenDetails, permissions: perms,
    onStatus: (s) => statusesB.push(s) })
  const stA = await a.start(), stB = await b.start()
  check('two monitors start not-granted', stA === 'not-granted' && stB === 'not-granted', { stA, stB })
  check('identify through A → active', (await a.identify()) === 'active')
  for (let i = 0; i < 5 && statusesB.length === 0; i++) await new Promise((r) => setTimeout(r, 0))
  check('B attaches without a prompt and reports active via onStatus', statusesB.at(-1) === 'active', statusesB)
  b.stop()
  // A stopped monitor is out of the page registry: a later grant must not reach it.
  const c = createDisplayMonitor(() => {}, { matchMedia: fakeMedia().matchMedia, getDpr: () => 1, timers: manualTimers(), getScreenDetails, permissions: perms, onStatus: () => { throw new Error('stopped monitor notified') } })
  c.stop()
  a.stop()
  check('stopped monitors leave the registry (no notification, no throw)', true)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
