// (c) 2026 William Li
import { useEffect, useMemo, useRef, useState } from 'react'
import { hagcEvaluate } from '../../lib/vizPlot.js'
import { useT } from '../../i18n.jsx'
import PlotlyGraph from './PlotlyGraph.jsx'
import styles from './HagcEvaluated.module.css'

const MAX_HEADROOM = 6   // the HAGC encoding caps headroom at 6 stops

/**
 * The headroomAdaptiveGainCurveTag as a CMM APPLIES it, at a display headroom the user
 * chooses. Sits beside the "Gain curve" graph, which shows the AUTHORED control points only.
 *
 * Every number here comes from IccProfLib's CIccHagcEvaluator via
 * IccVizModel::EvaluateHagc — PCHIP slopes, derived reference-white tone maps, headroom
 * blending — so this view cannot disagree with the transform. H_target is never in the
 * profile (clause 8.10.2 NOTE 5): the slider IS the consumer's choice, and nothing here
 * takes it from the display silently.
 */
export default function HagcEvaluated({ bytes }) {
  const t = useT()
  const [target, setTarget] = useState(null)       // slider value, stops
  const [asked, setAsked] = useState(null)         // debounced value sent to WASM
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const seq = useRef(0)

  // First read at headroom 0 only to learn the baseline, which is where the slider starts:
  // at the baseline headroom the tag says "show the image as authored".
  useEffect(() => {
    let dead = false
    setData(null); setError(null); setTarget(null); setAsked(null)
    hagcEvaluate(bytes, 0)
      .then((r) => {
        if (dead) return
        const b = Number.isFinite(r.baselineHeadroom) ? Math.min(MAX_HEADROOM, Math.max(0, r.baselineHeadroom)) : 0
        setTarget(b); setAsked(b)
      })
      .catch((e) => { if (!dead) setError(e.message || String(e)) })
    return () => { dead = true }
  }, [bytes])

  // Debounce slider drags; the evaluation is cheap but re-plotting twice a frame is not.
  useEffect(() => {
    if (target == null) return
    const id = setTimeout(() => setAsked(target), 60)
    return () => clearTimeout(id)
  }, [target])

  useEffect(() => {
    if (asked == null) return
    const my = ++seq.current
    hagcEvaluate(bytes, asked)
      .then((r) => { if (my === seq.current) { setData(r); setError(null) } })
      .catch((e) => { if (my === seq.current) setError(e.message || String(e)) })
  }, [bytes, asked])

  const graphs = useMemo(() => (data?.supported ? buildGraphs(data, t) : null), [data, t])

  if (error) return <div className={styles.error}>{error}</div>
  if (!data || target == null) return <div className={styles.loading}>{t('viz_loading') || 'Loading…'}</div>

  if (!data.supported) {
    return (
      <p className={styles.note}>
        {(t('hagc_unsupported') || 'IccProfLib declines to apply this gain curve: {why}. A CMM falls back to the next tone-mapping descriptor (clause 8.10.3).').replace('{why}', data.unsupportedReason)}
      </p>
    )
  }

  // Outside the tag's headroom range the library uses the endpoint curve unchanged. It
  // records the target as given, so detect this from the curve headrooms, not by comparing
  // requested with recorded.
  const headrooms = data.curves.map((c) => c.headroom)
  const clamped = headrooms.length > 0 &&
    (data.targetHeadroom < Math.min(...headrooms) - 1e-4 || data.targetHeadroom > Math.max(...headrooms) + 1e-4)
  return (
    <div className={styles.wrap}>
      <label className={styles.slider}>
        <span>{t('hagc_target') || 'Display headroom'}</span>
        <input type="range" min={0} max={MAX_HEADROOM} step={0.05} value={target}
               onChange={(e) => setTarget(Number(e.target.value))} aria-label={t('hagc_target') || 'Display headroom'} />
        <span className={styles.value}>
          {(t('hagc_target_value') || '{n} stops (≈{r}× reference white)')
            .replace('{n}', target.toFixed(2)).replace('{r}', (2 ** target).toFixed(2))}
        </span>
        <button type="button" className={styles.btn} onClick={() => setTarget(Math.min(MAX_HEADROOM, Math.max(0, data.baselineHeadroom)))}>
          {t('hagc_to_baseline') || 'Baseline'}
        </button>
      </label>
      <p className={styles.note}>
        {(t('hagc_curves_at') || 'Curves in the tag, by headroom: {list} stops. Baseline {b} stops, HDR reference white {w} cd/m².')
          .replace('{list}', headrooms.map((h) => +h.toFixed(3)).join(', '))
          .replace('{b}', String(+data.baselineHeadroom.toFixed(3)))
          .replace('{w}', String(+data.referenceWhite.toFixed(1)))}
      </p>
      {clamped && <p className={styles.note}>{t('hagc_clamped') || 'This headroom is outside the range of curves in the tag, so the nearest curve is used unchanged — the library does not extrapolate beyond them.'}</p>}
      {data.derivedSlopes && <p className={styles.note}>{t('hagc_derived_slopes') || 'Some slopes are derived (PCHIP), not stored in the tag. That derivation reconstructs a SMPTE clause, so treat those curves’ shape as provisional.'}</p>}
      {data.derivedRefWhiteToneMap && <p className={styles.note}>{t('hagc_derived_refwhite') || 'The tag asks for reference-white tone mapping, so its curves are constructed by the library rather than read from the file (a committee-draft construction).'}</p>}
      {data.clampsToTargetVolume && <p className={styles.note}>{t('hagc_no_alternates') || 'No alternate images: the tag asks for no tone mapping, only a clamp to the display’s colour volume.'}</p>}
      {!data.sharedMixing && <p className={styles.note}>{t('hagc_no_single_gain') || 'The two curves blended at this headroom mix colour channels differently, so there is no single gain curve to draw. The tone curve below is still exact.'}</p>}

      {/* PlotlyGraph draws no title, and the two plots share an x range, so each gets a
          caption — otherwise a reader cannot tell the gain plot from the tone curve. */}
      {graphs?.gain && <>
        <div className={styles.caption}>{graphs.gain.title}</div>
        <PlotlyGraph graph={graphs.gain} legend storageKey="profiletool.hagcGainHeight" defaultH={280} />
      </>}
      {graphs?.tone && <>
        <div className={styles.caption}>{graphs.tone.title}</div>
        <PlotlyGraph graph={graphs.tone} legend storageKey="profiletool.hagcToneHeight" defaultH={280} />
      </>}
    </div>
  )
}

// Plot JSON in the shape the WASM graphs use (plot-wrapper.cpp graphToJson), so the same
// renderer draws both. Null samples stay null: Plotly leaves a gap, which is the honest
// picture of "undefined here".
function flat(xs, ys) {
  const pts = []
  for (let i = 0; i < xs.length; i++) pts.push(xs[i], ys[i] ?? null)
  return pts
}
function range(values) {
  let lo = Infinity, hi = -Infinity
  for (const v of values) if (v != null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  if (!Number.isFinite(lo)) return [0, 1]
  if (hi <= lo) return [lo - 0.5, hi + 0.5]
  return [lo, hi]
}
const series = (id, name, role, points) => ({ id, name, role, shape: 'polyline', colorHint: '', auxKind: '', useY2: false, points, labels: [] })

function buildGraphs(d, t) {
  const x = d.x
  const xmax = x[x.length - 1] ?? 1
  const hTxt = (h) => String(+h.toFixed(2))

  // Gain exponent: each authored/derived curve as a hint, the blend at the target as primary.
  const gainSeries = d.curves.map((c, i) => series(`c${i}`,
    c.identity ? (t('hagc_curve_identity') || 'Curve at {h} stops (no gain)').replace('{h}', hTxt(c.headroom))
      : (t('hagc_curve') || 'Curve at {h} stops').replace('{h}', hTxt(c.headroom)),
    'hint', flat(x, c.gain)))
  if (d.blendGain.length) {
    gainSeries.push(series('blend', (t('hagc_blend') || 'Applied at {h} stops').replace('{h}', hTxt(d.targetHeadroom)), 'primary', flat(x, d.blendGain)))
  }
  const [gy0, gy1] = range([0, ...d.blendGain, ...d.curves.flatMap((c) => c.gain)])
  const gain = {
    title: t('hagc_gain_title') || 'Gain applied at this headroom',
    description: '',
    xAxis: { label: t('hagc_x') || 'Mixed input (linear, 1.0 = HDR reference white)', min: 0, max: xmax, equalAspect: false },
    yAxis: { label: t('hagc_gain_y') || 'Gain (log2 stops)', min: gy0, max: gy1, equalAspect: false },
    hasY2: false,
    series: gainSeries,
  }

  // Neutral tone curve: what a grey input becomes, against identity and the display peak.
  const peak = 2 ** d.targetHeadroom
  const [ty0, ty1] = range([0, xmax, peak, ...d.neutralOut])
  const tone = {
    title: t('hagc_tone_title') || 'Grey tone curve at this headroom',
    description: '',
    xAxis: { label: t('hagc_tone_x') || 'Input (× HDR reference white)', min: 0, max: xmax, equalAspect: false },
    yAxis: { label: t('hagc_tone_y') || 'Output (× HDR reference white)', min: Math.min(0, ty0), max: ty1, equalAspect: false },
    hasY2: false,
    series: [
      series('identity', t('hagc_identity') || 'No change', 'hint', [0, 0, xmax, xmax]),
      series('peak', (t('hagc_peak') || 'Display peak at {h} stops').replace('{h}', hTxt(d.targetHeadroom)), 'hint', [0, peak, xmax, peak]),
      series('tone', (t('hagc_tone') || 'Output at {h} stops').replace('{h}', hTxt(d.targetHeadroom)), 'primary', flat(x, d.neutralOut)),
    ],
  }
  return { gain, tone }
}
