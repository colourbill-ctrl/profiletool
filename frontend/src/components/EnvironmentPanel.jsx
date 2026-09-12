// (c) 2026 William Li
import { useEffect, useState } from 'react'
import { detectEnvironment } from '../lib/environment.js'
import { capabilityMatrix, hdrPathway, environmentSummary, FORMATS, browserFlags, flagsNeedAttention } from '../lib/capabilities.js'
import { useT } from '../i18n.jsx'
import styles from './EnvironmentPanel.module.css'

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
 */
export default function EnvironmentPanel({ compact = false }) {
  const t = useT()
  const [env, setEnv] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    detectEnvironment()
      .then((e) => { if (!cancelled) setEnv(e) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

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
        <Fact label={t('env_hdr_path') || 'HDR canvas path'}
              value={pathway || (t('env_none') || 'none')} />
      </div>

      {/* Headroom deliberately absent: screen.colorInfo is unimplemented, so a browser
          cannot query how much HDR headroom a display actually has. Showing a guess here
          would be worse than showing nothing. */}
      <p className={styles.note}>
        {t('env_headroom_note') ||
          'Browsers cannot report how much HDR headroom a display has, only whether an HDR path exists.'}
      </p>

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
