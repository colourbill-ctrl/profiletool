// (c) 2026 William Li
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n.jsx'
import { classifyFile, FileKind, ACCEPTED_KINDS } from '../lib/fileKind.js'
import { getEnvironment } from '../lib/environment.js'
import { readDisplay } from '../lib/displayWatcher.js'
import { capabilityFor, hdrPathway, FORMATS, reasonText } from '../lib/capabilities.js'
import { decodeImage, findEmbeddedProfileFromFile, gainMapInfo } from '../lib/imageCodec.js'
import { decodeRadiance } from '../lib/radianceHdr.js'
import HdrViewport from './HdrViewport.jsx'
import { renderFloatRgba, toSrgbLinearMatrix, normalizeChromaticities, isRec709Primaries, drlValue, MAX_LIMIT_STOPS, displayPeakInfo, fitShare, clipsBeyondDisplay, samplesToUnitFloat, floatSamples } from '../lib/hdrPixels.js'
import { useLiveDisplay } from './useLiveDisplay.js'
import { createHdrSurface, FALLBACK } from '../lib/hdrSurface.js'
import { hdrTransformPixels, HDR_POLICY } from '../lib/hdrProfileTransform.js'
import styles from './HdrPanel.module.css'

/**
 * HDR tab — show ONE image on this display, in HDR where the environment allows
 * (DL-HDRDISP1, hdr-display-pathway-decision.md). Two routes, because they are two jobs:
 *
 *   'img'     A file the BROWSER decodes (AVIF, JPEG incl. gain-map JPEG, PNG incl. cICP,
 *             HEIC on Safari). Shown by an <img>; the SDR↔HDR control is CSS
 *             `dynamic-range-limit`, and a blend where `dynamic-range-limit-mix()` exists.
 *             No pixel is read back from this route, ever.
 *   'pixels'  A file profiletool decodes itself — OpenEXR and Radiance HDR, which no browser
 *             decodes. Rendered
 *             through HdrSurface (float16 canvas → WebGPU → SDR fallback) with one range
 *             operator for the same control, plus exposure.
 *
 * Everything the panel refuses, it refuses with the reason capabilities.js gives, and an
 * image's embedded profile stays one click from the Profile tab either way — inspection
 * works where display does not (DL-HDRENV1).
 */
// Formats that can be decoded by profiletool and so can have a profile assigned to their pixels.
const ASSIGNABLE = new Set(['tiff', 'png', 'jpeg', 'exr', 'hdr'])
// Formats whose samples are linear light rather than code values: no ICC profile slot, the
// 'pixels' route, and only Linear-transfer HDR Profiles may interpret them.
const LINEAR_LIGHT = new Set(['exr', 'hdr'])
// Whether the Image details section (embedded profile … HDR reference white) is unfolded.
const DETAILS_KEY = 'profiletool.hdrDetailsOpen'
// 'refwhite' | 'nits' — what file 1.0 means for a float image under a Linear-transfer profile.
const LINEAR_SCALE_KEY = 'profiletool.hdrLinearScale'
// Largest file the tab reads, checked against File.size BEFORE any read: mirrors kMaxImageBytes
// in iccimage-wrapper.cpp, which only bounds bytes that JS has already allocated and copied in.
const MAX_HDR_FILE_BYTES = 512 * 1024 * 1024
// Target headroom stays within the slider's range, whatever the display reports.
const clampStops = (s) => Math.min(MAX_LIMIT_STOPS, Math.max(0, s))

export default function HdrPanel({ onOpenInProfile, hdrProfiles = [] }) {
  const t = useT()
  // The monitor the window is on NOW. Capabilities are fixed for the page, but HDR state and
  // the display's peak change when the window is dragged to another screen.
  const live = useLiveDisplay()
  const [file, setFile] = useState(null)
  const [info, setInfo] = useState(null)        // { kind, format, route, why, hdrWhy, env }
  const [profile, setProfile] = useState(null)  // null = checking | { size, bytes } | { none: true }
  // 'none' | 'embedded' | a pool entry id. Reset per image.
  const [assignSel, setAssignSel] = useState('none')
  const [gain, setGain] = useState(null)
  const [error, setError] = useState(null)
  const [over, setOver] = useState(false)
  // The semi-static facts fold away to give the image more room; remembered across images.
  const [detailsOpen, setDetailsOpenState] = useState(() => store.get(DETAILS_KEY) !== '0')
  const setDetailsOpen = (v) => { setDetailsOpenState(v); store.set(DETAILS_KEY, v ? '1' : '0') }
  const inputRef = useRef(null)
  const loadToken = useRef(0)
  // `load` is created once; it reads the current translator through this ref.
  const tRef = useRef(t)
  tRef.current = t

  const clear = useCallback(() => {
    loadToken.current++
    setFile(null); setInfo(null); setProfile(null); setGain(null); setError(null); setAssignSel('none')
  }, [])

  const load = useCallback(async (f) => {
    if (!f) return
    const token = ++loadToken.current
    const live = () => token === loadToken.current
    setFile(f); setInfo(null); setProfile(null); setGain(null); setError(null); setAssignSel('none')
    try {
      // Refused by size before ANY read: the gain-map scan and the decoders read the whole file.
      if (f.size > MAX_HDR_FILE_BYTES) {
        const mb = (n) => String(Math.ceil(n / (1024 * 1024)))
        setError((tRef.current('hdr_too_large') || 'This file is {size} MB; the HDR tab opens images up to {max} MB.')
          .replace('{size}', mb(f.size)).replace('{max}', mb(MAX_HDR_FILE_BYTES)))
        return
      }
      const head = new Uint8Array(await f.slice(0, 64).arrayBuffer())
      const { kind, format } = classifyFile(head, f.name)
      const base = await getEnvironment()
      // Capabilities are fixed for the page; the DISPLAY is whatever monitor the window is
      // on right now, so it is re-read rather than taken from the cached detection.
      const env = { ...base, display: { ...base.display, ...readDisplay() } }
      if (!live()) return
      setInfo({ kind, format, env, ...routeFor(kind, format, env) })

      if (kind === FileKind.IMAGE && !LINEAR_LIGHT.has(format)) {
        findEmbeddedProfileFromFile(f)
          .then((p) => {
            if (!live()) return
            setProfile(p ? { size: p.length, bytes: p } : { none: true })
            // A TIFF shows nothing unless a profile says what its values mean, so its own
            // embedded profile is the natural starting point — unless the user already picked
            // a pool profile while the scan was running.
            if (p && format === 'tiff') setAssignSel((s) => (s === 'none' ? 'embedded' : s))
          })
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

  const assign = useMemo(() => {
    if (assignSel === 'embedded' && profile?.bytes) {
      return { key: 'embedded', label: t('hdr_assigned_embedded') || 'embedded profile', bytes: profile.bytes }
    }
    const e = hdrProfiles.find((p) => p.id === assignSel)
    return e ? { key: e.id, label: e.filename, bytes: e.bytes } : null
  }, [assignSel, profile, hdrProfiles, t])

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
        {t('hdr_intro') || 'View one HDR image on this display. Files the browser can decode are shown by the browser itself; OpenEXR and Radiance HDR are decoded and rendered by profiletool.'}
      </p>

      <input ref={inputRef} type="file" hidden
             accept=".exr,.hdr,.pic,.rgbe,.avif,.heic,.heif,.jxl,.jpg,.jpeg,.png,.tif,.tiff,image/*"
             onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />

      {!file ? (
        <div className={styles.drop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}>
          <div className={styles.dropTitle}>{t('hdr_drop') || 'Drop an HDR image here, or click to choose one'}</div>
          <div className={styles.dropFormats}>{t('hdr_formats') || 'OpenEXR, Radiance HDR (.hdr), AVIF, JPEG (including gain-map JPEG), PNG — and HEIC on Safari.'}</div>
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
          <button type="button" className={styles.disclosure} aria-expanded={detailsOpen} data-hdr-details-toggle=""
                  onClick={() => setDetailsOpen(!detailsOpen)}>
            <span aria-hidden="true">{detailsOpen ? '▾' : '▸'}</span> {t('hdr_details') || 'Image details'}
          </button>
          {/* Profile, assignment and gain map here; the route's own facts follow inside
              RouteBody and fold with them, so the section reads as one block. */}
          {detailsOpen && (
            <>
              <ProfileRow t={t} info={info} profile={profile} onOpen={() => onOpenInProfile?.(file)} />
              {info.kind === FileKind.IMAGE && ASSIGNABLE.has(info.format) && (
                <AssignRow t={t} value={assign ? assignSel : 'none'} onChange={setAssignSel} profile={profile} hdrProfiles={hdrProfiles}
                           linearOnly={LINEAR_LIGHT.has(info.format)} formatLabel={FORMATS[info.format]?.label || info.format} />
              )}
              {gain?.present && <GainRow t={t} gain={gain} />}
            </>
          )}
          <RouteBody key={`${file.name}:${file.size}:${file.lastModified}`} t={t} file={file} info={info} profile={profile} gain={gain} live={live} assign={assign} detailsOpen={detailsOpen} />
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
  if (LINEAR_LIGHT.has(format)) {
    const cap = capabilityFor(format, env)
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
  else if (info.format === 'hdr') value = t('hdr_profile_hdr') || 'none — Radiance HDR states colour through its PRIMARIES header'
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

function RouteBody({ t, file, info, profile, gain, live, assign, detailsOpen }) {
  const env = info.env
  // An assigned profile takes over interpretation of the pixels, so the file goes through
  // profiletool's own decode and the CMM whatever the browser could have done with it.
  if (assign && info.kind === FileKind.IMAGE && ASSIGNABLE.has(info.format)) {
    return <PixelRoute key={`assign:${assign.key}`} t={t} file={file} info={info} env={env} live={live} assign={assign} detailsOpen={detailsOpen} />
  }
  if (info.route === 'notImage') {
    return <p className={styles.note}>{t('hdr_not_image') || 'That is not an image. Load profiles through the Profiles pane.'}</p>
  }
  if (info.route === 'unknown') {
    return <p className={styles.note}>{t('hdr_unknown') || 'Not an image format profiletool recognises.'}</p>
  }
  if (info.route === 'tiff') {
    return (
      <p className={styles.note}>
        {t('hdr_tiff') || 'TIFF pixels are not shown here yet: browsers do not decode TIFF, and how HDR is encoded in a 16-bit TIFF is still undecided (Phase 4.3). Its embedded profile can be inspected.'}{' '}
        {t('hdr_tiff_assign') || 'To interpret its values, assign a profile above.'}
      </p>
    )
  }
  if (info.route === 'refused') {
    return (
      <p className={styles.note}>
        <strong>{t('hdr_cannot_display') || 'Cannot display this image here:'}</strong> {reasonText(info.why, t)}.{' '}
        {t('hdr_inspect_still') || 'Its embedded profile can still be inspected.'}
      </p>
    )
  }
  if (info.route === 'img') return <ImgRoute t={t} file={file} info={info} env={env} profile={profile} gain={gain} live={live} detailsOpen={detailsOpen} />
  return <PixelRoute t={t} file={file} info={info} env={env} live={live} detailsOpen={detailsOpen} />
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

function ImgRoute({ t, file, info, env, profile, gain, live, detailsOpen }) {
  // Merge the LIVE display into the page's capabilities, so the HDR verdict follows the
  // window. NO_HDR_DISPLAY is left to the display-specific notes below, which say more.
  const envLive = useMemo(() => ({ ...env, display: { ...env.display, ...live.display } }), [env, live.display])
  const hdrCap = capabilityFor(info.format, envLive).hdr
  const hdrWhy = hdrCap.ok || hdrCap.code === 'NO_HDR_DISPLAY' ? null : hdrCap
  const dpk = displayPeakInfo({ hdr: envLive.display.hdr, headroomStops: live.screen?.headroom })
  const refPref = useRefWhitePref()
  const [nat, setNat] = useState(null)          // the image's natural size, once loaded
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
      {detailsOpen && <Facts t={t} env={env} rows={[
        [t('hdr_route') || 'Shown by', t('hdr_route_img') || 'the browser'],
        [t('hdr_display') || 'HDR display', tri(envLive.display.hdr, t)],
        [t('hdr_display_peak') || 'Display peak', <DisplayPeak t={t} dpk={dpk} live={live} />],
      ]} />}
      {hdrWhy && <p className={styles.note}>{reasonText(hdrWhy, t)}.</p>}
      {envLive.display.hdr === false && support.drl && (
        <p className={styles.note}>{t('hdr_sdr_display_img') || 'This display reports no HDR, so the browser shows this image in SDR at either end.'}</p>
      )}
      {iccOnly && <p className={styles.note}>{t('hdr_icc_only') || 'Browsers ignore HDR that is signalled only by an embedded ICC profile, so this image may look dim and flat.'}</p>}
      {/* Fit to display is shown but unavailable on this route: CSS dynamic-range-limit offers
          the SDR end, the HDR end and a blend, but no "cap at N× SDR white". */}
      {support.drl
        ? <RangeControl t={t} share={share} setShare={setShare} blend={support.mix} fitReason={fitOffImg(t)} />
        : (
          <>
            <p className={styles.note}>{t('hdr_no_drl') || 'This browser cannot switch an image between SDR and HDR, so it is shown as the browser renders it.'}</p>
            <div className={styles.range}>
              <span className={styles.rangeLabel}>{t('hdr_range') || 'Dynamic range'}</span>
              <FitButton t={t} reason={fitOffImg(t)} />
            </div>
          </>
        )}
      <RefWhiteBar t={t} pref={refPref} />
      {failed
        ? <p className={styles.error}>{t('hdr_img_failed') || 'The browser could not decode this image.'}</p>
        : (
          <HdrViewport t={t} contentW={nat?.w} contentH={nat?.h}
                       overlay={({ viewportRef, tick }) => <RefWhitePatch t={t} viewerRef={viewportRef} targetRef={imgRef} pref={refPref} tick={tick} />}>
            {(style) => url && (
              <img ref={imgRef} src={url} alt={file.name} className={styles.image} style={style} draggable={false}
                   onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                   onError={() => setFailed(true)} />
            )}
          </HdrViewport>
        )}
    </>
  )
}

const fitOffImg = (t) => t('hdr_fit_off_img') || 'not available — the browser renders this image and cannot cap it at a set peak'
const fitOffPeak = (t) => t('hdr_fit_off_peak') || 'not available — this display’s peak is not known'

// ── route 'pixels' ───────────────────────────────────────────────────────────
function PixelRoute({ t, file, info, env, live, assign, detailsOpen }) {
  // Merge the LIVE display into the page's capabilities, so the HDR verdict follows the
  // window. NO_HDR_DISPLAY is left to the display-specific notes below, which say more.
  const envLive = useMemo(() => ({ ...env, display: { ...env.display, ...live.display } }), [env, live.display])
  const hdrCap = capabilityFor(info.format, envLive).hdr
  const hdrWhy = hdrCap.ok || hdrCap.code === 'NO_HDR_DISPLAY' ? null : hdrCap
  const dpk = displayPeakInfo({ hdr: envLive.display.hdr, headroomStops: live.screen?.headroom })
  const refPref = useRefWhitePref()
  const [decoded, setDecoded] = useState(null)
  // Three errors, kept apart because they end differently. A decode failure leaves nothing to
  // show. An apply failure (one target, one policy) and a draw failure must not unmount the
  // canvas: the next target or backend may well succeed, and the surface belongs to that canvas.
  const [decodeError, setDecodeError] = useState(null)
  const [applyError, setApplyError] = useState(null)
  const [drawError, setDrawError] = useState(null)
  // Effects read the current translator here rather than re-running when it changes.
  const tRef = useRef(t)
  tRef.current = t
  // The previous frame's RGBA buffer, reused while the size holds (renderFloatRgba `out`).
  const frameBuf = useRef(null)
  const [kind, setKind] = useState(null)          // backend being tried / in use
  const [surface, setSurface] = useState(null)
  const [fallbacks, setFallbacks] = useState([])
  const [exposure, setExposure] = useState(0)
  const [share, setShare] = useState(1)
  const [peak, setPeak] = useState(null)
  const canvasRef = useRef(null)
  // Assigned-profile state: target headroom in stops (the CMM hint takes 2^stops), the
  // tone-mapping policy, and what the CMM reported it engaged.
  const [targetStops, setTargetStops] = useState(() => (dpk.stops != null ? clampStops(dpk.stops) : 0))
  // Seeded from the display's headroom. The live monitor often reports it only after mount, so
  // the first value to arrive is taken too — once, and never after the user has moved the control.
  const stopsChosen = useRef(dpk.stops != null)
  useEffect(() => {
    if (!stopsChosen.current && dpk.stops != null) { stopsChosen.current = true; setTargetStops(clampStops(dpk.stops)) }
  }, [dpk.stops])
  const setStopsByUser = useCallback((v) => { stopsChosen.current = true; setTargetStops(v) }, [])
  const [policy, setPolicy] = useState(HDR_POLICY.auto)
  const [cmmInfo, setCmmInfo] = useState(null)
  const [applying, setApplying] = useState(false)
  // Float images under a Linear-transfer profile: what a file value of 1.0 means. 'refwhite'
  // (default) = the profile's HDR reference white, the OpenEXR / Radiance convention that 1.0
  // is SDR white; 'nits' = 1 cd/m², as ICC.1 clause 8.10.2 a) reads a Linear value.
  const [linearScale, setLinearScaleState] = useState(() => (store.get(LINEAR_SCALE_KEY) === 'nits' ? 'nits' : 'refwhite'))
  const setLinearScale = (v) => { setLinearScaleState(v); store.set(LINEAR_SCALE_KEY, v) }

  // Decode once per file. EXR (WASM) and Radiance HDR (JS) decode synchronously; a very
  // large file blocks the tab for the duration, which is acceptable for a one-image viewer.
  // Keyed on WHETHER a profile is assigned, not on the assignment object: that object is
  // rebuilt whenever the pool or the language changes, and each rebuild would decode the whole
  // image again. (PixelRoute is remounted per assigned profile, so the choice itself cannot
  // change under a mounted route.)
  const isRadiance = info.format === 'hdr'
  const assigned = !!assign
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        // Same result shape either way: 3-channel float samples plus optional chromaticities.
        const d = isRadiance ? decodeRadiance(bytes) : await decodeImage(bytes)
        if (d?.ok === false) throw new Error(d.error || 'decode failed')
        if (assigned) {
          // The profile interprets the raw values: decode to [0,1] device RGB and let the
          // transform effect below produce display-linear pixels.
          if (d.channels !== 3) throw new Error(tRef.current('hdr_assign_channels') || 'Assigning a profile needs a 3-channel RGB image.')
          const src = samplesToUnitFloat(d)
          if (dead) return
          setDecoded({ w: d.width, h: d.height, src, rgb: null, primaries: null, matrix: null, compression: d.compression, isFloat: d.sampleFormat === 'float' })
          setKind(hdrPathway(env) || 'sdr')
          return
        }
        if (d.sampleFormat !== 'float' || d.channels !== 3) throw new Error('expected 3-channel float samples')
        // The decoder's own float array, or a view of its bytes — copied only if misaligned.
        const rgb = floatSamples(d)
        const primaries = normalizeChromaticities(d.chromaticities)
        if (dead) return
        setDecoded({ w: d.width, h: d.height, rgb, primaries, matrix: toSrgbLinearMatrix(primaries), compression: d.compression })
        setKind(hdrPathway(env) || 'sdr')
      } catch (e) {
        if (!dead) setDecodeError(e.message || String(e))
      }
    })()
    return () => { dead = true }
  }, [file, env, assigned, isRadiance])

  // Assigned profile: run the pixels through the CMM whenever the target or policy changes.
  // Debounced, and a superseded request is CANCELLED, not just ignored: `isStale` stops it
  // before its session starts (if it is still queued behind another) and between chunks, so
  // dragging the slider never leaves full-image passes running for results nobody will see.
  // Keyed on the profile's bytes, not the assignment object (see the decode effect).
  const assignBytes = assign?.bytes
  const srcRef = decoded?.src
  useEffect(() => {
    if (!assignBytes || !srcRef) return
    let dead = false
    const isStale = () => dead
    const id = setTimeout(async () => {
      setApplying(true)
      setApplyError(null)
      try {
        const opts = { profileBytes: assignBytes, targetHeadroom: 2 ** targetStops, policy, isStale }
        let inputScale = null
        if (decoded.isFloat) {
          // One pixel first: the transfer and reference white come from the CMM itself, and a
          // refusal should not cost a whole-image pass.
          const probe = await hdrTransformPixels({ ...opts, rgb: new Float32Array(3), nPixels: 1 })
          if (dead) return
          // Float samples (OpenEXR, Radiance HDR) are linear light; a PQ/HLG profile would
          // decode them as code values.
          if (probe.info.transfer !== 8) {
            setApplyError((tRef.current('hdr_assign_exr_linear') || '{format} holds linear light, so it needs a profile whose transfer is Linear (8).')
              .replace('{format}', FORMATS[info.format]?.label || 'OpenEXR'))
            return
          }
          // The profile's Linear EOTF takes 1.0 as 1 cd/m² and divides by the reference white,
          // so an unscaled OpenEXR (1.0 = SDR white) lands near black. Scaling by that white
          // first puts file 1.0 on it — unless the user chose the clause's own reading.
          const w = probe.info.referenceWhite
          inputScale = linearScale === 'refwhite' && w > 0 ? w : 1
        }
        // The scale is applied chunk by chunk inside the transform: no full-size scaled copy.
        const { rgb, info: ci } = await hdrTransformPixels({ ...opts, rgb: srcRef, nPixels: decoded.w * decoded.h, inputScale: inputScale ?? 1 })
        if (dead) return
        setCmmInfo({ ...ci, inputScale })
        setDecoded((d) => (d && d.src === srcRef ? { ...d, rgb } : d))
      } catch (e) {
        if (!dead && e?.name !== 'StaleTransformError') setApplyError(e.message || String(e))
      } finally {
        if (!dead) setApplying(false)
      }
    }, 120)
    return () => { dead = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignBytes, srcRef, targetStops, policy, linearScale])

  // Step down the backend chain from `from`, recording why. The WebGPU step is skipped when the
  // environment already knows it has no adapter. Used for a backend that cannot be created, one
  // whose draw throws, and one that reports a failure later (WebGPU validation, device loss).
  const fallBack = useCallback((from, why) => {
    let next = FALLBACK[from]
    if (next === 'webgpu' && !env.pathway?.webgpu) next = 'sdr'
    setFallbacks((f) => [...f, { from, why }])
    setSurface(null)
    setKind(next)
    if (!next) setDrawError(why)     // the SDR canvas was the last resort
  }, [env])

  // Create the surface for `kind`.
  useEffect(() => {
    if (!kind || !canvasRef.current) return
    let dead = false
    let made = null
    createHdrSurface(canvasRef.current, kind, { onError: (why) => { if (!dead) fallBack(kind, why) } })
      .then((s) => { if (dead) { s.dispose(); return } made = s; setSurface(s) })
      .catch((e) => { if (!dead) fallBack(kind, e.message || String(e)) })
    return () => { dead = true; made?.dispose() }
  }, [kind, fallBack])

  // Draw, throttled to one frame: slider drags would otherwise queue full-image passes. The
  // RGBA buffer is reused across frames, so a drag does not allocate a full image per step.
  const limitStops = surface?.hdr ? share * MAX_LIMIT_STOPS : 0
  useEffect(() => {
    if (!surface || !decoded?.rgb) return
    const id = requestAnimationFrame(() => {
      let frame
      try {
        frame = renderFloatRgba(decoded.rgb, decoded.w, decoded.h, { exposureStops: exposure, limitStops, matrix: decoded.matrix, out: frameBuf.current })
        frameBuf.current = frame.rgba
      } catch (e) { setDrawError(e.message || String(e)); return }
      try {
        surface.draw(frame.rgba, decoded.w, decoded.h)
        setPeak(frame.peak)
        setDrawError(null)
      } catch (e) {
        // This backend cannot draw this image (e.g. beyond the GPU's texture limit): the next
        // one may, so step down rather than replace the viewer with an error.
        if (surface.kind !== 'sdr') fallBack(surface.kind, e.message || String(e))
        else setDrawError(e.message || String(e))
      }
    })
    return () => cancelAnimationFrame(id)
  }, [surface, decoded, exposure, limitStops, fallBack])

  if (decodeError) return <p className={styles.error}>{t('hdr_decode_failed') || 'Could not decode:'} {decodeError}</p>
  if (!decoded) return <p className={styles.note}>{t('hdr_decoding') || 'Decoding…'}</p>
  // No early return while an assigned profile is still being applied: the <canvas> must be
  // mounted when `kind` is set, or the surface is never created (the effect does not re-run
  // when the element appears later). TargetControl shows the "Applying" state meanwhile.

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
      {detailsOpen && <Facts t={t} env={env} rows={[
        [t('hdr_route') || 'Shown by', t('hdr_route_pixels') || 'profiletool'],
        [t('hdr_surface') || 'Output', surface ? surfaceLabel[surface.kind] : (t('hdr_checking') || 'checking…')],
        [t('hdr_display') || 'HDR display', tri(envLive.display.hdr, t)],
        [t('hdr_display_peak') || 'Display peak', <DisplayPeak t={t} dpk={dpk} live={live} />],
        [t('hdr_size') || 'Size', `${decoded.w}×${decoded.h}${decoded.compression ? ` · ${decoded.compression}` : ''}`],
        // Three significant figures below 10×: a "file 1.0 = 1 cd/m²" reading can put the peak at
        // a few hundredths, where two decimals would round it to a meaningless 0.02.
        [t('hdr_peak') || 'Brightest pixel', peak == null ? '…' : (t('hdr_peak_value') || '{n}× SDR white').replace('{n}', String(peak >= 10 ? +peak.toFixed(1) : +peak.toPrecision(3)))],
        ...(assign ? assignFacts(t, assign, cmmInfo) : [[t('hdr_chromaticities') || 'Chromaticities',
          // No matrix means either "already Rec. 709" or "these primaries form no colour space";
          // the second must not be labelled as the first.
          p ? `R ${p.red.join(', ')} · G ${p.green.join(', ')} · B ${p.blue.join(', ')} · W ${p.white.join(', ')}${decoded.matrix ? ''
              : isRec709Primaries(p) ? ' (Rec. 709)' : ` ${t('hdr_chroma_degenerate') || '(these primaries do not define a colour space — ignored, Rec. 709 used)'}`}`
            : (t('hdr_chroma_default') || 'not stated — Rec. 709 assumed')]]),
      ]} />}
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
        {assign && (
          <TargetControl t={t} stops={targetStops} setStops={setStopsByUser} policy={policy} setPolicy={setPolicy}
                         displayStops={dpk.stops} applying={applying} />
        )}
        {assign && decoded.isFloat && (
          <>
            <label className={styles.slider}>
              <span>{t('hdr_linear_scale') || 'Linear values'}</span>
              <select className={styles.select} value={linearScale} onChange={(e) => setLinearScale(e.target.value)}
                      aria-label={t('hdr_linear_scale') || 'Linear values'}>
                <option value="refwhite">{t('hdr_linear_refwhite') || 'File 1.0 = HDR reference white'}</option>
                <option value="nits">{t('hdr_linear_nits') || 'File 1.0 = 1 cd/m² (ICC.1 clause 8.10.2 a)'}</option>
              </select>
            </label>
            <p className={styles.note}>{t('hdr_linear_help') || 'OpenEXR and Radiance HDR files conventionally put SDR white at 1.0, while an ICC Linear transfer reads 1.0 as 1 cd/m². The default scales the file so its 1.0 lands on the profile’s HDR reference white.'}</p>
          </>
        )}
        {surface?.hdr && (
          <RangeControl t={t} share={share} setShare={setShare} blend readout={readout}
                        onFit={fit != null ? () => setShare(fit) : null}
                        fitActive={fit != null && Math.abs(share - fit) < 0.005}
                        fitReason={fitOffPeak(t)} />
        )}
        {/* An SDR output has no range to limit, so no slider — but Fit to display stays in
            view, unavailable, so its absence is explained rather than silent. */}
        {surface && !surface.hdr && (
          <div className={styles.range}>
            <span className={styles.rangeLabel}>{t('hdr_range') || 'Dynamic range'}</span>
            <FitButton t={t} reason={t('hdr_fit_off_sdr') || 'not available — this output shows nothing above SDR white'} />
          </div>
        )}
        <label className={styles.slider}>
          <span>{t('hdr_exposure') || 'Exposure'}</span>
          <input type="range" min={-4} max={4} step={0.1} value={exposure}
                 onChange={(e) => setExposure(Number(e.target.value))} aria-label={t('hdr_exposure') || 'Exposure'} />
          <span className={styles.sliderValue}>{(t('hdr_stops_value') || '{n} stops').replace('{n}', (exposure > 0 ? '+' : '') + exposure.toFixed(1))}</span>
        </label>
      </div>

      {applyError && <p className={styles.error} data-hdr-apply-error="">{t('hdr_apply_failed') || 'Could not apply the profile:'} {applyError}</p>}
      {drawError && <p className={styles.error} data-hdr-draw-error="">{t('hdr_draw_failed') || 'Could not draw the image:'} {drawError}</p>}
      <RefWhiteBar t={t} pref={refPref} />
      <HdrViewport t={t} contentW={decoded.w} contentH={decoded.h}
                   overlay={({ viewportRef, tick }) => <RefWhitePatch t={t} viewerRef={viewportRef} targetRef={canvasRef} pref={refPref} tick={tick} />}>
        {(style) => <canvas key={kind} ref={canvasRef} className={styles.image} style={style} data-surface={surface?.kind || ''} />}
      </HdrViewport>
    </>
  )
}

// Fit to display, always in view. With no `onFit` it is disabled and `reason` says why, next
// to it — a disabled button's tooltip does not show in every browser.
function FitButton({ t, onFit, active, reason }) {
  const off = !onFit
  return (
    <>
      <button type="button" className={active && !off ? styles.fitOn : styles.btn} aria-pressed={!off && !!active}
              disabled={off} onClick={onFit || undefined} data-fit-state={off ? 'off' : 'on'}
              title={off ? reason : (t('hdr_fit_help') || 'Caps brightness at the peak this display reports. On Windows that figure can lag behind brightness changes.')}>
        {t('hdr_fit') || 'Fit to display'}
      </button>
      {off && reason && <span className={styles.muted} data-fit-reason="">{reason}</span>}
    </>
  )
}

// SDR | HDR buttons plus, where a blend exists, a slider between them. `share` 0 = SDR.
function RangeControl({ t, share, setShare, blend, readout, onFit, fitActive, fitReason }) {
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
      {(onFit || fitReason) && <FitButton t={t} onFit={onFit} active={fitActive} reason={fitReason} />}
    </div>
  )
}

// ── assigned profile ─────────────────────────────────────────────────────────
function AssignRow({ t, value, onChange, profile, hdrProfiles, linearOnly, formatLabel }) {
  // Pooled HDR Profiles, split by transfer exactly as the Profiles pane groups them.
  // OpenEXR and Radiance HDR store linear light, so they are offered only the Linear group; the note says why
  // the rest are missing and where they are, instead of leaving a silently shorter list.
  const linear = hdrProfiles.filter((p) => p.transfer === 'Linear')
  const nonLinear = hdrProfiles.filter((p) => p.transfer !== 'Linear')
  return (
    <>
      <div className={styles.fact}>
        <span className={styles.factLabel}>{t('hdr_assign') || 'Assign profile'}</span>
        <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}
                aria-label={t('hdr_assign') || 'Assign profile'}>
          <option value="none">{t('hdr_assign_none') || 'None — use what the file signals'}</option>
          {profile?.size > 0 && (
            <option value="embedded">{(t('hdr_assign_embedded') || 'Embedded profile ({n} B)').replace('{n}', profile.size.toLocaleString())}</option>
          )}
          {linear.length > 0 && (
            <optgroup label={t('hdr_assign_pool_linear') || 'HDR Profiles — Linear transfer'}>
              {linear.map((p) => <option key={p.id} value={p.id}>{p.filename}</option>)}
            </optgroup>
          )}
          {!linearOnly && nonLinear.length > 0 && (
            <optgroup label={t('hdr_assign_pool_nonlinear') || 'HDR Profiles — PQ / HLG transfer'}>
              {nonLinear.map((p) => <option key={p.id} value={p.id}>{`${p.filename} (${p.transfer})`}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      {linearOnly && (
        <p className={styles.note} data-assign-note="exr">
          {(t('hdr_assign_exr_only') || '{format} holds linear light, so only HDR Profiles with a Linear transfer can be assigned.').replace('{format}', formatLabel)}{' '}
          {nonLinear.length > 0
            ? (t('hdr_assign_exr_hidden') || '{n} PQ/HLG HDR Profile(s) in the pool are not offered — the Profiles pane lists them under HDR Profiles › Non-linear transfer.').replace('{n}', String(nonLinear.length))
            : linear.length === 0
              ? (t('hdr_assign_exr_none') || 'There is no Linear-transfer HDR Profile in the pool yet; the Profiles pane groups HDR Profiles by transfer.')
              : ''}
        </p>
      )}
    </>
  )
}

const TRANSFER_NAMES = { 8: 'Linear', 16: 'PQ', 18: 'HLG' }

// What the CMM reported: which path it built and whether the gain curve changed anything —
// two separate claims, stated separately.
function assignFacts(t, assign, ci) {
  const path = !ci ? '…'
    : ci.hdrPath ? (ci.toneMapping ? (t('hdr_cmm_hdr_tm') || 'HDR path, gain curve applied') : (t('hdr_cmm_hdr') || 'HDR path, no gain curve'))
    : (t('hdr_cmm_baked') || 'Baked AToB0 — not the HDR path')
  return [
    [t('hdr_assigned') || 'Profile', assign.label],
    [t('hdr_cmm_path') || 'Colour engine path', path],
    [t('hdr_transfer') || 'Transfer', ci ? (TRANSFER_NAMES[ci.transfer] || '—') : '…'],
    [t('hdr_ref_white_cd') || 'HDR reference white', ci && ci.referenceWhite > 0 ? `${+ci.referenceWhite.toFixed(1)} cd/m²` : '…'],
    // Float images only: the factor applied before the CMM (null for integer images).
    ...(ci && ci.inputScale != null ? [[t('hdr_linear_fact') || 'Input scale',
      ci.inputScale !== 1
        ? (t('hdr_linear_fact_ref') || '×{w} — file 1.0 = reference white').replace('{w}', String(+ci.inputScale.toFixed(1)))
        : (t('hdr_linear_fact_nits') || 'none — file 1.0 = 1 cd/m²')]] : []),
  ]
}

function TargetControl({ t, stops, setStops, policy, setPolicy, displayStops, applying }) {
  // Fit targets the display's headroom, within the slider's range: a display reporting more
  // than MAX_LIMIT_STOPS would otherwise set a value the slider cannot show.
  const fitStops = displayStops != null ? clampStops(displayStops) : null
  const fitActive = fitStops != null && Math.abs(stops - fitStops) < 0.005
  return (
    <>
      <div className={styles.range}>
        <span className={styles.rangeLabel}>{t('hdr_target') || 'Target headroom'}</span>
        <input type="range" min={0} max={MAX_LIMIT_STOPS} step={0.05} value={stops}
               onChange={(e) => setStops(Number(e.target.value))} aria-label={t('hdr_target') || 'Target headroom'} />
        <span className={styles.sliderValue}>
          {(t('hdr_target_value') || '{r}× reference white ({n} stops)').replace('{r}', (2 ** stops).toFixed(2)).replace('{n}', stops.toFixed(2))}
        </span>
        <FitButton t={t} onFit={fitStops != null ? () => setStops(fitStops) : null} active={fitActive} reason={fitOffPeak(t)} />
        {applying && <span className={styles.muted}>{t('hdr_applying') || 'Applying the profile…'}</span>}
      </div>
      <label className={styles.slider}>
        <span>{t('hdr_policy') || 'Tone mapping'}</span>
        <select className={styles.select} value={policy} onChange={(e) => setPolicy(Number(e.target.value))}
                aria-label={t('hdr_policy') || 'Tone mapping'}>
          <option value={HDR_POLICY.auto}>{t('hdr_policy_auto') || 'Auto (clause 8.10.3 ranking)'}</option>
          <option value={HDR_POLICY.hagc}>{t('hdr_policy_hagc') || 'Gain curve (HAGC)'}</option>
          <option value={HDR_POLICY.lut}>{t('hdr_policy_lut') || 'Baked SDR fallback (AToB0)'}</option>
          <option value={HDR_POLICY.off}>{t('hdr_policy_off') || 'Off — as a pre-amendment CMM'}</option>
        </select>
      </label>
    </>
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

// `tick` changes when the image is zoomed, panned or the view resized — none of which a
// ResizeObserver sees (a transform does not change layout size) — so a docked patch follows.
function RefWhitePatch({ t, viewerRef, targetRef, pref, tick }) {
  const [box, setBox] = useState(null)       // { left, top } in viewer content px
  const drag = useRef(null)

  // Where the patch goes: docked (image's right edge, top-aligned, kept inside the viewer)
  // or the stored fraction of the free space. Recomputed whenever the viewer or image resizes.
  const place = useCallback(() => {
    const vp = viewerRef.current
    if (!vp) return
    // clientWidth, not scrollWidth: the view does not scroll, and a zoomed image's transformed
    // box would otherwise count as scrollable overflow and push the patch out of sight.
    const freeW = Math.max(0, vp.clientWidth - PATCH)
    const freeH = Math.max(0, vp.clientHeight - PATCH - 16)
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

  useEffect(() => { if (pref.on) place() }, [tick, pref.on, place])

  if (!pref.on || !box) return null

  const commit = (left, top) => {
    const vp = viewerRef.current
    if (!vp) return
    const freeW = Math.max(1, vp.clientWidth - PATCH)
    const freeH = Math.max(1, vp.clientHeight - PATCH - 16)
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
