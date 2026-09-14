// (c) 2026 William Li
import { useEffect, useMemo, useRef, useState } from 'react'
import { hagcEvaluate } from '../../lib/vizPlot.js'
import { useT } from '../../i18n.jsx'
import PlotlyGraph from './PlotlyGraph.jsx'
import HagcPreview from './HagcPreview.jsx'
import HagcHeatmap from './HagcHeatmap.jsx'
import styles from './HagcEvaluated.module.css'

const MAX_HEADROOM = 6   // the HAGC encoding caps headroom at 6 stops
// Heatmap / curve-family sweep: rows every 1/8 stop, and a denser input grid than the
// single-headroom plots so the low end of the log axis is not a handful of samples.
const SWEEP_ROWS = 48
const SWEEP_SAMPLES = 257

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

  // The same evaluator at every headroom row and at each curve the tag stores, for the heatmap
  // and the curve family. Once per profile; the slider only moves overlays on top of it.
  const [sweep, setSweep] = useState(null)
  useEffect(() => {
    let dead = false
    setSweep(null)
    ;(async () => {
      try {
        const first = await hagcEvaluate(bytes, 0, SWEEP_SAMPLES)
        if (dead || !first.supported) return
        const headrooms = Array.from({ length: SWEEP_ROWS + 1 }, (_, k) => (k * MAX_HEADROOM) / SWEEP_ROWS)
        const rows = []
        for (const h of headrooms) {
          const r = h === 0 ? first : await hagcEvaluate(bytes, h, SWEEP_SAMPLES)   // eslint-disable-line no-await-in-loop
          if (dead) return
          rows.push(r.neutralOut)
        }
        const curves = []
        for (const cv of first.curves) {
          const r = await hagcEvaluate(bytes, cv.headroom, SWEEP_SAMPLES)   // eslint-disable-line no-await-in-loop
          if (dead) return
          curves.push({ h: cv.headroom, identity: cv.identity, out: r.neutralOut })
        }
        setSweep({ x: first.x, headrooms, rows, curves, baseline: first.baselineHeadroom })
      } catch { /* the single-headroom evaluation above reports any failure */ }
    })()
    return () => { dead = true }
  }, [bytes])

  const graphs = useMemo(() => (data?.supported ? buildGraphs(data, t) : null), [data, t])
  const family = useMemo(() => (sweep && data?.supported ? buildFamily(sweep, data, t) : null), [sweep, data, t])

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

      <div className={styles.caption}>{t('hagc_preview_title') || 'Preview through the colour engine'}</div>
      <HagcPreview t={t} bytes={bytes} target={asked} baseline={data.baselineHeadroom} />

      {sweep && <>
        <div className={styles.caption}>{t('hagc_heat_title') || 'Gain across every headroom'}</div>
        <p className={styles.note}>{t('hagc_heat_note') || 'Gain applied to a grey input at each display headroom: blue compresses, red expands, white leaves it unchanged. Dotted lines mark the curves in the tag, the solid line the baseline, the amber line the slider; the dashed diagonal is where the input reaches the display peak. Click to move the slider.'}</p>
        <HagcHeatmap t={t} sweep={sweep} target={asked} onPick={(h) => setTarget(Math.round(h * 20) / 20)} />
      </>}

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
      {family && <>
        <div className={styles.caption}>{family.title}</div>
        <p className={styles.note}>{t('hagc_family_note') || 'The grey tone curve at each headroom the tag stores, coloured from low (blue) to high (red), with the slider’s curve in amber. Both axes are in stops, so the diagonal is no change.'}</p>
        <PlotlyGraph graph={family} legend storageKey="profiletool.hagcFamilyHeight" defaultH={320} />
      </>}
    </div>
  )
}

// Headroom → colour, blue (0) through violet to red (6), for the curve family.
function headroomColor(h) {
  const u = Math.min(1, Math.max(0, h / MAX_HEADROOM))
  const a = [0x33, 0x61, 0xcc], b = [0xd2, 0x3b, 0x3b]
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u).toString(16).padStart(2, '0'))
  return `#${c.join('')}`
}

// Grey tone curves on log axes (stops in, stops out): on linear axes a 32× highlight swamps
// everything below reference white. Non-positive samples are gaps, not zeros.
function buildFamily(sweep, d, t) {
  const hTxt = (h) => String(+h.toFixed(2))
  const toStops = (xs, ys) => {
    const pts = []
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] > 0) pts.push(Math.log2(xs[i]), ys[i] > 0 ? Math.log2(ys[i]) : null)
    }
    return pts
  }
  const x = sweep.x.filter((v) => v > 0)
  const x0 = Math.log2(x[0]), x1 = Math.log2(x[x.length - 1])
  let y0 = x0, y1 = x1
  const all = [...sweep.curves.map((c) => c.out), d.neutralOut]
  for (const out of all) for (const v of out) if (v > 0) { const s = Math.log2(v); y0 = Math.min(y0, s); y1 = Math.max(y1, s) }

  const seriesList = [
    { id: 'identity', name: t('hagc_identity') || 'No change', role: 'hint', shape: 'polyline', points: [x0, x0, x1, x1], color: '#9aa1ad', dash: 'dash', labels: [] },
    ...sweep.curves.map((c, i) => ({
      id: `fam${i}`, role: 'hint', shape: 'polyline', labels: [], color: headroomColor(c.h),
      name: Math.abs(c.h - sweep.baseline) < 1e-6
        ? (t('hagc_family_baseline') || '{h} stops (baseline)').replace('{h}', hTxt(c.h))
        : (t('hagc_family_curve') || '{h} stops').replace('{h}', hTxt(c.h)),
      points: toStops(sweep.x, c.out),
    })),
    { id: 'famTarget', role: 'primary', shape: 'polyline', labels: [], color: '#f0b429',
      name: (t('hagc_family_target') || 'At {h} stops (slider)').replace('{h}', hTxt(d.targetHeadroom)),
      points: toStops(d.x, d.neutralOut) },
  ]
  return {
    title: t('hagc_family_title') || 'Grey tone curves by headroom',
    description: '',
    xAxis: { label: t('hagc_heat_x') || 'Input (stops relative to HDR reference white)', min: x0, max: x1, equalAspect: false },
    yAxis: { label: t('hagc_family_y') || 'Output (stops relative to HDR reference white)', min: y0, max: y1, equalAspect: false },
    hasY2: false,
    series: seriesList,
  }
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
