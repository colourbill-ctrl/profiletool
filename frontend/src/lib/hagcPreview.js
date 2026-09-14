// (c) 2026 William Li
//
// Test pixels for the HAGC PREVIEW STRIP in the Tags view (viz/HagcPreview.jsx).
//
// PURE — no DOM, no WASM — so the strip's construction is checked in Node
// (scripts/check-hagc-family.mjs). The pixels are DEVICE values in [0, 1], encoded in the
// profile's own transfer (its cicpTag), because that is what the CMM's HDR path expects:
// it decodes them with the profile's EOTF, applies the gain curve, then the colorants.
//
// Layout, left → right the same signal on every row:
//   rows 0 … RAMP_H−1         grey ramp
//   then one ROW_H band each  pure R, G, B, Y, C, M (the signal on those channels only)
//
// SIGNAL SPACING. PQ and HLG are perceptual encodings, so equal signal steps are already
// roughly equal steps in brightness and the ramp is uniform in signal. A Linear profile's
// signal IS light, so a uniform ramp would spend almost every column on highlights; its
// ramp is spaced logarithmically instead, over LINEAR_STOPS stops below full scale.

export const STRIP_W = 512
export const RAMP_H = 40
export const ROW_H = 14
export const LINEAR_STOPS = 12
export const COLOUR_ROWS = [
  ['R', [1, 0, 0]], ['G', [0, 1, 0]], ['B', [0, 0, 1]],
  ['Y', [1, 1, 0]], ['C', [0, 1, 1]], ['M', [1, 0, 1]],
]

/** Device signal at horizontal position u ∈ [0, 1] for a transfer name ('PQ' | 'HLG' | 'Linear'). */
export function signalAt(u, transfer) {
  const v = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0))
  if (transfer === 'Linear') return v === 0 ? 0 : 2 ** (-LINEAR_STOPS * (1 - v))
  return v
}

/**
 * @param {string} transfer 'PQ' | 'HLG' | 'Linear'
 * @returns {{rgb: Float32Array, w: number, h: number}} interleaved device RGB, top row first
 */
export function makeTestStrip(transfer, w = STRIP_W) {
  if (!(Number.isInteger(w) && w >= 2 && w <= 4096)) throw new Error('strip width out of range')
  const h = RAMP_H + COLOUR_ROWS.length * ROW_H
  const rgb = new Float32Array(w * h * 3)
  for (let x = 0; x < w; x++) {
    const s = signalAt(x / (w - 1), transfer)
    for (let y = 0; y < h; y++) {
      const mask = y < RAMP_H ? [1, 1, 1] : COLOUR_ROWS[Math.floor((y - RAMP_H) / ROW_H)][1]
      const o = (y * w + x) * 3
      rgb[o] = s * mask[0]
      rgb[o + 1] = s * mask[1]
      rgb[o + 2] = s * mask[2]
    }
  }
  return { rgb, w, h }
}

/**
 * Cap every channel at `peak` — what a display with that much headroom does to values it
 * cannot show (per-channel, so an over-range colour also shifts hue, as on a real panel).
 * Non-finite samples become 0 rather than propagating through the canvas.
 */
export function limitToPeak(rgb, peak) {
  const out = new Float32Array(rgb.length)
  const cap = peak > 0 && Number.isFinite(peak) ? peak : Infinity
  for (let i = 0; i < rgb.length; i++) {
    const v = rgb[i]
    out[i] = Number.isFinite(v) ? (v > cap ? cap : v) : 0
  }
  return out
}

/** Rec.709 luminance of the grey ramp's first row (linear sRGB in, as the CMM client returns). */
export function rampLuminance(rgb, w) {
  const Y = new Float32Array(w)
  for (let x = 0; x < w; x++) Y[x] = 0.2126 * rgb[x * 3] + 0.7152 * rgb[x * 3 + 1] + 0.0722 * rgb[x * 3 + 2]
  return Y
}

/** First column whose luminance reaches `level` (the ramp increases), or −1 if none does. */
export function firstReaching(Y, level) {
  for (let x = 0; x < Y.length; x++) if (Y[x] >= level) return x
  return -1
}
