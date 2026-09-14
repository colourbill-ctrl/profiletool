#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/hdrPixels.js — the HDR tab's pixel maths — in Node.
// The colour matrices are checked against published values (linear Display P3 → sRGB),
// not against themselves; the range operator against the properties the UI relies on
// (identity with no limit, SDR output ≤ 1.0, continuity at the knee, hue preserved).
//
// Usage: node scripts/check-hdr-pixels.mjs

import {
  MAX_LIMIT_STOPS, REC709, rgbToXyzMatrix, toSrgbLinearMatrix, normalizeChromaticities,
  softCeiling, renderFloatRgba, srgbEncode, encodeSrgb8, drlValue,
  displayPeakInfo, fitShare, clipsBeyondDisplay,
  xyzD50ToSrgbLinearMatrix, applyMatrix3, samplesToUnitFloat, scaleSamples,
} from '../frontend/src/lib/hdrPixels.js'

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
const mulVec = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]

// ── matrices ────────────────────────────────────────────────────────────────
{
  const m = rgbToXyzMatrix(REC709)
  // Published sRGB → XYZ (D65), first row 0.4124 0.3576 0.1805; Y row 0.2126 0.7152 0.0722.
  check('Rec.709 RGB→XYZ matches the published matrix', near(m[0], 0.4124, 1e-3) && near(m[1], 0.3576, 1e-3) && near(m[3], 0.2126, 1e-3) && near(m[4], 0.7152, 1e-3) && near(m[5], 0.0722, 1e-3), m)
  check('Rec.709/D65 primaries → no conversion (null)', toSrgbLinearMatrix(REC709) === null)
  check('no primaries → null', toSrgbLinearMatrix(null) === null)

  const P3 = { red: [0.680, 0.320], green: [0.265, 0.690], blue: [0.150, 0.060], white: [0.3127, 0.3290] }
  const p3 = toSrgbLinearMatrix(P3)
  const white = mulVec(p3, [1, 1, 1])
  check('Display P3 → sRGB: white stays white', white.every((v) => near(v, 1, 1e-4)), white)
  // Published linear P3 → sRGB: pure P3 green = (-0.2249, 1.0421, -0.0786).
  const green = mulVec(p3, [0, 1, 0])
  check('Display P3 → sRGB: pure P3 green matches the published column', near(green[0], -0.2249, 2e-3) && near(green[1], 1.0421, 2e-3) && near(green[2], -0.0786, 2e-3), green)

  // ACES AP0 has a non-D65 white (0.32168, 0.33767): Bradford must land it on D65 white.
  const AP0 = { red: [0.7347, 0.2653], green: [0.0, 1.0], blue: [0.0001, -0.077], white: [0.32168, 0.33767] }
  check('degenerate/out-of-range primaries rejected by normalizeChromaticities', normalizeChromaticities([0.7347, 0.2653, 0, 1, 0.0001, -0.077, 0.32168, 0.33767]) === null)
  const ACEScg = { red: [0.713, 0.293], green: [0.165, 0.830], blue: [0.128, 0.044], white: [0.32168, 0.33767] }
  const cg = toSrgbLinearMatrix(ACEScg)
  const cgWhite = mulVec(cg, [1, 1, 1])
  check('ACEScg (white 0.32168,0.33767) → sRGB: Bradford maps its white to (1,1,1)', cgWhite.every((v) => near(v, 1, 2e-3)), cgWhite)
  void AP0
}
{
  const arr = [0.64, 0.33, 0.30, 0.60, 0.15, 0.06, 0.3127, 0.3290]
  const a = normalizeChromaticities(arr)
  check('normalizeChromaticities: array of 8', a && a.green[1] === 0.60 && a.white[0] === 0.3127, a)
  const o = normalizeChromaticities({ red: { x: 0.64, y: 0.33 }, green: { x: 0.3, y: 0.6 }, blue: { x: 0.15, y: 0.06 }, white: { x: 0.3127, y: 0.329 } })
  check('normalizeChromaticities: { red:{x,y} }', o && o.blue[0] === 0.15, o)
  const f = normalizeChromaticities({ redX: 0.64, redY: 0.33, greenX: 0.3, greenY: 0.6, blueX: 0.15, blueY: 0.06, whiteX: 0.3127, whiteY: 0.329 })
  check('normalizeChromaticities: { redX, … }', f && f.red[0] === 0.64, f)
  check('normalizeChromaticities: absent / short / NaN → null',
    normalizeChromaticities(undefined) === null && normalizeChromaticities([0.6, 0.3]) === null && normalizeChromaticities([NaN, 0.3, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329]) === null)
}

// ── soft ceiling ─────────────────────────────────────────────────────────────
{
  check('softCeiling: identity below the knee', softCeiling(0.5, 1) === 0.5 && softCeiling(0.8, 1) === 0.8)
  const eps = 1e-6
  const slope = (softCeiling(0.8 + eps, 1) - softCeiling(0.8, 1)) / eps
  check('softCeiling: slope 1 at the knee (no band)', near(slope, 1, 1e-3), slope)
  check('softCeiling: approaches but never exceeds the ceiling', softCeiling(5, 1) < 1 && softCeiling(1000, 1) <= 1 && softCeiling(5, 1) > 0.99)
  let mono = true
  for (let y = 0; y < 20; y += 0.01) if (softCeiling(y + 0.01, 4) < softCeiling(y, 4)) mono = false
  check('softCeiling: monotonic', mono)
  check('softCeiling: infinite ceiling → identity', softCeiling(37, Infinity) === 37)
}

// ── renderFloatRgba ──────────────────────────────────────────────────────────
{
  // 4 pixels: black, SDR white, 4× white, a saturated bright red.
  const src = new Float32Array([0, 0, 0, 1, 1, 1, 4, 4, 4, 3, 0.2, 0.1])
  const none = renderFloatRgba(src, 4, 1)
  check('no limit: values pass through (4× white stays 4)', none.rgba[8] === 4 && none.rgba[4] === 1 && none.rgba[3] === 1, Array.from(none.rgba))
  check('peak is the brightest channel', none.peak === 4, none.peak)
  const exp = renderFloatRgba(src, 4, 1, { exposureStops: 1 })
  check('exposure +1 stop doubles', exp.rgba[4] === 2 && exp.rgba[8] === 8)
  const sdr = renderFloatRgba(src, 4, 1, { limitStops: 0 })
  const lum = (i) => 0.2126 * sdr.rgba[i] + 0.7152 * sdr.rgba[i + 1] + 0.0722 * sdr.rgba[i + 2]
  check('limit 0 stops (SDR): every luminance ≤ 1', [0, 4, 8, 12].every((i) => lum(i) <= 1 + 1e-6), [0, 4, 8, 12].map(lum))
  check('limit 0: grey stays grey', sdr.rgba[8] === sdr.rgba[9] && sdr.rgba[9] === sdr.rgba[10])
  const ratioIn = 0.2 / 3, ratioOut = sdr.rgba[13] / sdr.rgba[12]
  check('limit 0: saturated red keeps its channel ratios (hue preserved)', near(ratioIn, ratioOut, 1e-6), { ratioIn, ratioOut })
  const two = renderFloatRgba(src, 4, 1, { limitStops: 2 })
  check('limit 2 stops: 4× white compressed below 4, SDR white untouched', two.rgba[8] < 4 && two.rgba[8] > 3 && two.rgba[4] === 1, [two.rgba[4], two.rgba[8]])
  const bad = renderFloatRgba(new Float32Array([-1, NaN, Infinity]), 1, 1)
  check('negative / NaN / Infinity samples → 0', bad.rgba[0] === 0 && bad.rgba[1] === 0 && bad.rgba[2] === 0, Array.from(bad.rgba))
  let threw = false
  try { renderFloatRgba(new Float32Array(5), 2, 1) } catch { threw = true }
  check('short buffer throws', threw)
  const m = [0, 0, 1, 0, 1, 0, 1, 0, 0]   // swap R and B
  const sw = renderFloatRgba(new Float32Array([1, 0, 0]), 1, 1, { matrix: m })
  check('matrix is applied', sw.rgba[0] === 0 && sw.rgba[2] === 1)
}

// ── encode ───────────────────────────────────────────────────────────────────
{
  check('srgbEncode(0.5) ≈ 0.7354', near(srgbEncode(0.5), 0.7354, 1e-4), srgbEncode(0.5))
  const e = encodeSrgb8(new Float32Array([0, 0.5, 1, 1, 2, -1, 0.0031308, 0]))
  check('encodeSrgb8: 0→0, 0.5→188, 1→255, alpha 255', e[0] === 0 && e[1] === 188 && e[2] === 255 && e[3] === 255, Array.from(e))
  check('encodeSrgb8: >1 clips to 255, <0 to 0', e[4] === 255 && e[5] === 0)
}

// ── dynamic-range-limit ──────────────────────────────────────────────────────
{
  check('drlValue: ends', drlValue(0, true) === 'standard' && drlValue(1, true) === 'no-limit')
  check('drlValue: mix when supported', drlValue(0.25, true) === 'dynamic-range-limit-mix(standard 75%, no-limit 25%)', drlValue(0.25, true))
  check('drlValue: nearest end when -mix unsupported (Safari)', drlValue(0.25, false) === 'standard' && drlValue(0.75, false) === 'no-limit')
  check('drlValue: garbage clamps', drlValue(NaN, true) === 'standard' && drlValue(7, true) === 'no-limit')
  check('MAX_LIMIT_STOPS is 6', MAX_LIMIT_STOPS === 6)
}

// ── the display's limit ──────────────────────────────────────────────────────
{
  // The user's laptop: hdrHeadroom 1.16 stops → 2.23×.
  const p = displayPeakInfo({ hdr: true, headroomStops: 1.16 })
  check('displayPeakInfo: headroom 1.16 stops → 2.23×', p.source === 'headroom' && Math.abs(p.ratio - 2.2346) < 1e-3 && p.stops === 1.16, p)
  check('displayPeakInfo: SDR display, no headroom → 1×', JSON.stringify(displayPeakInfo({ hdr: false })) === JSON.stringify({ ratio: 1, stops: 0, source: 'sdr' }))
  check('displayPeakInfo: headroom wins over the media query', displayPeakInfo({ hdr: false, headroomStops: 0.5 }).source === 'headroom')
  const u = displayPeakInfo({ hdr: true })
  check('displayPeakInfo: HDR display, no headroom → unknown (nulls, not a guess)', u.ratio === null && u.stops === null && u.source === null, u)
  check('displayPeakInfo: garbage headroom ignored', displayPeakInfo({ hdr: null, headroomStops: NaN }).source === null && displayPeakInfo({ headroomStops: -1 }).source === null)
  check('fitShare: 1.16 stops → 0.1933; 0 → 0; 9 → 1; NaN → null',
    Math.abs(fitShare(1.16) - 1.16 / 6) < 1e-9 && fitShare(0) === 0 && fitShare(9) === 1 && fitShare(NaN) === null)
  // The fitted share, fed through the real operator, never exceeds the display peak.
  const fit = renderFloatRgba(new Float32Array([4.926, 4.926, 4.926]), 1, 1, { limitStops: fitShare(1.16) * MAX_LIMIT_STOPS })
  check('Fit to display: 4.93× rendered below the 2.23× display peak', fit.rgba[0] < 2.2346 && fit.rgba[0] > 2.1, fit.rgba[0])
  check('clipsBeyondDisplay: 4.93× image, 2.23× display, no limit → clips', clipsBeyondDisplay(4.926, 2.2346))
  check('clipsBeyondDisplay: ceiling at the display peak → no clip', !clipsBeyondDisplay(4.926, 2.2346, 2.2346))
  // The slack's reason: a slider-rounded or float-drifted ceiling a hair above the peak must
  // not flip the UI into "clips" right after Fit to display.
  check('clipsBeyondDisplay: ceiling 1% above the display peak → still no clip', !clipsBeyondDisplay(4.926, 2.2346, 2.2346 * 1.01))
  check('clipsBeyondDisplay: image dimmer than the display → no clip', !clipsBeyondDisplay(1.5, 2.2346))
  check('clipsBeyondDisplay: SDR display, HDR image → clips', clipsBeyondDisplay(4.926, 1))
  check('clipsBeyondDisplay: unknown display → false (never claimed)', !clipsBeyondDisplay(4.926, null))
}

// ── decoded samples and the ICC PCS ──────────────────────────────────────────
{
  const m = xyzD50ToSrgbLinearMatrix()
  // PCS white (the ICC D50 illuminant) must come out as linear sRGB white.
  const w = applyMatrix3(new Float32Array([0.9642, 1.0, 0.8249]), m)
  check('PCS D50 white → linear sRGB (1, 1, 1)', [...w].every((v) => near(v, 1, 2e-3)), Array.from(w))
  // Above-white survives the conversion unclipped (the whole point for HDR).
  const hi = applyMatrix3(new Float32Array([0.9642 * 13.33, 13.33, 0.8249 * 13.33]), m)
  check('PCS 13.33× white → linear sRGB ≈ 13.33 (no clip)', [...hi].every((v) => near(v, 13.33, 0.03)), Array.from(hi))
  // A D50-referenced sRGB red primary lands on sRGB red after adaptation.
  const red = applyMatrix3(new Float32Array([0.4361, 0.2225, 0.0139]), m)
  check('PCS (D50) sRGB red → linear sRGB ≈ (1, 0, 0)', near(red[0], 1, 0.01) && near(red[1], 0, 0.01) && near(red[2], 0, 0.01), Array.from(red))

  const u8 = samplesToUnitFloat({ bitDepth: 8, samples: new Uint8Array([0, 128, 255]) })
  check('samplesToUnitFloat: 8-bit ÷255', u8[0] === 0 && near(u8[1], 128 / 255, 1e-7) && u8[2] === 1)
  const le = new Uint8Array(new Uint16Array([0, 38055, 65535]).buffer)
  const u16 = samplesToUnitFloat({ bitDepth: 16, samples: le })
  check('samplesToUnitFloat: 16-bit little-endian ÷65535', u16[0] === 0 && near(u16[1], 38055 / 65535, 1e-7) && u16[2] === 1, Array.from(u16))
  const fl = new Uint8Array(new Float32Array([0.5, 4.926, -0.1]).buffer)
  const f = samplesToUnitFloat({ bitDepth: 32, sampleFormat: 'float', samples: fl })
  check('samplesToUnitFloat: float passes through (above 1 and below 0 kept)', near(f[0], 0.5, 1e-7) && near(f[1], 4.926, 1e-5) && near(f[2], -0.1, 1e-7), Array.from(f))
  let threw = false
  try { samplesToUnitFloat({ bitDepth: 12, samples: new Uint8Array(4) }) } catch { threw = true }
  check('samplesToUnitFloat: unsupported depth throws', threw)
}

// ── scaleSamples: "file 1.0 = HDR reference white" for Linear-transfer profiles ──
{
  const src = new Float32Array([1, 0.5, 4.926, -0.1])
  const s = scaleSamples(src, 300)
  check('scaleSamples ×300: 1.0 → 300, above 1 and below 0 scaled too', near(s[0], 300, 1e-4) && near(s[1], 150, 1e-4) && near(s[2], 1477.8, 1e-2) && near(s[3], -30, 1e-4), Array.from(s))
  check('scaleSamples returns a new buffer (source untouched)', s !== src && src[0] === 1)
  const bad = [0, -2, NaN, Infinity].map((f) => Array.from(scaleSamples(src, f)))
  check('scaleSamples: non-positive / non-finite factor leaves values unscaled', bad.every((a) => a.every((v, i) => v === src[i])), bad)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
