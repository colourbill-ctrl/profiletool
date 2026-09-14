// (c) 2026 William Li
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ResizablePlot from './ResizablePlot.jsx'
import { loadPlotly } from './plotly.js'
import { theme } from './PlotlyGraph.jsx'

const MAX_HEADROOM = 6
// Diverging: compression blue, no change white, expansion red — the sign of the gain is the
// thing to read first, so it gets the hue.
const COLORSCALE = [[0, '#2f5ba8'], [0.5, '#f7f7f7'], [1, '#c0392b']]
const AMBER = '#f0b429'

/**
 * The whole adaptive behaviour in one picture: gain on a grey input (colour, stops) over input
 * brightness (x, stops relative to HDR reference white) × display headroom (y, stops).
 * `sweep` comes from HagcEvaluated: IccProfLib's evaluator at every row's headroom, so the map
 * shows the library's blending, clamping and clipping, not a re-derivation.
 *
 * A heatmap trace is an SVG <image> Plotly draws from a canvas — no WebGL, no eval, so it
 * stays inside the CSP like every other plot. Clicking a cell picks that headroom.
 */
export default function HagcHeatmap({ t, sweep, target, onPick }) {
  const divRef = useRef(null)
  const plotlyRef = useRef(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const [dark, setDark] = useState(() => document.body.classList.contains('dark'))

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.body.classList.contains('dark')))
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Gain derived from the grey output, log2(out / in): defined for every tag, including one
  // whose curves mix channels differently (where no single blended gain curve exists).
  const grid = useMemo(() => {
    const cols = []
    sweep.x.forEach((xv, i) => { if (xv > 0) cols.push(i) })
    const xStops = cols.map((i) => Math.log2(sweep.x[i]))
    const z = sweep.rows.map((out) => cols.map((i) => (out[i] > 0 ? Math.log2(out[i] / sweep.x[i]) : null)))
    let m = 0
    for (const row of z) for (const v of row) if (v != null && Number.isFinite(v)) m = Math.max(m, Math.abs(v))
    return { xStops, z, zmax: m || 1 }
  }, [sweep])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const Plotly = await loadPlotly()
      plotlyRef.current = Plotly
      const div = divRef.current
      if (cancelled || !div) return
      const c = theme(dark)
      const x0 = grid.xStops[0], x1 = grid.xStops[grid.xStops.length - 1]
      const hline = (h, name, style, show) => ({
        type: 'scatter', mode: 'lines', x: [x0, x1], y: [h, h], name, showlegend: show, hoverinfo: 'skip',
        line: { color: style.color, width: style.width, dash: style.dash },
      })
      const lineColor = dark ? '#e5e7eb' : '#1f2937'
      const traces = [{
        type: 'heatmap', x: grid.xStops, y: sweep.headrooms, z: grid.z,
        colorscale: COLORSCALE, zmid: 0, zmin: -grid.zmax, zmax: grid.zmax,
        colorbar: { title: { text: t('hagc_heat_z') || 'Gain (stops)', side: 'right', font: { color: c.font } }, thickness: 12, tickfont: { color: c.font } },
        hovertemplate: `${t('hagc_heat_x') || 'Input (stops relative to HDR reference white)'}: %{x:.2f}<br>${t('hagc_heat_y') || 'Display headroom (stops)'}: %{y:.2f}<br>${t('hagc_heat_z') || 'Gain (stops)'}: %{z:.3f}<extra></extra>`,
      }]
      const tagCurves = sweep.curves.filter((cv) => Math.abs(cv.h - sweep.baseline) > 1e-6)
      tagCurves.forEach((cv, i) => traces.push(hline(cv.h, t('hagc_heat_curve') || 'Curve in the tag', { color: lineColor, width: 1, dash: 'dot' }, i === 0)))
      traces.push(hline(sweep.baseline, t('hagc_heat_baseline') || 'Baseline', { color: lineColor, width: 1.5 }, true))
      if (target != null) traces.push(hline(target, t('hagc_heat_target') || 'Slider', { color: AMBER, width: 2.5 }, true))
      // Where the input itself reaches the display peak: x stops = headroom stops.
      const d0 = Math.max(x0, 0), d1 = Math.min(x1, MAX_HEADROOM)
      if (d1 > d0) {
        traces.push({ type: 'scatter', mode: 'lines', x: [d0, d1], y: [d0, d1], name: t('hagc_heat_peak') || 'Input = display peak', hoverinfo: 'skip', line: { color: lineColor, width: 1, dash: 'dash' } })
      }
      const layout = {
        margin: { l: 56, r: 8, t: 12, b: 46 }, autosize: true,
        xaxis: { title: { text: t('hagc_heat_x') || 'Input (stops relative to HDR reference white)', font: { color: c.font }, standoff: 4 }, range: [x0, x1], zeroline: false, showgrid: false, linecolor: c.frame, tickfont: { color: c.font } },
        yaxis: { title: { text: t('hagc_heat_y') || 'Display headroom (stops)', font: { color: c.font }, standoff: 4 }, range: [0, MAX_HEADROOM], zeroline: false, showgrid: false, linecolor: c.frame, tickfont: { color: c.font } },
        showlegend: true, legend: { orientation: 'h', x: 0, y: 1.14, font: { color: c.font } },
        plot_bgcolor: c.plotBg, paper_bgcolor: c.paperBg, font: { color: c.font }, hovermode: 'closest',
      }
      await Plotly.react(div, traces, layout, { responsive: true, displayModeBar: false })
      if (!div.__hagcClick) {
        div.__hagcClick = true
        div.on('plotly_click', (ev) => {
          const y = ev?.points?.[0]?.y
          if (Number.isFinite(y)) pickRef.current?.(Math.min(MAX_HEADROOM, Math.max(0, y)))
        })
      }
    })()
    return () => { cancelled = true }
  }, [grid, sweep, target, dark, t])

  useEffect(() => () => {
    const d = divRef.current
    if (d && plotlyRef.current) { try { plotlyRef.current.purge(d) } catch { /* already gone */ } }
  }, [])

  const onResize = useCallback(() => {
    const d = divRef.current
    if (d && plotlyRef.current && d._fullLayout) plotlyRef.current.Plots.resize(d)
  }, [])

  return (
    <ResizablePlot storageKey="profiletool.hagcHeatHeight" onResize={onResize} defaultH={320} minH={220} maxH={1200}>
      <div ref={divRef} style={{ width: '100%', height: '100%' }} data-hagc-heatmap="" />
    </ResizablePlot>
  )
}
