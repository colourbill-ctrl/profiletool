// (c) 2026 William Li
//
// Pure pixel maths for the HDR tab's own renderer (DL-HDRDISP1, job J2). No DOM, no WASM —
// tested in Node by scripts/check-hdr-pixels.mjs.
//
// THE PIXEL CONVENTION, shared by every HdrSurface backend: linear light, sRGB/Rec.709
// primaries, 1.0 = SDR reference white (203 cd/m², measured in Chromium's HDR canvas). An
// OpenEXR file is scene-linear with 1.0 conventionally diffuse white, so it maps onto that
// convention directly; exposure moves it.
//
// ONE RANGE OPERATOR for both ends of the SDR↔HDR control. `limitStops` is a ceiling in
// stops above SDR white: 0 gives the SDR rendering (ceiling 1.0), MAX_LIMIT_STOPS means no
// limit. The same soft ceiling does both, so dragging the control is one continuous
// operation rather than a switch between two unrelated tone maps.

export const MAX_LIMIT_STOPS = 6   // the HAGC encoding's own headroom cap, and past any display

// ── chromaticities → sRGB-linear matrix ──────────────────────────────────────
const D65 = [0.3127, 0.3290]
export const REC709 = { red: [0.64, 0.33], green: [0.30, 0.60], blue: [0.15, 0.06], white: D65 }

const xyToXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y]

function mul3(a, b) {
  const o = new Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  }
  return o
}
const mulVec = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
]
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det]
}

/** RGB → XYZ for a primaries set, white normalised to Y = 1. null when degenerate. */
export function rgbToXyzMatrix(p) {
  const cols = [xyToXYZ(p.red), xyToXYZ(p.green), xyToXYZ(p.blue)]
  const M = [cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]]
  const Mi = inv3(M)
  if (!Mi) return null
  const S = mulVec(Mi, xyToXYZ(p.white))
  return [M[0] * S[0], M[1] * S[1], M[2] * S[2], M[3] * S[0], M[4] * S[1], M[5] * S[2], M[6] * S[0], M[7] * S[1], M[8] * S[2]]
}

const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]
const BRADFORD_INV = inv3(BRADFORD)

/** Bradford chromatic adaptation between two white points given as xy. */
export function bradford(srcWhite, dstWhite) {
  const s = mulVec(BRADFORD, xyToXYZ(srcWhite)), d = mulVec(BRADFORD, xyToXYZ(dstWhite))
  const D = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]]
  return mul3(BRADFORD_INV, mul3(D, BRADFORD))
}

/**
 * Accepts the chromaticity layouts in circulation — an array of eight numbers
 * [rx, ry, gx, gy, bx, by, wx, wy], { red:[x,y] … }, { red:{x,y} … } or
 * { redX, redY, … } — and returns { red, green, blue, white } as [x, y] pairs, or null when
 * the input is absent or not eight finite numbers in (0, 1].
 */
export function normalizeChromaticities(c) {
  if (!c) return null
  let v = null
  if (Array.isArray(c) || ArrayBuffer.isView(c)) v = Array.from(c)
  else if (c.red !== undefined) {
    const pair = (p) => (Array.isArray(p) ? p : p ? [p.x, p.y] : [NaN, NaN])
    v = [...pair(c.red), ...pair(c.green), ...pair(c.blue), ...pair(c.white)]
  } else if (c.redX !== undefined) {
    v = [c.redX, c.redY, c.greenX, c.greenY, c.blueX, c.blueY, c.whiteX, c.whiteY]
  }
  if (!v || v.length < 8) return null
  v = v.slice(0, 8).map(Number)
  if (!v.every((n) => Number.isFinite(n) && n > 0 && n <= 1)) return null
  return { red: [v[0], v[1]], green: [v[2], v[3]], blue: [v[4], v[5]], white: [v[6], v[7]] }
}

/**
 * Linear RGB in `primaries` → linear sRGB/Rec.709 (D65), Bradford-adapting the white.
 * null means "no conversion needed" (Rec.709/D65 within 5e-4) — also returned for
 * degenerate primaries, which the caller reports rather than renders through.
 */
export function toSrgbLinearMatrix(primaries) {
  const p = primaries
  if (!p) return null
  const same = (a, b) => Math.abs(a[0] - b[0]) < 5e-4 && Math.abs(a[1] - b[1]) < 5e-4
  if (same(p.red, REC709.red) && same(p.green, REC709.green) && same(p.blue, REC709.blue) && same(p.white, D65)) return null
  const src = rgbToXyzMatrix(p)
  const dst = rgbToXyzMatrix(REC709)
  if (!src || !dst) return null
  const adapted = same(p.white, D65) ? src : mul3(bradford(p.white, D65), src)
  return mul3(inv3(dst), adapted)
}

// ── decoded samples and the ICC PCS ──────────────────────────────────────────
const D50 = [0.3457, 0.3585]

/**
 * PCS XYZ (D50, as an ICC CMM outputs it) → linear sRGB/Rec.709 (D65): XYZ→sRGB after a
 * Bradford D50→D65 adaptation. Returned row-major, for use with applyMatrix3.
 */
export function xyzD50ToSrgbLinearMatrix() {
  return mul3(inv3(rgbToXyzMatrix(REC709)), bradford(D50, D65))
}

/** Apply a 3×3 row-major matrix to interleaved RGB/XYZ triplets, in place. */
export function applyMatrix3(buf, m) {
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2]
    buf[i] = m[0] * a + m[1] * b + m[2] * c
    buf[i + 1] = m[3] * a + m[4] * b + m[5] * c
    buf[i + 2] = m[6] * a + m[7] * b + m[8] * c
  }
  return buf
}

/**
 * A decodeImage() result → Float32Array of device values in [0, 1], interleaved.
 * 8-bit ÷255, 16-bit (little-endian, as the WASM codec returns it) ÷65535, float samples
 * passed through unchanged — an OpenEXR buffer is linear light, not a code value, and the
 * caller must only send it through a profile whose transfer is Linear.
 */
export function samplesToUnitFloat(img) {
  const raw = img.samples
  if (img.sampleFormat === 'float') {
    return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  }
  if (img.bitDepth === 16) {
    const n = raw.byteLength >> 1
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = (raw[2 * i] | (raw[2 * i + 1] << 8)) / 65535
    return out
  }
  if (img.bitDepth !== 8) throw new Error(`unsupported sample depth: ${img.bitDepth}-bit`)
  const out = new Float32Array(raw.byteLength)
  for (let i = 0; i < raw.byteLength; i++) out[i] = raw[i] / 255
  return out
}

// ── the range operator ───────────────────────────────────────────────────────
/**
 * Soft ceiling on luminance: identity up to 80% of the ceiling, then an exponential
 * shoulder that approaches — never reaches — the ceiling. Continuous with slope 1 at the
 * knee, so no band appears where the shoulder starts. Infinite or non-positive C → identity.
 */
export function softCeiling(Y, C) {
  if (!(C > 0) || !Number.isFinite(C)) return Y
  const k = 0.8 * C
  if (Y <= k) return Y
  return k + (C - k) * (1 - Math.exp(-(Y - k) / (C - k)))
}

/**
 * Float RGB (w×h×3, linear) → Float32Array RGBA in the HdrSurface convention.
 * @param {{exposureStops?:number, limitStops?:number, matrix?:number[]|null}} o
 * @returns {{rgba: Float32Array, peak: number}} `peak` is the brightest channel AFTER
 *   exposure and conversion but BEFORE the ceiling — what the file asks for, which is
 *   what the user needs to judge how much headroom it wants.
 */
export function renderFloatRgba(rgb, w, h, { exposureStops = 0, limitStops = MAX_LIMIT_STOPS, matrix = null } = {}) {
  const n = w * h
  if (!(n > 0) || !rgb || rgb.length < n * 3) throw new Error('pixel buffer is smaller than width × height × 3')
  const gain = 2 ** exposureStops
  const C = limitStops >= MAX_LIMIT_STOPS ? Infinity : 2 ** Math.max(0, limitStops)
  const out = new Float32Array(n * 4)
  let peak = 0
  for (let i = 0; i < n; i++) {
    let r = rgb[i * 3] * gain, g = rgb[i * 3 + 1] * gain, b = rgb[i * 3 + 2] * gain
    if (matrix) {
      const R = matrix[0] * r + matrix[1] * g + matrix[2] * b
      const G = matrix[3] * r + matrix[4] * g + matrix[5] * b
      const B = matrix[6] * r + matrix[7] * g + matrix[8] * b
      r = R; g = G; b = B
    }
    // Negative and non-finite samples are legal in EXR (out-of-gamut, or garbage from a
    // renderer). Neither has a display meaning; show them as black rather than let a NaN
    // poison the luminance scale below.
    r = r > 0 && Number.isFinite(r) ? r : 0
    g = g > 0 && Number.isFinite(g) ? g : 0
    b = b > 0 && Number.isFinite(b) ? b : 0
    const m = Math.max(r, g, b)
    if (m > peak) peak = m
    if (C !== Infinity) {
      // Luminance, not per channel: scaling all three by one factor keeps hue and
      // saturation, where a per-channel ceiling would bleach bright colours toward white.
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (Y > 0) {
        const s = softCeiling(Y, C) / Y
        r *= s; g *= s; b *= s
      }
    }
    const o = i * 4
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 1
  }
  return { rgba: out, peak }
}

// ── the display's limit ──────────────────────────────────────────────────────
/**
 * How bright this display can go, as a multiple of SDR white.
 * A reported headroom (log2 stops, Chromium's hdrHeadroom) wins, being specific to the
 * screen. Failing that, a display that reports no HDR has a peak of exactly SDR white.
 * Otherwise the peak is unknown — returned as nulls, never guessed.
 * @returns {{ratio:number|null, stops:number|null, source:'headroom'|'sdr'|null}}
 */
export function displayPeakInfo({ hdr = null, headroomStops = null } = {}) {
  if (typeof headroomStops === 'number' && Number.isFinite(headroomStops) && headroomStops >= 0) {
    return { ratio: 2 ** headroomStops, stops: headroomStops, source: 'headroom' }
  }
  if (hdr === false) return { ratio: 1, stops: 0, source: 'sdr' }
  return { ratio: null, stops: null, source: null }
}

/** The dynamic-range share (0–1) whose ceiling is `stops` above SDR white. */
export function fitShare(stops) {
  if (!(typeof stops === 'number' && Number.isFinite(stops))) return null
  return Math.min(1, Math.max(0, stops / MAX_LIMIT_STOPS))
}

/**
 * Does the rendered image ask for more than the display shows? The soft ceiling never
 * exceeds its limit, so what reaches the display is min(image peak, ceiling). 2% slack keeps
 * a ceiling set exactly to the display peak (Fit to display) from reporting a clip.
 */
export function clipsBeyondDisplay(imagePeak, displayRatio, ceiling = Infinity) {
  if (!(imagePeak > 0) || !(displayRatio > 0)) return false
  return Math.min(imagePeak, ceiling) > displayRatio * 1.02
}

/** sRGB transfer function (encode) for v in [0, 1]. */
export function srgbEncode(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

/** Float RGBA → 8-bit sRGB RGBA for an SDR canvas. Clips to [0, 1]; run the ceiling first. */
export function encodeSrgb8(rgba) {
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = Math.min(1, Math.max(0, rgba[i + c]))
      out[i + c] = Math.round(srgbEncode(v) * 255)
    }
    out[i + 3] = 255
  }
  return out
}

/**
 * CSS dynamic-range-limit value for an HDR share in [0, 1] (0 = SDR, 1 = full HDR).
 * Without -mix() support (Safari 26) the control can only pick an end.
 */
export function drlValue(hdrShare, supportsMix) {
  const s = Math.min(1, Math.max(0, Number(hdrShare) || 0))
  if (s <= 0) return 'standard'
  if (s >= 1) return 'no-limit'
  if (!supportsMix) return s < 0.5 ? 'standard' : 'no-limit'
  const pct = Math.round(s * 100)
  return `dynamic-range-limit-mix(standard ${100 - pct}%, no-limit ${pct}%)`
}
