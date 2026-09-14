// (c) 2026 William Li
import { useEffect, useRef, useState } from 'react'
import { hdrTransformPixels, HDR_POLICY } from '../../lib/hdrProfileTransform.js'
import { makeTestStrip, limitToPeak, rampLuminance, firstReaching } from '../../lib/hagcPreview.js'
import { renderFloatRgba, MAX_LIMIT_STOPS } from '../../lib/hdrPixels.js'
import { createHdrSurface, FALLBACK } from '../../lib/hdrSurface.js'
import { getEnvironment } from '../../lib/environment.js'
import { hdrPathway } from '../../lib/capabilities.js'
import { HDR_TRANSFERS } from '../../lib/hdrProfile.js'
import styles from './HagcPreview.module.css'

/**
 * The gain curve made visible: one test strip (lib/hagcPreview.js) through IccProfLib's HDR
 * CMM path twice —
 *   top     at the BASELINE headroom, where the tag applies no gain: the content as authored;
 *   bottom  at the slider's headroom, where the gain curve tone-maps it.
 * Both are then capped at the slider headroom's peak, which is what a display with that much
 * headroom does. The comparison is the point: the top strip clips to flat where the bottom
 * one rolls off.
 *
 * Rendered through HdrSurface (float16 canvas → WebGPU → SDR), the same outputs as the HDR
 * tab, so on an HDR display values above SDR white are shown brighter than it.
 */
export default function HagcPreview({ t, bytes, target, baseline }) {
  const [env, setEnv] = useState(null)
  const [strip, setStrip] = useState(null)       // { rgb, w, h, transfer }
  const [authored, setAuthored] = useState(null) // linear sRGB, 1.0 = HDR reference white
  const [mapped, setMapped] = useState(null)     // { rgb, h }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => { getEnvironment().then(setEnv).catch(() => setEnv({})) }, [])

  // Per profile: learn the transfer from the CMM itself (one pixel), build the strip in that
  // encoding, and render the as-authored strip once.
  useEffect(() => {
    let dead = false
    setStrip(null); setAuthored(null); setMapped(null); setError(null)
    ;(async () => {
      try {
        const base = 2 ** Math.max(0, baseline)
        const probe = await hdrTransformPixels({ profileBytes: bytes, rgb: new Float32Array(3), nPixels: 1, targetHeadroom: base, policy: HDR_POLICY.hagc })
        if (dead) return
        const transfer = HDR_TRANSFERS[probe.info?.transfer]
        if (!probe.info?.hdrPath || !transfer) throw new Error(t('hagc_preview_not_hdr') || 'the colour engine did not take the HDR path for this profile')
        const s = makeTestStrip(transfer)
        const a = await hdrTransformPixels({ profileBytes: bytes, rgb: s.rgb, nPixels: s.w * s.h, targetHeadroom: base, policy: HDR_POLICY.hagc })
        if (dead) return
        setStrip({ ...s, transfer })
        setAuthored(a.rgb)
      } catch (e) {
        if (!dead) setError(e.message || String(e))
      }
    })()
    return () => { dead = true }
  }, [bytes, baseline, t])

  // Per slider value (already debounced by the parent): the tone-mapped strip.
  useEffect(() => {
    if (!strip || target == null) return
    const my = ++seq.current
    setBusy(true)
    hdrTransformPixels({ profileBytes: bytes, rgb: strip.rgb, nPixels: strip.w * strip.h, targetHeadroom: 2 ** target, policy: HDR_POLICY.hagc })
      .then((r) => { if (my === seq.current) setMapped({ rgb: r.rgb, h: target }) })
      .catch((e) => { if (my === seq.current) setError(e.message || String(e)) })
      .finally(() => { if (my === seq.current) setBusy(false) })
  }, [bytes, strip, target])

  if (error) return <p className={styles.note}>{(t('hagc_preview_unavailable') || 'Preview unavailable: {why}').replace('{why}', error)}</p>
  if (!strip || !authored || !env) return <p className={styles.note}>{t('hdr_applying') || 'Applying the profile…'}</p>

  const peak = 2 ** target
  // Tick positions come from the as-authored strip: at the baseline the curve is the identity,
  // so its grey luminance IS the input's, relative to HDR reference white.
  const Y = rampLuminance(authored, strip.w)
  const refX = firstReaching(Y, 1)
  const peakX = firstReaching(Y, peak)
  const ticks = [
    refX >= 0 && { x: refX, label: t('hagc_preview_ref') || 'reference white', kind: 'ref' },
    peakX >= 0 && { x: peakX, label: t('hagc_preview_peak') || 'display peak', kind: 'peak' },
  ].filter(Boolean)

  return (
    <div className={styles.wrap}>
      <StripCanvas env={env} rgb={limitToPeak(authored, peak)} w={strip.w} h={strip.h} ticks={ticks} dataKind="authored"
                   label={(t('hagc_preview_authored') || 'As authored (baseline {h} stops, no gain)').replace('{h}', String(+baseline.toFixed(2)))} t={t} />
      {mapped && (
        <StripCanvas env={env} rgb={limitToPeak(mapped.rgb, 2 ** mapped.h)} w={strip.w} h={strip.h} ticks={ticks} dataKind="mapped"
                     label={(t('hagc_preview_mapped') || 'Tone-mapped for {h} stops').replace('{h}', String(+mapped.h.toFixed(2)))} t={t}
                     busy={busy} />
      )}
      <p className={styles.note}>
        {(t('hagc_preview_note') || 'The same test pixels ({transfer} signal rising left to right: grey, then R, G, B, Y, C, M) through IccProfLib’s HDR transform. Both strips are capped at {r}× HDR reference white, as a display with {h} stops of headroom would show them: where the top strip clips flat, the gain curve rolls highlights off.')
          .replace('{transfer}', strip.transfer).replace('{r}', String(+peak.toFixed(2))).replace('{h}', String(+target.toFixed(2)))}
      </p>
    </div>
  )
}

// One strip on its own HDR surface, with the backend fallback chain the HDR tab uses.
function StripCanvas({ t, env, rgb, w, h, ticks, label, busy, dataKind }) {
  const canvasRef = useRef(null)
  const [kind, setKind] = useState(() => hdrPathway(env) || 'sdr')
  const [surface, setSurface] = useState(null)

  useEffect(() => {
    if (!kind || !canvasRef.current) return
    let dead = false
    let made = null
    createHdrSurface(canvasRef.current, kind)
      .then((s) => { if (dead) { s.dispose(); return } made = s; setSurface(s) })
      .catch(() => {
        if (dead) return
        let next = FALLBACK[kind]
        if (next === 'webgpu' && !env.pathway?.webgpu) next = 'sdr'
        setSurface(null)
        setKind(next || null)
      })
    return () => { dead = true; made?.dispose() }
  }, [kind, env])

  useEffect(() => {
    if (!surface) return
    const id = requestAnimationFrame(() => {
      // No soft ceiling on an HDR surface — the cap above is the display simulation; an SDR
      // surface can only take the tone-mapped rendering.
      const { rgba } = renderFloatRgba(rgb, w, h, { exposureStops: 0, limitStops: surface.hdr ? MAX_LIMIT_STOPS : 0, matrix: null })
      surface.draw(rgba, w, h)
    })
    return () => cancelAnimationFrame(id)
  }, [surface, rgb, w, h])

  return (
    <figure className={styles.strip}>
      <figcaption className={styles.label}>
        {label}{busy && <span className={styles.busy}> · {t('hdr_applying') || 'Applying the profile…'}</span>}
      </figcaption>
      <div className={styles.frame}>
        <canvas key={kind} ref={canvasRef} className={styles.canvas} data-hagc-strip={dataKind} data-surface={surface?.kind || ''} />
        {ticks.map((k) => (
          <span key={k.kind} className={`${styles.tick} ${k.kind === 'peak' ? styles.tickPeak : ''}`}
                style={{ left: `${(k.x / (w - 1)) * 100}%` }} data-hagc-tick={k.kind}>
            <span className={styles.tickLabel}>{k.label}</span>
          </span>
        ))}
      </div>
      {surface && !surface.hdr && dataKind === 'authored' && (
        <p className={styles.note}>{t('hdr_sdr_output') || 'This output cannot carry brighter-than-white values, so the tone-mapped SDR rendering is shown.'}</p>
      )}
    </figure>
  )
}
