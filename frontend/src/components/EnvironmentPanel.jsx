// (c) 2026 William Li
import { useEffect, useState } from 'react'
import { detectEnvironment } from '../lib/environment.js'
import { capabilityMatrix, hdrPathway, environmentSummary, FORMATS } from '../lib/capabilities.js'
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
  const mark = (c) => (c.ok ? '✓' : '✕')
  const cls = (c) => (c.ok ? styles.yes : styles.no)

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>{environmentSummary(env)}</div>

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
