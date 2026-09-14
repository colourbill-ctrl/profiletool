// (c) 2026 William Li
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './HdrViewport.module.css'

/**
 * The HDR tab's image view: zoom, pan and a resizable box, around ONE content element (the
 * browser's <img> or the HdrSurface <canvas>) that the caller renders with the style given.
 *
 * Zoom and pan are a CSS transform on that element, never a re-render: the pixels sent to the
 * display — the HDR values under test — are identical at every zoom. Same approach as
 * viz/RasterCanvas.jsx, with two differences suited to HDR inspection:
 *   - `zoom` is ABSOLUTE (1 = one image pixel per CSS pixel), and the view opens at 1:1, or
 *     shrunk to fit when the image is larger — never enlarged, which would soften a test ramp.
 *   - `overlay` renders inside the box but outside the transform, so the SDR white patch
 *     keeps its size and position however the image is zoomed. It receives `tick`, which
 *     changes whenever the image moves, so a patch docked to the image can follow it.
 */

const MIN_ZOOM = 0.02
const MAX_ZOOM = 32
const STEP = 1.25          // per button / key press
const PAN_STEP = 40        // px per arrow key
const WHEEL_RATE = 0.0015  // zoom factor per wheel delta unit (as RasterCanvas)

const SIZE_KEY = 'profiletool.hdrViewSize'
const DEFAULT_H = 460
const MIN_H = 160
const MAX_H = 2400
const MIN_W = 240

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Remembered box size. `w: null` means "fill the panel width" — the default, and what a width
// dragged out to the panel edge snaps back to, so the box keeps tracking the panel.
function loadSize() {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY))
    if (s && Number.isFinite(s.h)) {
      return { w: Number.isFinite(s.w) ? Math.max(MIN_W, s.w) : null, h: clamp(s.h, MIN_H, MAX_H) }
    }
  } catch { /* malformed or blocked storage */ }
  return { w: null, h: DEFAULT_H }
}

export default function HdrViewport({ t, contentW, contentH, children, overlay }) {
  const vpRef = useRef(null)
  const drag = useRef(null)
  const resizing = useRef(null)
  const [size, setSize] = useState(loadSize)
  // mode: 'open' (1:1 or shrunk to fit), 'fit' (fill the box) — both follow box resizes —
  // or null once the user has zoomed, which keeps their framing.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0, mode: 'open' })
  const viewRef = useRef(view)
  viewRef.current = view
  const has = contentW > 0 && contentH > 0

  useEffect(() => {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)) } catch { /* private mode */ }
  }, [size])

  const fitScale = useCallback(() => {
    const vp = vpRef.current
    if (!vp || !has) return 1
    return Math.min(vp.clientWidth / contentW, vp.clientHeight / contentH) || 1
  }, [has, contentW, contentH])

  // An axis smaller than the box is centred; a larger one may not pull its edge inside.
  const clampView = useCallback((v) => {
    const vp = vpRef.current
    if (!vp || !has) return v
    const axis = (p, room) => (room >= 0 ? room / 2 : clamp(p, room, 0))
    return { ...v, x: axis(v.x, vp.clientWidth - contentW * v.zoom), y: axis(v.y, vp.clientHeight - contentH * v.zoom) }
  }, [has, contentW, contentH])

  const openView = useCallback(() => clampView({ zoom: Math.min(1, fitScale()), x: 0, y: 0, mode: 'open' }), [clampView, fitScale])
  const fitView = useCallback(() => clampView({ zoom: fitScale(), x: 0, y: 0, mode: 'fit' }), [clampView, fitScale])

  // New image → opening view. Box resized (grip, window, settings blade) → re-derive a
  // fitted view, or just re-clamp one the user framed.
  useLayoutEffect(() => {
    if (!has || !vpRef.current) return
    setView(openView())
    const ro = new ResizeObserver(() => {
      setView((v) => (v.mode === 'open' ? openView() : v.mode === 'fit' ? fitView() : clampView(v)))
    })
    ro.observe(vpRef.current)
    return () => ro.disconnect()
  }, [has, openView, fitView, clampView])

  // Zoom to `z`, keeping the box point (cx, cy) — default the centre — still.
  const zoomTo = useCallback((z, cx, cy) => {
    setView((v) => {
      const vp = vpRef.current
      if (!vp) return v
      const nz = clamp(z, MIN_ZOOM, MAX_ZOOM)
      const px = cx ?? vp.clientWidth / 2
      const py = cy ?? vp.clientHeight / 2
      const r = nz / v.zoom
      return clampView({ zoom: nz, x: px - (px - v.x) * r, y: py - (py - v.y) * r, mode: null })
    })
  }, [clampView])

  // Ctrl/⌘ + wheel zooms toward the pointer. A native non-passive listener, so the page
  // scroll is prevented only while actually zooming; a plain wheel still scrolls the page.
  useEffect(() => {
    const vp = vpRef.current
    if (!vp) return
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const r = vp.getBoundingClientRect()
      zoomTo(viewRef.current.zoom * Math.exp(-e.deltaY * WHEEL_RATE), e.clientX - r.left, e.clientY - r.top)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // The patch and the grip handle their own pointers; a press on them must not start a pan.
  const onOverlay = (e) => !!e.target.closest?.('[data-ref-white],[data-hdr-grip]')

  const onPointerDown = (e) => {
    if (e.button !== 0 || onOverlay(e)) return
    drag.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    setView((v) => clampView({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }))
  }
  const endDrag = (e) => {
    if (drag.current && e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
  }
  const onDoubleClick = (e) => { if (!onOverlay(e)) setView(openView()) }

  // Keys act only when the box itself has focus — the patch has its own arrow keys.
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return
    const v = viewRef.current
    const pan = (dx, dy) => setView(clampView({ ...v, x: v.x + dx, y: v.y + dy }))
    const act = {
      '+': () => zoomTo(v.zoom * STEP), '=': () => zoomTo(v.zoom * STEP), '-': () => zoomTo(v.zoom / STEP),
      '0': () => setView(openView()), '1': () => zoomTo(1),
      ArrowLeft: () => pan(PAN_STEP, 0), ArrowRight: () => pan(-PAN_STEP, 0),
      ArrowUp: () => pan(0, PAN_STEP), ArrowDown: () => pan(0, -PAN_STEP),
    }[e.key]
    if (!act) return
    e.preventDefault()
    act()
  }

  // Corner grip: resize the box, width capped at the panel's.
  const onGripDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const vp = vpRef.current
    if (!vp) return
    e.currentTarget.setPointerCapture(e.pointerId)
    resizing.current = { x: e.clientX, y: e.clientY, w: vp.offsetWidth, h: vp.offsetHeight, max: vp.parentElement?.clientWidth || vp.offsetWidth }
  }
  const onGripMove = (e) => {
    const r = resizing.current
    if (!r) return
    e.stopPropagation()
    const w = clamp(r.w + e.clientX - r.x, MIN_W, r.max)
    setSize({ w: w >= r.max - 1 ? null : w, h: clamp(r.h + e.clientY - r.y, MIN_H, MAX_H) })
  }
  const onGripUp = (e) => {
    if (!resizing.current) return
    e.stopPropagation()
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    resizing.current = null
  }

  const contentStyle = {
    position: 'absolute', left: 0, top: 0,
    width: has ? contentW : undefined, height: has ? contentH : undefined,
    maxWidth: 'none', maxHeight: 'none',
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    transformOrigin: '0 0',
    // Past 2× show image pixels as squares — at that scale smoothing hides the values.
    imageRendering: view.zoom >= 2 ? 'pixelated' : 'auto',
    // An <img> is measured on load; hide it until then so it never flashes unscaled.
    visibility: has ? 'visible' : 'hidden',
  }
  const tick = `${view.zoom}:${view.x}:${view.y}:${size.w}:${size.h}`

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar} role="toolbar" aria-label={t('hdr_view_label') || 'Image view'}>
        <button type="button" className={styles.zbtn} onClick={() => zoomTo(view.zoom / STEP)}
                title={t('hdr_zoom_out') || 'Zoom out'} aria-label={t('hdr_zoom_out') || 'Zoom out'}>−</button>
        <span className={styles.pct} data-hdr-zoom="">{Math.round(view.zoom * 100)}%</span>
        <button type="button" className={styles.zbtn} onClick={() => zoomTo(view.zoom * STEP)}
                title={t('hdr_zoom_in') || 'Zoom in'} aria-label={t('hdr_zoom_in') || 'Zoom in'}>+</button>
        <button type="button" className={styles.tbtn} aria-pressed={view.mode === 'fit'} onClick={() => setView(fitView())}>
          {t('hdr_zoom_fit') || 'Fit image'}
        </button>
        <button type="button" className={styles.tbtn} aria-pressed={view.zoom === 1} onClick={() => zoomTo(1)}
                title={t('hdr_zoom_actual') || 'Actual pixels (1:1)'} aria-label={t('hdr_zoom_actual') || 'Actual pixels (1:1)'}>1:1</button>
        <span className={styles.hint}>{t('hdr_view_hint') || 'Drag to pan · Ctrl+wheel to zoom · double-click to reset'}</span>
      </div>
      <div ref={vpRef} className={styles.viewport} style={{ width: size.w ?? '100%', height: size.h }}
           tabIndex={0} aria-label={t('hdr_view_label') || 'Image view'} data-hdr-viewport=""
           onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
           onDoubleClick={onDoubleClick} onKeyDown={onKeyDown}>
        {children(contentStyle)}
        {overlay?.({ viewportRef: vpRef, tick })}
        <div className={styles.grip} data-hdr-grip="" title={t('hdr_view_resize') || 'Drag to resize the image area; double-click to restore the default size'}
             onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}
             onDoubleClick={(e) => { e.stopPropagation(); setSize({ w: null, h: DEFAULT_H }) }} />
      </div>
    </div>
  )
}
