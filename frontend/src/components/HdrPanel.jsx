// (c) 2026 William Li
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { classifyFile, FileKind, ACCEPTED_KINDS } from '../lib/fileKind.js'
import { getEnvironment } from '../lib/environment.js'
import { readDisplay } from '../lib/displayWatcher.js'
import { capabilityFor, hdrPathway, FORMATS, reasonText } from '../lib/capabilities.js'
import { decodeImage, findEmbeddedProfileFromFile, gainMapInfo } from '../lib/imageCodec.js'
import { renderFloatRgba, toSrgbLinearMatrix, normalizeChromaticities, drlValue, MAX_LIMIT_STOPS, displayPeakInfo, fitShare, clipsBeyondDisplay } from '../lib/hdrPixels.js'
import { useLiveDisplay } from './useLiveDisplay.js'
import { createHdrSurface, FALLBACK } from '../lib/hdrSurface.js'
import styles from './HdrPanel.module.css'

/**
 * HDR tab — show ONE image on this display, in HDR where the environment allows
 * (DL-HDRDISP1, hdr-display-pathway-decision.md). Two routes, because they are two jobs:
 *
 *   'img'     A file the BROWSER decodes (AVIF, JPEG incl. gain-map JPEG, PNG incl. cICP,
 *             HEIC on Safari). Shown by an <img>; the SDR↔HDR control is CSS
 *             `dynamic-range-limit`, and a blend where `dynamic-range-limit-mix()` exists.
 *             No pixel is read back from this route, ever.
 *   'pixels'  A file profiletool decodes itself — OpenEXR, which no browser decodes. Rendered
 *             through HdrSurface (float16 canvas → WebGPU → SDR fallback) with one range
 *             operator for the same control, plus exposure.
 *
 * Everything the panel refuses, it refuses with the reason capabilities.js gives, and an
 * image's embedded profile stays one click from the Profile tab either way — inspection
 * works where display does not (DL-HDRENV1).
 */
export default function HdrPanel({ onOpenInProfile }) {
  const t = useT()
  // The monitor the window is on NOW. Capabilities are fixed for the page, but HDR state and
  // the display's peak change when the window is dragged to another screen.
  const live = useLiveDisplay()
  const [file, setFile] = useState(null)
  const [info, setInfo] = useState(null)        // { kind, format, route, why, hdrWhy, env }
  const [profile, setProfile] = useState(null)  // null = checking | { size } | { none: true }
  const [gain, setGain] = useState(null)
  const [error, setError] = useState(null)
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)
  const loadToken = useRef(0)

  const clear = useCallback(() => {
    loadToken.current++
    setFile(null); setInfo(null); setProfile(null); setGain(null); setError(null)
  }, [])

  const load = useCallback(async (f) => {
    if (!f) return
    const token = ++loadToken.current
    const live = () => token === loadToken.current
    setFile(f); setInfo(null); setProfile(null); setGain(null); setError(null)
    try {
      const head = new Uint8Array(await f.slice(0, 64).arrayBuffer())
      const { kind, format } = classifyFile(head, f.name)
      const base = await getEnvironment()
      // Capabilities are fixed for the page; the DISPLAY is whatever monitor the window is
      // on right now, so it is re-read rather than taken from the cached detection.
      const env = { ...base, display: { ...base.display, ...readDisplay() } }
      if (!live()) return
      setInfo({ kind, format, env, ...routeFor(kind, format, env) })

      if (kind === FileKind.IMAGE && format !== 'exr') {
        findEmbeddedProfileFromFile(f)
          .then((p) => { if (live()) setProfile(p ? { size: p.length } : { none: true }) })
          .catch(() => { if (live()) setProfile({ none: true }) })
      }
      if (format === 'jpeg') {
        f.arrayBuffer().then((b) => gainMapInfo(new Uint8Array(b)))
          .then((g) => { if (live()) setGain(g) })
          .catch(() => { if (live()) setGain({ present: false }) })
      }
    } catch (e) {
      if (live()) setError(e.message || String(e))
    }
  }, [])

  // No stopPropagation: MainCanvas adds no panel drop target on this tab, and letting the
  // drop reach `window` is what clears the canvas's tab-button drag highlight.
  const onDrop = (e) => {
    e.preventDefault(); setOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) load(f)
  }
  const dropProps = {
    onDragOver: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setOver(true) } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) },
    onDrop,
  }

  return (
    <div className={`${styles.wrap} ${over ? styles.over : ''}`} {...dropProps}>
      <p className={styles.intro}>
        {t('hdr_intro') || 'View one HDR image on this display. Files the browser can decode are shown by the browser itself; OpenEXR is decoded and rendered by profiletool.'}
      </p>

      <input ref={inputRef} type="file" hidden
             accept=".exr,.avif,.heic,.heif,.jpg,.jpeg,.png,.tif,.tiff,image/*"
             onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />

      {!file ? (
        <div className={styles.drop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}>
          <div className={styles.dropTitle}>{t('hdr_drop') || 'Drop an HDR image here, or click to choose one'}</div>
          <div className={styles.dropFormats}>{t('hdr_formats') || 'OpenEXR, AVIF, JPEG (including gain-map JPEG), PNG — and HEIC on Safari.'}</div>
        </div>
      ) : (
        <div className={styles.fileBar}>
          <span className={styles.fileName} title={file.name}>{file.name}</span>
          {info?.format && <span className={styles.badge}>{FORMATS[info.format]?.label || info.format}</span>}
          <button type="button" className={styles.btn} onClick={() => inputRef.current?.click()}>{t('hdr_choose') || 'Choose another'}</button>
          <button type="button" className={styles.btn} onClick={clear}>{t('hdr_clear') || 'Clear'}</button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {file && info && (
        <>
          <ProfileRow t={t} info={info} profile={profile} onOpen={() => onOpenInProfile?.(file)} />
          {gain?.present && <GainRow t={t} gain={gain} />}
          <RouteBody key={`${file.name}:${file.size}:${file.lastModified}`} t={t} file={file} info={info} profile={profile} gain={gain} live={live} />
        </>
      )}
    </div>
  )
}

// Which route a file takes, and why not when it takes none. Reasons come from
// capabilities.js so this panel and the Environment panel say the same thing.
function routeFor(kind, format, env) {
  if (kind !== FileKind.IMAGE) {
    return { route: ACCEPTED_KINDS.has(kind) ? 'notImage' : 'unknown' }
  }
  if (format === 'exr') {
    const cap = capabilityFor('exr', env)
    return { route: 'pixels', hdrWhy: cap.hdr.ok ? null : cap.hdr }
  }
  // TIFF: no browser decodes it (bar Safari), and how HDR is carried in a 16-bit TIFF is
  // an open decision (Phase 4.3). Displaying its integers as-is would claim a meaning.
  if (format === 'tiff') return { route: 'tiff' }
  if (!format || !FORMATS[format]) return { route: 'unknown' }
  const cap = capabilityFor(format, env)
  if (!cap.display.ok) return { route: 'refused', why: cap.display }
  return { route: 'img', hdrWhy: cap.hdr.ok ? null : cap.hdr }
}

function ProfileRow({ t, info, profile, onOpen }) {
  let value
  if (info.format === 'exr') value = t('hdr_profile_exr') || 'none — OpenEXR states colour through chromaticities'
  else if (info.kind !== FileKind.IMAGE) value = '—'
  else if (!profile) value = t('hdr_checking') || 'checking…'
  else if (profile.none) value = t('hdr_profile_none') || 'none'
  else value = `${profile.size.toLocaleString()} B`
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{t('hdr_profile') || 'Embedded ICC profile'}</span>
      <span className={styles.factValue}>
        {value}
        {profile?.size > 0 && (
          <button type="button" className={styles.linkBtn} onClick={onOpen}>{t('hdr_open_profile') || 'Open in Profile tab'}</button>
        )}
      </span>
    </div>
  )
}

function GainRow({ t, gain }) {
  const kind = gain.kind === 'ultrahdr' ? 'Ultra HDR (hdrgm XMP)' : gain.kind === 'iso21496' ? 'ISO 21496-1' : gain.kind
  const max = gain.fields?.GainMapMax
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{t('hdr_gainmap') || 'Gain map'}</span>
      <span className={styles.factValue}>
        {kind}{max != null ? ` · GainMapMax ${max}` : ''}
        {gain.parsed === false && <span className={styles.muted}> · {t('hdr_gainmap_detected') || 'detected, not decoded'}</span>}
      </span>
    </div>
  )
}

function RouteBody({ t, file, info, profile, gain, live }) {
  const env = info.env
  if (info.route === 'notImage') {
    return <p className={styles.note}>{t('hdr_not_image') || 'That is not an image. Load profiles through the Profiles pane.'}</p>
  }
  if (info.route === 'unknown') {
    return <p className={styles.note}>{t('hdr_unknown') || 'Not an image format profiletool recognises.'}</p>
  }
  if (info.route === 'tiff') {
    return <p className={styles.note}>{t('hdr_tiff') || 'TIFF pixels are not shown here yet: browsers do not decode TIFF, and how HDR is encoded in a 16-bit TIFF is still undecided (Phase 4.3). Its embedded profile can be inspected.'}</p>
  }
  if (info.route === 'refused') {
    return (
      <p className={styles.note}>
        <strong>{t('hdr_cannot_display') || 'Cannot display this image here:'}</strong> {reasonText(info.why, t)}.{' '}
        {t('hdr_inspect_still') || 'Its embedded profile can still be inspected.'}
      </p>
    )
  }
  if (info.route === 'img') return <ImgRoute t={t} file={file} info={info} env={env} profile={profile} gain={gain} live={live} />
  return <PixelRoute t={t} file={file} info={info} env={env} live={live} />
}

// ── route 'img' ──────────────────────────────────────────────────────────────
function cssSupport() {
  try {
    return {
      drl: CSS.supports('dynamic-range-limit', 'standard') && CSS.supports('dynamic-range-limit', 'no-limit'),
      mix: CSS.supports('dynamic-range-limit', 'dynamic-range-limit-mix(standard 50%, no-limit 50%)'),
    }
  } catch { return { drl: false, mix: false } }
}

function ImgRoute({ t, file, info, env, profile, gain, live }) {
  // Merge the LIVE display into the page's capabilities, so the HDR verdict follows the
  // window. NO_HDR_DISPLAY is left to the display-specific notes below, which say more.
  const envLive = useMemo(() => ({ ...env, display: { ...env.display, ...live.display } }), [env, live.display])
  const hdrCap = capabilityFor(info.format, envLive).hdr
  const hdrWhy = hdrCap.ok || hdrCap.code === 'NO_HDR_DISPLAY' ? null : hdrCap
  const dpk = displayPeakInfo({ hdr: envLive.display.hdr, headroomStops: live.screen?.headroom })
  const viewerRef = useRef(null)
  const refPref = useRefWhitePref()
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [share, setShare] = useState(1)
  const imgRef = useRef(null)
  const support = useRef(cssSupport()).current

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  // Set through the CSSOM, not React's style prop: React silently drops a property the
  // browser does not know, and this one is new enough that silence would hide why.
  const value = drlValue(share, support.mix)
  useEffect(() => {
    if (imgRef.current && support.drl) imgRef.current.style.setProperty('dynamic-range-limit', value)
  }, [value, support.drl, url])

  // A PNG/JPEG whose only HDR signal is an embedded profile: browsers ignore ICC-signalled
  // PQ/HLG, so it will look dim and flat — say so rather than let it read as a bug.
  const iccOnly = (info.format === 'png' || info.format === 'jpeg') && profile?.size > 0 && !gain?.present

  return (
    <>
      <Facts t={t} env={env} rows={[
        [t('hdr_route') || 'Shown by', t('hdr_route_img') || 'the browser'],
        [t('hdr_display') || 'HDR display', tri(envLive.display.hdr, t)],
        [t('hdr_display_peak') || 'Display peak', <DisplayPeak t={t} dpk={dpk} live={live} />],
      ]} />
      {hdrWhy && <p className={styles.note}>{reasonText(hdrWhy, t)}.</p>}
      {envLive.display.hdr === false && support.drl && (
        <p className={styles.note}>{t('hdr_sdr_display_img') || 'This display reports no HDR, so the browser shows this image in SDR at either end.'}</p>
      )}
      {iccOnly && <p className={styles.note}>{t('hdr_icc_only') || 'Browsers ignore HDR that is signalled only by an embedded ICC profile, so this image may look dim and flat.'}</p>}
      {support.drl
        ? <RangeControl t={t} share={share} setShare={setShare} blend={support.mix} />
        : <p className={styles.note}>{t('hdr_no_drl') || 'This browser cannot switch an image between SDR and HDR, so it is shown as the browser renders it.'}</p>}
      <RefWhiteBar t={t} pref={refPref} />
      <div className={styles.viewer} ref={viewerRef}>
        {url && !failed && (
          <img ref={imgRef} src={url} alt={file.name} className={styles.image}
               onError={() => setFailed(true)} />
        )}
        {failed && <p className={styles.error}>{t('hdr_img_failed') || 'The browser could not decode this image.'}</p>}
        <RefWhitePatch t={t} viewerRef={viewerRef} targetRef={imgRef} pref={refPref} />
      </div>
    </>
  )
}

// ── route 'pixels' ───────────────────────────────────────────────────────────
function PixelRoute({ t, file, info, env, live }) {
  // Merge the LIVE display into the page's capabilities, so the HDR verdict follows the
  // window. NO_HDR_DISPLAY is left to the display-specific notes below, which say more.
  const envLive = useMemo(() => ({ ...env, display: { ...env.display, ...live.display } }), [env, live.display])
  const hdrCap = capabilityFor(info.format, envLive).hdr
  const hdrWhy = hdrCap.ok || hdrCap.code === 'NO_HDR_DISPLAY' ? null : hdrCap
  const dpk = displayPeakInfo({ hdr: envLive.display.hdr, headroomStops: live.screen?.headroom })
  const viewerRef = useRef(null)
  const refPref = useRefWhitePref()
  const [decoded, setDecoded] = useState(null)
  const [error, setError] = useState(null)
  const [kind, setKind] = useState(null)          // backend being tried / in use
  const [surface, setSurface] = useState(null)
  const [fallbacks, setFallbacks] = useState([])
  const [exposure, setExposure] = useState(0)
  const [share, setShare] = useState(1)
  const [peak, setPeak] = useState(null)
  const canvasRef = useRef(null)

  // Decode once per file. EXR decode is synchronous in WASM; a very large file blocks the
  // tab for the duration, which is acceptable for a one-image viewer.
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const d = await decodeImage(bytes)
        if (d.sampleFormat !== 'float' || d.channels !== 3) throw new Error('expected 3-channel float samples')
        // Copy out to an aligned buffer: the WASM view's byteOffset need not be a multiple of 4.
        const raw = d.samples
        const rgb = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
        const primaries = normalizeChromaticities(d.chromaticities)
        if (dead) return
        setDecoded({ w: d.width, h: d.height, rgb, primaries, matrix: toSrgbLinearMatrix(primaries), compression: d.compression })
        setKind(hdrPathway(env) || 'sdr')
      } catch (e) {
        if (!dead) setError(e.message || String(e))
      }
    })()
    return () => { dead = true }
  }, [file, env])

  // Create the surface for `kind`; on failure, record why and step down the chain. The
  // WebGPU step is skipped when the environment already knows it has no adapter.
  useEffect(() => {
    if (!kind || !canvasRef.current) return
    let dead = false
    let made = null
    createHdrSurface(canvasRef.current, kind)
      .then((s) => { if (dead) { s.dispose(); return } made = s; setSurface(s) })
      .catch((e) => {
        if (dead) return
        let next = FALLBACK[kind]
        if (next === 'webgpu' && !env.pathway?.webgpu) next = 'sdr'
        setFallbacks((f) => [...f, { from: kind, why: e.message || String(e) }])
        setSurface(null)
        setKind(next)
      })
    return () => { dead = true; made?.dispose() }
  }, [kind, env])

  // Draw, throttled to one frame: slider drags would otherwise queue full-image passes.
  const limitStops = surface?.hdr ? share * MAX_LIMIT_STOPS : 0
  useEffect(() => {
    if (!surface || !decoded) return
    const id = requestAnimationFrame(() => {
      try {
        const { rgba, peak: p } = renderFloatRgba(decoded.rgb, decoded.w, decoded.h, { exposureStops: exposure, limitStops, matrix: decoded.matrix })
        surface.draw(rgba, decoded.w, decoded.h)
        setPeak(p)
      } catch (e) { setError(e.message || String(e)) }
    })
    return () => cancelAnimationFrame(id)
  }, [surface, decoded, exposure, limitStops])

  if (error) return <p className={styles.error}>{t('hdr_decode_failed') || 'Could not decode:'} {error}</p>
  if (!decoded) return <p className={styles.note}>{t('hdr_decoding') || 'Decoding…'}</p>

  // What actually reaches the display: the soft ceiling never exceeds its limit, and an SDR
  // surface is capped at SDR white. Compared with the display peak when that is known.
  const ceiling = surface?.hdr ? (share >= 1 ? Infinity : 2 ** (share * MAX_LIMIT_STOPS)) : 1
  const clipping = !!surface?.hdr && dpk.ratio != null && peak != null && clipsBeyondDisplay(peak, dpk.ratio, ceiling)
  const fit = dpk.stops != null ? fitShare(dpk.stops) : null
  const readout = share >= 1
    ? (t('hdr_limit_none') || 'no limit')
    : (t('hdr_limit_value') || 'limit {n} stops ({r}×)')
        .replace('{n}', (share * MAX_LIMIT_STOPS).toFixed(2)).replace('{r}', (2 ** (share * MAX_LIMIT_STOPS)).toFixed(2))
  const surfaceLabel = {
    'float16-canvas': t('hdr_surface_float16') || 'HDR canvas (float16)',
    webgpu: t('hdr_surface_webgpu') || 'WebGPU (extended range)',
    sdr: t('hdr_surface_sdr') || 'SDR canvas (tone-mapped)',
  }
  const p = decoded.primaries
  return (
    <>
      <Facts t={t} env={env} rows={[
        [t('hdr_route') || 'Shown by', t('hdr_route_pixels') || 'profiletool'],
        [t('hdr_surface') || 'Output', surface ? surfaceLabel[surface.kind] : (t('hdr_checking') || 'checking…')],
        [t('hdr_display') || 'HDR display', tri(envLive.display.hdr, t)],
        [t('hdr_display_peak') || 'Display peak', <DisplayPeak t={t} dpk={dpk} live={live} />],
        [t('hdr_size') || 'Size', `${decoded.w}×${decoded.h}${decoded.compression ? ` · ${decoded.compression}` : ''}`],
        [t('hdr_peak') || 'Brightest pixel', peak == null ? '…' : (t('hdr_peak_value') || '{n}× SDR white').replace('{n}', String(+peak.toFixed(2)))],
        [t('hdr_chromaticities') || 'Chromaticities',
          p ? `R ${p.red.join(', ')} · G ${p.green.join(', ')} · B ${p.blue.join(', ')} · W ${p.white.join(', ')}${decoded.matrix ? '' : ' (Rec. 709)'}`
            : (t('hdr_chroma_default') || 'not stated — Rec. 709 assumed')],
      ]} />
      {hdrWhy && <p className={styles.note}>{reasonText(hdrWhy, t)}.</p>}
      {fallbacks.map((f, i) => (
        <p key={i} className={styles.note}>{(t('hdr_fallback') || '{from} was not available here ({why}); using the next output.').replace('{from}', surfaceLabel[f.from] || f.from).replace('{why}', f.why)}</p>
      ))}
      {surface?.noteCode && (
        <p className={styles.note}>
          {surface.noteCode === 'webgpu_clamped'
            ? (t('hdr_note_webgpu_clamped') || 'WebGPU applied tone mapping “{mode}”, so output is clamped to SDR').replace('{mode}', surface.noteMode)
            : (t('hdr_note_webgpu_unconfirmed') || 'This browser does not report the WebGPU tone mapping it applied, so HDR output is unconfirmed')}.
        </p>
      )}
      {surface?.hdr && clipping && dpk.source === 'sdr' && (
        <p className={styles.noteStrong}>{t('hdr_sdr_display_pixels') || 'This display reports no HDR, so everything brighter than SDR white clips. Fit to display shows the tone-mapped rendering instead.'}</p>
      )}
      {surface?.hdr && clipping && dpk.source === 'headroom' && (
        <p className={styles.noteStrong}>
          {(t('hdr_clip_note') || 'This image asks for {img}× SDR white, but this display shows up to {disp}×, so brighter values clip. Fit to display rolls them off into the display’s peak instead.')
            .replace('{img}', String(+peak.toFixed(2))).replace('{disp}', String(+dpk.ratio.toFixed(2)))}
        </p>
      )}
      {surface && !surface.hdr && <p className={styles.note}>{t('hdr_sdr_output') || 'This output cannot carry brighter-than-white values, so the tone-mapped SDR rendering is shown.'}</p>}

      <div className={styles.controls}>
        {surface?.hdr && (
          <RangeControl t={t} share={share} setShare={setShare} blend readout={readout}
                        onFit={fit != null ? () => setShare(fit) : null}
                        fitActive={fit != null && Math.abs(share - fit) < 0.005} />
        )}
        <label className={styles.slider}>
          <span>{t('hdr_exposure') || 'Exposure'}</span>
          <input type="range" min={-4} max={4} step={0.1} value={exposure}
                 onChange={(e) => setExposure(Number(e.target.value))} aria-label={t('hdr_exposure') || 'Exposure'} />
          <span className={styles.sliderValue}>{(t('hdr_stops_value') || '{n} stops').replace('{n}', (exposure > 0 ? '+' : '') + exposure.toFixed(1))}</span>
        </label>
      </div>

      <RefWhiteBar t={t} pref={refPref} />
      <div className={styles.viewer} ref={viewerRef}>
        <canvas key={kind} ref={canvasRef} className={styles.image} data-surface={surface?.kind || ''} />
        <RefWhitePatch t={t} viewerRef={viewerRef} targetRef={canvasRef} pref={refPref} />
      </div>
    </>
  )
}

// SDR | HDR buttons plus, where a blend exists, a slider between them. `share` 0 = SDR.
function RangeControl({ t, share, setShare, blend, readout, onFit, fitActive }) {
  return (
    <div className={styles.range}>
      <span className={styles.rangeLabel}>{t('hdr_range') || 'Dynamic range'}</span>
      <div className={styles.seg} role="group">
        <button type="button" className={share === 0 ? styles.segOn : styles.segBtn} aria-pressed={share === 0} onClick={() => setShare(0)}>SDR</button>
        <button type="button" className={share === 1 ? styles.segOn : styles.segBtn} aria-pressed={share === 1} onClick={() => setShare(1)}>HDR</button>
      </div>
      {blend
        ? <input type="range" min={0} max={100} step={1} value={Math.round(share * 100)}
                 onChange={(e) => setShare(Number(e.target.value) / 100)} aria-label={t('hdr_range') || 'Dynamic range'} />
        : <span className={styles.muted}>{t('hdr_no_mix') || 'This browser offers only the two ends, not a blend.'}</span>}
      {readout && <span className={styles.sliderValue}>{readout}</span>}
      {onFit && (
        <button type="button" className={fitActive ? styles.fitOn : styles.btn} aria-pressed={!!fitActive} onClick={onFit}
                title={t('hdr_fit_help') || 'Caps brightness at the peak this display reports. On Windows that figure can lag behind brightness changes.'}>
          {t('hdr_fit') || 'Fit to display'}
        </button>
      )}
    </div>
  )
}

// The display's peak, as known right now. Unknown is said, not guessed; where asking for the
// window-management permission would reveal it, the button is offered here.
function DisplayPeak({ t, dpk, live }) {
  if (dpk.source === 'headroom') {
    return (t('hdr_display_peak_value') || '{r}× SDR white ({n} stops)')
      .replace('{r}', String(+dpk.ratio.toFixed(2))).replace('{n}', String(+dpk.stops.toFixed(2)))
  }
  if (dpk.source === 'sdr') return t('hdr_display_peak_sdr') || '1× — SDR display'
  if (live.status === 'active') return t('env_headroom_hidden') || 'not exposed by this browser'
  const canAsk = live.status === 'not-granted' || live.status === 'error'
  return (
    <>
      {t('hdr_display_peak_unknown') || 'not known'}
      {canAsk && <button type="button" className={styles.linkBtn} onClick={live.identify}>{t('env_identify') || 'Identify displays'}</button>}
    </>
  )
}

// ── SDR white reference patch ────────────────────────────────────────────────
// Plain CSS white: in an HDR-composited page this is SDR white, so HDR highlights on an HDR
// display should look brighter than it and on an SDR display never can. It floats over the
// viewer — not inside the image element — so it can sit beside or on top of any part of the
// picture, and a later zoom transform on the image will not scale it.

const REF_ON_KEY = 'profiletool.hdrRefWhite'
const REF_POS_KEY = 'profiletool.hdrRefWhitePos'
const PATCH = 44       // px, the white square
const GAP = 6          // px, between the image's right edge and the docked patch

const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* private mode */ } },
}

// On/off and position, remembered across images and reloads. `pos` is null while the patch is
// docked to the image's right edge; once dragged it is a fraction of the viewer's free space,
// so it keeps its relative place when the viewer is resized.
function useRefWhitePref() {
  const [on, setOnState] = useState(() => store.get(REF_ON_KEY) !== '0')
  const [pos, setPosState] = useState(() => {
    try { const p = JSON.parse(store.get(REF_POS_KEY)); return p && Number.isFinite(p.fx) && Number.isFinite(p.fy) ? p : null } catch { return null }
  })
  const setOn = useCallback((v) => { setOnState(v); store.set(REF_ON_KEY, v ? '1' : '0') }, [])
  const setPos = useCallback((p) => { setPosState(p); store.set(REF_POS_KEY, p ? JSON.stringify(p) : null) }, [])
  return { on, setOn, pos, setPos }
}

function RefWhiteBar({ t, pref }) {
  return (
    <div className={styles.viewerBar}>
      <button type="button" className={pref.on ? styles.fitOn : styles.btn} aria-pressed={pref.on}
              onClick={() => pref.setOn(!pref.on)}>
        {t('hdr_ref_white_toggle') || 'SDR white patch'}
      </button>
      {pref.on && <span className={styles.muted}>{t('hdr_ref_white_hint') || 'Drag to move it; double-click to put it back beside the image.'}</span>}
    </div>
  )
}

function RefWhitePatch({ t, viewerRef, targetRef, pref }) {
  const [box, setBox] = useState(null)       // { left, top } in viewer content px
  const drag = useRef(null)

  // Where the patch goes: docked (image's right edge, top-aligned, kept inside the viewer)
  // or the stored fraction of the free space. Recomputed whenever the viewer or image resizes.
  const place = useCallback(() => {
    const vp = viewerRef.current
    if (!vp) return
    const freeW = Math.max(0, vp.scrollWidth - PATCH)
    const freeH = Math.max(0, vp.scrollHeight - PATCH - 16)
    if (pref.pos) {
      setBox({ left: pref.pos.fx * freeW, top: pref.pos.fy * freeH })
      return
    }
    const img = targetRef.current
    const vr = vp.getBoundingClientRect()
    const ir = img ? img.getBoundingClientRect() : null
    const left = ir && ir.width > 0 ? ir.right - vr.left + vp.scrollLeft + GAP : freeW
    const top = ir && ir.height > 0 ? ir.top - vr.top + vp.scrollTop : 8
    setBox({ left: Math.min(Math.max(0, left), freeW), top: Math.min(Math.max(0, top), freeH) })
  }, [viewerRef, targetRef, pref.pos])

  useEffect(() => {
    if (!pref.on) return
    place()
    const ro = new ResizeObserver(place)
    if (viewerRef.current) ro.observe(viewerRef.current)
    if (targetRef.current) ro.observe(targetRef.current)
    // The image's own size arrives late (decode, first draw), so also re-place on load.
    const img = targetRef.current
    img?.addEventListener?.('load', place)
    return () => { ro.disconnect(); img?.removeEventListener?.('load', place) }
  }, [pref.on, place, viewerRef, targetRef])

  if (!pref.on || !box) return null

  const commit = (left, top) => {
    const vp = viewerRef.current
    if (!vp) return
    const freeW = Math.max(1, vp.scrollWidth - PATCH)
    const freeH = Math.max(1, vp.scrollHeight - PATCH - 16)
    const l = Math.min(Math.max(0, left), freeW), tp = Math.min(Math.max(0, top), freeH)
    setBox({ left: l, top: tp })
    return { fx: l / freeW, fy: tp / freeH }
  }
  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, left: box.left, top: box.top, moved: false }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    d.moved = true
    d.last = commit(d.left + e.clientX - d.x, d.top + e.clientY - d.y)
  }
  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (d?.moved && d.last) pref.setPos(d.last)
  }
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 8
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    if (!dx && !dy) return
    e.preventDefault()
    const p = commit(box.left + dx, box.top + dy)
    if (p) pref.setPos(p)
  }

  return (
    <div className={styles.refPatch} data-ref-white="" style={{ left: box.left, top: box.top }}
         role="button" tabIndex={0}
         aria-label={t('hdr_ref_white') || 'SDR white'}
         title={`${t('hdr_ref_white_help') || 'Plain SDR white, for comparison. On an HDR display, HDR highlights look brighter than this.'} ${t('hdr_ref_white_hint') || 'Drag to move it; double-click to put it back beside the image.'}`}
         onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
         onDoubleClick={() => pref.setPos(null)} onKeyDown={onKeyDown}>
      <div className={styles.refSwatch} />
      <span className={styles.refLabel}>{t('hdr_ref_white') || 'SDR white'}</span>
    </div>
  )
}

function Facts({ rows }) {
  return (
    <div className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <span className={styles.factLabel}>{label}</span>
          <span className={styles.factValue}>{value}</span>
        </div>
      ))}
    </div>
  )
}

function tri(v, t) {
  if (v === true) return t('env_yes') || 'yes'
  if (v === false) return t('env_no') || 'no'
  return t('env_unknown') || 'not reported'
}
