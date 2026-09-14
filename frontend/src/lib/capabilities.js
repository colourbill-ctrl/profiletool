// (c) 2026 William Li
//
// THE SINGLE SOURCE OF TRUTH for what this environment is allowed to do with each image
// format. Both the UI gating and the Environment panel read it, so what the user is told
// and what the code permits cannot drift apart — a binding constraint of DL-HDRENV1.
//
// PURE. Takes an environment object (from environment.js) and returns a verdict. No DOM,
// no globals, no I/O — which is what lets the decision logic be tested exhaustively in
// Node against synthetic environments, including ones nobody here has hardware for.
//
// THREE CAPABILITIES, NOT ONE. Conflating them is what makes "do we support HEIC?"
// unanswerable:
//
//   inspect  read the embedded ICC profile, validate it, show its tags and curves.
//            Needs a container parse, NOT a codec. True for every format, everywhere —
//            except JPEG XL, whose profile is compressed inside the codestream.
//   display  put the pixels on screen at all, even tone-mapped to SDR.
//   hdr      render brighter-than-white. Needs display + an HDR screen + an HDR canvas.
//
// A browser that cannot decode HEIC still inspects it completely. That is a useful state
// and the UI must present it as one, not as a failure.

/** Formats profiletool knows about, and who decodes them. */
export const FORMATS = {
  icc:  { label: 'ICC profile', decoder: 'ours' },
  tiff: { label: 'TIFF',        decoder: 'ours' },
  png:  { label: 'PNG',         decoder: 'ours' },
  jpeg: { label: 'JPEG',        decoder: 'ours' },
  exr:  { label: 'OpenEXR',     decoder: 'ours' },
  hdr:  { label: 'Radiance HDR', decoder: 'ours' },   // RGBE, decoded in JS (radianceHdr.js)
  avif: { label: 'AVIF',        decoder: 'browser' },
  heic: { label: 'HEIC/HEIF',   decoder: 'browser' },
  jxl:  { label: 'JPEG XL',     decoder: 'browser' },
}

// Reason codes. The UI turns these into sentences; keeping them as codes means the
// gating and the explanation cannot disagree about WHY something was refused.
export const REASON = {
  OURS: 'decoded by profiletool itself, so browser-independent',
  BROWSER_YES: 'this browser decodes it',
  BROWSER_NO: 'this browser does not decode it',
  HEIC_SAFARI_ONLY: 'HEIC display needs Safari or another WebKit browser — Chrome and Firefox decode HEIC on no platform, macOS included',
  JXL_SAFARI_ONLY: 'JPEG XL display needs Safari; other browsers have not shipped it',
  DEFERRED: 'deferred — see Phase 4 in hdr-phase1-status.md',
  NO_HDR_DISPLAY: 'this display reports no HDR path, so HDR renders tone-mapped to SDR',
  NO_HDR_PATHWAY: 'this browser exposes no HDR canvas path (needs float16 canvas or WebGPU)',
  FIREFOX_NO_HDR: 'Firefox renders no HDR images and reads no gain maps; HDR content is shown as SDR',
  INSPECT_ALWAYS: 'inspection needs a container parse, not a codec',
  JXL_NO_INSPECT: 'a JPEG XL profile is compressed inside the codestream, which profiletool does not decompress yet',
  HDR_OK: 'HDR display and an HDR canvas path are both available',
  UNKNOWN_FORMAT: 'unknown format',
}

// Every verdict carries `code` — the REASON key — alongside the English `why`. The UI
// translates by code (i18n key `cap_<code lowercased>`); `why` stays for tests, logs and a
// missing translation. Adding a REASON means adding its `cap_` key in all 12 locales.
const verdict = (ok, code) => ({ ok, why: REASON[code], code })

// Does the browser decode this format? Prefers the direct probe; falls back to engine
// knowledge only where the probe does not exist.
//
// The fallback is the careful part. `null` from ImageDecoder means "could not ask", NOT
// "no" — Safari ships no ImageDecoder at all, and collapsing null to false would tell
// Safari users they cannot open HEIC, which is exactly backwards.
function browserDecodes(format, env) {
  const probed = env.decode?.[format]
  if (probed === true) return verdict(true, 'BROWSER_YES')
  if (probed === false) return verdict(false, 'BROWSER_NO')

  // No probe available — decide from the engine.
  switch (format) {
    case 'avif':
      // Every current engine decodes AVIF; treat absence of a probe as support and let
      // an actual decode failure surface normally rather than pre-emptively refusing.
      return verdict(true, 'BROWSER_YES')
    case 'heic':
      return env.webkitEngine ? verdict(true, 'BROWSER_YES') : verdict(false, 'HEIC_SAFARI_ONLY')
    case 'jxl':
      return env.webkitEngine ? verdict(true, 'BROWSER_YES') : verdict(false, 'JXL_SAFARI_ONLY')
    default:
      return verdict(false, 'BROWSER_NO')
  }
}

/**
 * What can this environment do with this format?
 * @returns {{inspect:{ok,why}, display:{ok,why}, hdr:{ok,why}}}
 */
export function capabilityFor(format, env) {
  const spec = FORMATS[format]
  if (!spec) {
    const no = verdict(false, 'UNKNOWN_FORMAT')
    return { inspect: no, display: no, hdr: no }
  }

  // INSPECT is unconditional. Every format here is parsed by our own WASM — including
  // HEIC and AVIF, whose ICC profile is reached by walking ISOBMFF boxes with no codec.
  // The one exception is JPEG XL, whose ICC profile is Brotli-compressed inside the codestream
  // rather than sitting in a container box — so its row must not claim inspection.
  const inspect = format === 'jxl' ? verdict(false, 'JXL_NO_INSPECT') : verdict(true, 'INSPECT_ALWAYS')

  const display = spec.decoder === 'ours'
    ? verdict(true, 'OURS')
    : browserDecodes(format, env)

  // HDR needs all three: the pixels, an HDR display, and a canvas path that carries
  // values above 1.0. Report the FIRST missing one, so the user gets the thing they
  // could actually change rather than a list.
  let hdr
  if (!display.ok) hdr = { ...display }
  else if (env.browser === 'Firefox' && !env.webkitEngine) hdr = verdict(false, 'FIREFOX_NO_HDR')
  else if (env.display?.hdr === false) hdr = verdict(false, 'NO_HDR_DISPLAY')
  else if (!env.pathway?.float16Canvas && !env.pathway?.webgpu) hdr = verdict(false, 'NO_HDR_PATHWAY')
  else hdr = verdict(true, 'HDR_OK')

  return { inspect, display, hdr }
}

/** The whole matrix for this environment — what the Environment panel renders. */
export function capabilityMatrix(env) {
  const out = {}
  for (const f of Object.keys(FORMATS)) out[f] = capabilityFor(f, env)
  return out
}

/**
 * Which HDR canvas pathway to use, if any. panelapp's research prefers float16 canvas
 * (an SDR raster path with more bits, so surrounding view code is unchanged); WebGPU is
 * the unflagged fallback that costs a GPU context.
 */
export function hdrPathway(env) {
  if (env.pathway?.float16Canvas) return 'float16-canvas'
  if (env.pathway?.webgpu) return 'webgpu'
  return null
}

/**
 * A one-line summary for the UI header.
 * Deliberately mentions the DISPLAY as well as the browser: "Chrome on Windows" does not
 * tell a user why their HDR image looks flat, and the screen is the half they can change.
 */
export function environmentSummaryParts(env) {
  return { browser: env.browser, os: env.os, hdr: env.display?.hdr ?? null }
}

export function environmentSummary(env) {
  const name = `${env.browser} on ${env.os}`
  if (env.display?.hdr === true) return `${name} · HDR display detected`
  if (env.display?.hdr === false) return `${name} · SDR display`
  return name
}

// ── browser flags ────────────────────────────────────────────────────────────
//
// Which Chromium flags would unlock HDR capabilities this browser is not currently showing.
//
// A WEB PAGE CANNOT READ OR SET BROWSER FLAGS. So "enabled" here is INFERRED from the
// features a flag unlocks, not read from chrome://flags. That is also why a state can be
// null: when no signal is observable, the honest answer is "cannot tell". And a page cannot
// open a flags page either — links, location.href and window.open to chrome:// are all
// refused ("Not allowed to load local resource", measured in Chromium 149) — so the UI
// offers the address to copy rather than a link.
//
// Only one flag is listed because only one matters: both HDR features we use are Blink
// "experimental" runtime features (CanvasHDR, ScreenDetailedHdrHeadroom), and "experimental"
// status is enabled by exactly this switch in every channel, Stable included. Neither has an
// origin trial, so there is no way for the site to enable them for its visitors.
//
// Deliberately NOT listed: #avif-gainmap-hdr-images. It no longer exists in current
// Chromium's flags table, so telling a user to set it would send them looking for nothing.

const FLAGS_SCHEME = { Chrome: 'chrome', Edge: 'edge', Opera: 'opera', Brave: 'brave' }

/** Chromium desktop browsers have flag pages; anything on iOS is WebKit and has none. */
export function isChromiumBrowser(env) {
  return !env.webkitEngine && Object.prototype.hasOwnProperty.call(FLAGS_SCHEME, env.browser)
}

/**
 * @returns {Array<{id,label,url,enabled:boolean|null,unlocks:string[],severity:'required'|'recommended'}>}
 */
export function browserFlags(env) {
  if (!isChromiumBrowser(env)) return []
  const f16 = env.pathway?.float16Canvas
  const headroom = env.pathway?.screenHeadroom
  // Either observable effect proves the flag is on. With neither, the float16 probe is the
  // decisive one — it runs in any context, whereas the headroom check is null wherever
  // ScreenDetailed is not exposed.
  const enabled = (f16 === true || headroom === true) ? true : (f16 === false ? false : null)
  return [{
    id: 'enable-experimental-web-platform-features',
    label: 'Experimental Web Platform features',   // shown untranslated: chrome://flags is English-only
    url: `${FLAGS_SCHEME[env.browser]}://flags/#enable-experimental-web-platform-features`,
    enabled,
    unlocks: ['float16-canvas', 'screen-hdr-headroom'],
    // Without WebGPU the float16 canvas is the ONLY HDR route here, so the flag is needed
    // to render HDR at all. With WebGPU, HDR still renders; the flag adds the canvas route
    // and real screen headroom. Inspection needs neither — see capabilityFor().
    severity: env.pathway?.webgpu ? 'recommended' : 'required',
  }]
}

/** True when a listed flag is known to be off — what the panel highlights. */
export function flagsNeedAttention(env) {
  return browserFlags(env).some((f) => f.enabled === false)
}

// ── translation helpers (the only UI-facing functions here; `t` is useT()'s function) ──
/** A verdict's reason in the UI language, falling back to the English `why`. */
export function reasonText(v, t) {
  if (!v) return ''
  return (v.code && t('cap_' + v.code.toLowerCase())) || v.why || ''
}
