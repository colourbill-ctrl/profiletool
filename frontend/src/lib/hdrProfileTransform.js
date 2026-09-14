// (c) 2026 William Li
//
// Apply an ASSIGNED ICC.1 clause 8.10 HDR Profile to decoded image pixels, through
// IccProfLib's own HDR CMM path (iccconstruct: hdrApplyBegin / hdrApplyChunk / hdrApplyEnd).
//
// WHAT THE CMM DOES (measured with iccApplyNamedCmm at iccDEV ac264764, and the same code path
// here): with a target headroom it builds CIccXformMatrixTrcHdr — the analytic EOTF the
// profile's cicpTag names, renormalised so 1.0 is the profile's HDR REFERENCE WHITE, then the
// HAGC gain curve at that headroom (policy permitting), then the colorant matrix. Float PCS
// keeps values above 1. Without a headroom (≤ 0) no hint is attached and the profile behaves
// exactly as it would in a pre-amendment CMM (its baked AToB0).
//
// WHY THE OUTPUT NEEDS NO NITS: the profile's HDR reference white is the level that belongs at
// the display's SDR white, and the hint's target headroom is expressed against that same
// white. So PCS Y maps one-to-one onto HdrSurface's "1.0 = SDR white", and Fit to display's
// peak ratio IS the target headroom.

import { loadConstruct, toError } from './pipelineEngine.js'
import { xyzD50ToSrgbLinearMatrix, applyMatrix3 } from './hdrPixels.js'

/** icHdrToneMapPolicy, in IccCmm.h order. */
export const HDR_POLICY = { auto: 0, hagc: 1, lut: 2, off: 3 }

// Pixels per chunk: bounds WASM memory (3 × 4 bytes × this, each way).
const CHUNK_PIXELS = 1_000_000

/**
 * @param {{profileBytes: Uint8Array, rgb: Float32Array, nPixels: number,
 *          targetHeadroom: number, policy?: number, intent?: number,
 *          onProgress?: (fraction:number)=>void}} o
 *   rgb: interleaved device RGB in [0, 1] (samplesToUnitFloat).
 *   targetHeadroom: linear ratio of peak to HDR reference white; ≤ 0 = no HDR hint.
 * @returns {Promise<{rgb: Float32Array, info: object}>}
 *   rgb: linear sRGB, 1.0 = the profile's HDR reference white (HdrSurface convention).
 *   info: what the CMM engaged — xformType, hdrPath, toneMapping, transfer, referenceWhite, …
 */
// ONE HDR CMM session exists in iccconstruct (a single global), and a large image yields to
// the event loop between chunks. Without serialising, a second caller — the Tags view's HAGC
// preview while the HDR tab is applying a profile — would call hdrApplyBegin mid-run and
// replace the first caller's transform under it. Calls queue instead; a failure does not
// block the queue.
let queue = Promise.resolve()

export function hdrTransformPixels(o) {
  const run = queue.then(() => transformNow(o))
  queue = run.catch(() => {})
  return run
}

async function transformNow(o) {
  const mod = await loadConstruct()
  if (typeof mod.hdrApplyBegin !== 'function') {
    throw new Error('This build of the image engine has no HDR profile support.')
  }
  const { profileBytes, rgb, nPixels } = o
  if (!(nPixels > 0) || rgb.length < nPixels * 3) throw new Error('pixel buffer is smaller than the image')
  let info
  try {
    info = mod.hdrApplyBegin(profileBytes, o.targetHeadroom ?? 0, o.policy ?? HDR_POLICY.auto, o.intent ?? 1)
  } catch (e) { throw toError(mod, e) }

  const out = new Float32Array(nPixels * 3)
  const toSrgb = xyzD50ToSrgbLinearMatrix()
  try {
    for (let p0 = 0; p0 < nPixels; p0 += CHUNK_PIXELS) {
      const cnt = Math.min(CHUNK_PIXELS, nPixels - p0)
      const chunk = rgb.slice(p0 * 3, (p0 + cnt) * 3)
      let res
      try { res = mod.hdrApplyChunk(new Uint8Array(chunk.buffer)) }   // eslint-disable-line no-await-in-loop
      catch (e) { throw toError(mod, e) }
      // res.xyz: PCS XYZ, Y = 1 at the profile's HDR reference white (icXyzFromPcs applied).
      out.set(applyMatrix3(res.xyz, toSrgb), p0 * 3)
      const done = p0 + cnt
      o.onProgress?.(done / nPixels)
      if (done < nPixels) await new Promise((r) => setTimeout(r, 0))   // eslint-disable-line no-await-in-loop
    }
  } finally {
    try { mod.hdrApplyEnd() } catch { /* ignore */ }
  }
  return { rgb: out, info }
}
