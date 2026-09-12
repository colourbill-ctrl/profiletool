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
//            Needs a container parse, NOT a codec. True for every format, everywhere.
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
}

// Does the browser decode this format? Prefers the direct probe; falls back to engine
// knowledge only where the probe does not exist.
//
// The fallback is the careful part. `null` from ImageDecoder means "could not ask", NOT
// "no" — Safari ships no ImageDecoder at all, and collapsing null to false would tell
// Safari users they cannot open HEIC, which is exactly backwards.
function browserDecodes(format, env) {
  const probed = env.decode?.[format]
  if (probed === true) return { ok: true, why: REASON.BROWSER_YES }
  if (probed === false) return { ok: false, why: REASON.BROWSER_NO }

  // No probe available — decide from the engine.
  switch (format) {
    case 'avif':
      // Every current engine decodes AVIF; treat absence of a probe as support and let
      // an actual decode failure surface normally rather than pre-emptively refusing.
      return { ok: true, why: REASON.BROWSER_YES }
    case 'heic':
      return env.webkitEngine
        ? { ok: true, why: REASON.BROWSER_YES }
        : { ok: false, why: REASON.HEIC_SAFARI_ONLY }
    case 'jxl':
      return env.webkitEngine
        ? { ok: true, why: REASON.BROWSER_YES }
        : { ok: false, why: REASON.JXL_SAFARI_ONLY }
    default:
      return { ok: false, why: REASON.BROWSER_NO }
  }
}

/**
 * What can this environment do with this format?
 * @returns {{inspect:{ok,why}, display:{ok,why}, hdr:{ok,why}}}
 */
export function capabilityFor(format, env) {
  const spec = FORMATS[format]
  if (!spec) {
    const no = { ok: false, why: 'unknown format' }
    return { inspect: no, display: no, hdr: no }
  }

  // INSPECT is unconditional. Every format here is parsed by our own WASM — including
  // HEIC and AVIF, whose ICC profile is reached by walking ISOBMFF boxes with no codec.
  const inspect = { ok: true, why: REASON.INSPECT_ALWAYS }

  const display = spec.decoder === 'ours'
    ? { ok: true, why: REASON.OURS }
    : browserDecodes(format, env)

  // HDR needs all three: the pixels, an HDR display, and a canvas path that carries
  // values above 1.0. Report the FIRST missing one, so the user gets the thing they
  // could actually change rather than a list.
  let hdr
  if (!display.ok) hdr = { ok: false, why: display.why }
  else if (env.browser === 'Firefox' && !env.webkitEngine) hdr = { ok: false, why: REASON.FIREFOX_NO_HDR }
  else if (env.display?.hdr === false) hdr = { ok: false, why: REASON.NO_HDR_DISPLAY }
  else if (!env.pathway?.float16Canvas && !env.pathway?.webgpu) hdr = { ok: false, why: REASON.NO_HDR_PATHWAY }
  else hdr = { ok: true, why: 'HDR display and an HDR canvas path are both available' }

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
export function environmentSummary(env) {
  const name = `${env.browser} on ${env.os}`
  if (env.display?.hdr === true) return `${name} · HDR display detected`
  if (env.display?.hdr === false) return `${name} · SDR display`
  return name
}
