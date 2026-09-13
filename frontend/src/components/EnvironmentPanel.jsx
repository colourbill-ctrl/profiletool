// (c) 2026 William Li
import { useEffect, useRef, useState } from 'react'
import { detectEnvironment } from '../lib/environment.js'
import { createDisplayMonitor, headroomRatio } from '../lib/displayWatcher.js'
import { capabilityMatrix, hdrPathway, environmentSummary, FORMATS, browserFlags, flagsNeedAttention } from '../lib/capabilities.js'
import { useT } from '../i18n.jsx'
import styles from './EnvironmentPanel.module.css'

// Event log length. Enough to see one drag between monitors (a handful of lines) and a
// brightness change, without growing without bound while the panel stays open.
const LOG_MAX = 20

/**
 * Shows what THIS browser, platform and display can do — so a user can see why a format
 * is unavailable instead of meeting a dead end.
 *
 * It renders the same `capabilities.js` table the gating logic reads. That is deliberate
 * and is the binding constraint of DL-HDRENV1: if this panel and the gating came from
 * separate sources they would eventually disagree, and the user would be told something
 * the app does not do.
 *
 * The three columns are three different questions (see capabilities.js): inspect the
 * profile, display the pixels, render as HDR. Keeping them separate is the whole point —
 * "cannot display HEIC" and "cannot read HEIC" are very different statements, and only
 * the first is true in Chrome.
 *
 * DISPLAY FACTS ARE LIVE. The environment is probed once, but the display block (HDR,
 * gamut, pixel ratio, headroom) is kept current by lib/displayWatcher.js, because dragging
 * the window to another monitor changes it. Trigger (1), media-query listeners, is always
 * on. Trigger (2), getScreenDetails(), needs a permission and so waits for the user to
 * press "Identify displays" — unless the permission was already granted.
 */
export default function EnvironmentPanel({ compact = false }) {
  const t = useT()
  const [env, setEnv] = useState(null)
  const [error, setError] = useState(null)
  const [screen, setScreen] = useState(null)
  // checking | not-granted | asking | active | denied | unsupported | error
  const [screenStatus, setScreenStatus] = useState('checking')
  const [log, setLog] = useState([])
  const monitorRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const monitor = createDisplayMonitor(({ display, screen: s, sources }) => {
      if (cancelled) return
      // Merge ONLY the display block. Everything else in env is a browser capability that
      // a monitor change cannot alter, so it is not re-probed. An update that lands before
      // detectEnvironment() resolves is dropped — that first probe reads fresh state anyway.
      setEnv((e) => (e ? { ...e, display: { ...e.display, ...display } } : e))
      setScreen(s)
      setLog((l) => [{ at: new Date(), sources, display, screen: s }, ...l].slice(0, LOG_MAX))
    })
    monitorRef.current = monitor

    detectEnvironment()
      .then((e) => { if (!cancelled) setEnv(e) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    // Attaches trigger (2) silently only if permission is already granted; never prompts.
    monitor.start().then((s) => { if (!cancelled) setScreenStatus(s) })

    return () => { cancelled = true; monitor.stop(); monitorRef.current = null }
  }, [])

  // Must run inside the click handler: getScreenDetails() may show a permission prompt, and
  // the browser only allows that from a user gesture.
  const onIdentify = async () => {
    if (!monitorRef.current) return
    setScreenStatus('asking')
    const s = await monitorRef.current.identify()
    if (monitorRef.current) setScreenStatus(s)
  }

  if (error) return <div className={styles.error}>{t('env_failed') || 'Could not detect environment.'} {error}</div>
  if (!env) return <div className={styles.loading}>{t('env_detecting') || 'Detecting…'}</div>

  const matrix = capabilityMatrix(env)
  const pathway = hdrPathway(env)
  const flags = browserFlags(env)
  const attention = flagsNeedAttention(env)
  const mark = (c) => (c.ok ? '✓' : '✕')
  const cls = (c) => (c.ok ? styles.yes : styles.no)

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>{environmentSummary(env)}</div>

      {/* Browser flags, near the top because a missing flag explains everything below it
          (an empty HDR column, "none" for the canvas path). Chromium only — Safari and
          Firefox have no equivalent switch for these features. Highlighted only when a
          flag is KNOWN to be off; a flag that is on gets a quiet confirmation instead. */}
      {flags.length > 0 && (
        <div className={attention ? styles.flagsAttention : styles.flagsQuiet}
             role={attention ? 'status' : undefined}>
          <div className={styles.flagsTitle}>{t('env_flags_title') || 'Browser flags'}</div>
          {flags.map((f) => <FlagRow key={f.id} flag={f} t={t} />)}
        </div>
      )}

      <div className={styles.facts}>
        <Fact label={t('env_hdr_display') || 'HDR display'} value={tri(env.display.hdr, t)} />
        <Fact label={t('env_wide_gamut') || 'Wide gamut'}
              value={env.display.rec2020 ? 'Rec. 2020' : env.display.p3 ? 'Display P3' : (t('env_srgb') || 'sRGB')} />
        <Fact label={t('env_dpr') || 'Pixel ratio'}
              value={env.display.dpr != null ? `${+env.display.dpr.toFixed(3)}×` : tri(null, t)} />
        <Fact label={t('env_hdr_path') || 'HDR canvas path'}
              value={pathway || (t('env_none') || 'none')} />
        {screen && (
          <Fact label={t('env_monitor') || 'Current monitor'} value={monitorText(screen, t)} />
        )}
        {screen && (
          <Fact label={t('env_headroom') || 'HDR headroom'}
                value={screen.headroom != null ? headroomText(screen.headroom, t)
                  : (t('env_headroom_hidden') || 'not exposed by this browser')} />
        )}
      </div>

      {/* Headroom unit, from Chromium's source: hdrHeadroom = log2(max(peak / SDR white, 1)),
          i.e. stops. It is shown in stops AND as a multiple of SDR white, never in nits —
          the page gets only the ratio, not either luminance. The Windows caveat is measured:
          ScreenWin re-reads the SDR white level only on display-change / app-activation /
          work-area / colour-profile / DXGI events, so brightness keys leave it stale.
          Without trigger (2) there is no value at all, and the note says so rather than
          implying a number. */}
      <p className={styles.note}>
        {screen?.headroom != null
          ? (t('env_headroom_raw') || 'Chromium reports this in stops: log₂ of the display’s peak brightness ÷ its SDR white level. On Windows it refreshes only when Chrome re-reads the display — the window moves to another screen, or Chrome becomes the active app again — not when brightness changes.')
          : (t('env_headroom_note') || 'This browser has not reported the display’s HDR headroom, only whether an HDR path exists.')}
      </p>

      <div className={styles.identify}>
        <p className={styles.note}>
          {t('env_live_note') || 'HDR, gamut and pixel ratio refresh when the window moves to a screen where they differ.'}
        </p>
        <IdentifyControl status={screenStatus} onIdentify={onIdentify} t={t} />
      </div>

      {!compact && (
        <details className={styles.log}>
          <summary>{t('env_log') || 'Display events'} ({log.length})</summary>
          {log.length === 0
            ? <p className={styles.note}>{t('env_log_empty') || 'No events yet. Drag the window to another monitor.'}</p>
            : (
              <ol className={styles.logList}>
                {log.map((e, i) => (
                  <li key={log.length - i}>
                    <span className={styles.logTime}>{stamp(e.at)}</span>
                    <span className={styles.logSrc}>{e.sources.join(' + ')}</span>
                    <span className={styles.logState}>{logState(e)}</span>
                  </li>
                ))}
              </ol>
            )}
        </details>
      )}

      {!compact && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('env_format') || 'Format'}</th>
              <th title={t('env_inspect_help') || 'Read the embedded ICC profile — needs no codec'}>{t('env_inspect') || 'Inspect'}</th>
              <th title={t('env_display_help') || 'Show the pixels'}>{t('env_display') || 'Display'}</th>
              <th title={t('env_hdr_help') || 'Render brighter-than-white'}>{t('env_hdr') || 'HDR'}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(FORMATS).map(([key, spec]) => {
              const c = matrix[key]
              // The row's tooltip carries the REASON for the first refusal, so a user can
              // see why rather than only that. A bare ✕ is what DL-HDRENV1 forbids.
              const reason = !c.display.ok ? c.display.why : !c.hdr.ok ? c.hdr.why : null
              return (
                <tr key={key} title={reason || undefined}>
                  <td className={styles.fmt}>
                    {spec.label}
                    {spec.decoder === 'ours' && <span className={styles.ours} title={t('env_ours_help') || 'Decoded by profiletool itself, so browser-independent'}>·</span>}
                  </td>
                  <td className={cls(c.inspect)}>{mark(c.inspect)}</td>
                  <td className={cls(c.display)}>{mark(c.display)}</td>
                  <td className={cls(c.hdr)}>{mark(c.hdr)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {!compact && (
        <ul className={styles.reasons}>
          {Object.entries(matrix)
            .filter(([, c]) => !c.display.ok)
            .map(([key, c]) => (
              <li key={key}><strong>{FORMATS[key].label}</strong> — {c.display.why}</li>
            ))}
        </ul>
      )}
    </div>
  )
}

// The button only exists while pressing it can do something. Once active there is nothing to
// ask; once denied the browser will not prompt again (the user must change site settings);
// unsupported browsers get the reason instead of a control that fails.
function IdentifyControl({ status, onIdentify, t }) {
  if (status === 'active') return <p className={styles.identifyState}>{t('env_identify_active') || 'Tracking which monitor this window is on.'}</p>
  if (status === 'denied') return <p className={styles.identifyState}>{t('env_identify_denied') || 'Permission to identify displays was refused. It can be changed in this site’s settings.'}</p>
  if (status === 'unsupported') return <p className={styles.identifyState}>{t('env_identify_unsupported') || 'This browser cannot identify displays; only the automatic refresh above applies.'}</p>
  return (
    <>
      <button type="button" className={styles.identifyBtn} onClick={onIdentify}
              disabled={status === 'checking' || status === 'asking'}>
        {t('env_identify') || 'Identify displays'}
      </button>
      {status === 'error' && <p className={styles.identifyState}>{t('env_identify_error') || 'Could not identify displays.'}</p>}
      <p className={styles.note}>
        {t('env_identify_help') || 'Asks permission to see which monitor this window is on, so the panel also refreshes when two screens look alike, and shows HDR headroom where the browser exposes it.'}
      </p>
    </>
  )
}

// "1.35 stops (≈2.55× SDR white)". Two decimals: the underlying value is a float32 log,
// and more digits would imply a precision the OS luminance figures do not have.
function headroomText(stops, t) {
  const ratio = headroomRatio(stops)
  return (t('env_headroom_value') || '{stops} stops (≈{ratio}× SDR white)')
    .replace('{stops}', String(+stops.toFixed(2)))
    .replace('{ratio}', String(+ratio.toFixed(2)))
}

function monitorText(s, t) {
  const bits = [s.label || (t('env_monitor_unnamed') || 'unnamed')]
  if (s.isPrimary) bits.push(t('env_monitor_primary') || 'primary')
  if (s.isInternal) bits.push(t('env_monitor_internal') || 'built-in')
  if (s.screenCount != null) bits.push(`1/${s.screenCount}`)
  return bits.join(' · ')
}

// Diagnostic line, deliberately untranslated and terse like Raw Output: it is what a user
// pastes into a bug report after dragging between monitors.
function logState({ display: d, screen: s }) {
  const b = (v) => (v === true ? '1' : v === false ? '0' : '?')
  const gamut = d.rec2020 ? 'rec2020' : d.p3 ? 'p3' : d.p3 === null ? '?' : 'srgb'
  let out = `hdr=${b(d.hdr)} gamut=${gamut} dpr=${d.dpr ?? '?'}`
  if (s) out += ` screen="${s.label || ''}" headroom=${s.headroom ?? '—'}`
  return out
}

function stamp(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function FlagRow({ flag, t }) {
  const [copy, setCopy] = useState('idle')   // idle | copied | failed
  const state = flag.enabled === true ? (t('env_flag_on') || 'on')
    : flag.enabled === false ? (t('env_flag_off') || 'not enabled')
    : (t('env_flag_unknown') || 'cannot be detected here')
  const stateCls = flag.enabled === true ? styles.yes : flag.enabled === false ? styles.no : styles.unknown

  // The clipboard API can be refused (insecure context, permissions). Say so instead of
  // pretending — the address stays visible and selectable either way.
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(flag.url); setCopy('copied') }
    catch { setCopy('failed') }
  }

  return (
    <div className={styles.flag}>
      <div className={styles.flagHead}>
        <span className={styles.flagName}>{flag.label}</span>
        <span className={stateCls}>{state}</span>
      </div>
      {flag.enabled !== true && (
        <>
          <p className={styles.flagWhy}>
            {flag.severity === 'required'
              ? (t('env_flag_required') || 'Needed for HDR rendering in this browser: it has no WebGPU, so the HDR canvas is the only route. Profile inspection works without it.')
              : (t('env_flag_recommended') || 'Optional: HDR can render through WebGPU, but this adds the HDR canvas route and lets profiletool read the screen’s real HDR headroom.')}
          </p>
          <div className={styles.flagUrlRow}>
            <code className={styles.flagUrl}>{flag.url}</code>
            <button type="button" className={styles.copyBtn} onClick={onCopy}>
              {copy === 'copied' ? (t('env_copied') || 'Copied') : (t('env_copy') || 'Copy')}
            </button>
          </div>
          {copy === 'failed' && <p className={styles.note}>{t('env_copy_failed') || 'Copy failed — select the address and copy it.'}</p>}
          {/* Web pages cannot open chrome:// pages, so this is instructions, not a link. */}
          <p className={styles.note}>
            {t('env_flags_howto') || 'Web pages cannot open flag pages. Paste this into the address bar, set it to Enabled, then relaunch the browser.'}
          </p>
        </>
      )}
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  )
}

// A probe can come back null — "could not be asked" — which is not the same as "no" and
// must not be shown as one.
function tri(v, t) {
  if (v === true) return t('env_yes') || 'yes'
  if (v === false) return t('env_no') || 'no'
  return t('env_unknown') || 'not reported'
}
