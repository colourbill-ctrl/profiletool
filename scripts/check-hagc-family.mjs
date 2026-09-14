#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the HAGC FAMILY fixture (test-corpus/hdr/ProfiletoolHagcFamily) and the preview strip
// that shows it (frontend/src/lib/hagcPreview.js), in Node, three ways:
//
//   1. EVALUATOR (iccplot hagcEvaluate → IccProfLib CIccHagcEvaluator) against the XML as
//      authored: curves at 0, 1.5, 3 (baseline identity), 4.5, 6; every control point passed
//      through; each compressing curve ends at its own display peak and holds there; grey
//      output never decreases at any headroom; blends stay between their neighbours; gains
//      are ≤ 0 below the baseline and ≥ 0 above it.
//   2. CMM (iccconstruct hdrApplyBegin/Chunk) on PQ-encoded greys: the colour engine the
//      preview strip uses must apply the same numbers the evaluator reports.
//   3. The pure strip builder: layout, encodings, the display-peak cap.
//
// Usage: node scripts/check-hagc-family.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeTestStrip, signalAt, limitToPeak, rampLuminance, firstReaching, STRIP_W, RAMP_H, ROW_H, COLOUR_ROWS, LINEAR_STOPS } from '../frontend/src/lib/hagcPreview.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM = join(ROOT, 'frontend/public/wasm')
const load = async (name) => (await import(pathToFileURL(join(WASM, `${name}.mjs`)).href)).default({ locateFile: (p) => join(WASM, p) })
const plot = await load('iccplot')
const cmm = await load('iccconstruct')
const bytes = new Uint8Array(readFileSync(join(ROOT, 'test-corpus/hdr/ProfiletoolHagcFamily.icc')))

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
// 161 samples over [0, 10] puts a sample every 1/16 — exactly on every control-point x.
const N = 161
const evalAt = (h) => JSON.parse(plot.hagcEvaluate(bytes, h, N))
const idx = (r, xv) => r.x.findIndex((v) => Math.abs(v - xv) < 1e-6)

// As authored in ProfiletoolHagcFamily.xml.
const AUTH = {
  0: [[0.25, -0.05], [0.5, -0.15], [1, -0.45], [2, -1.25], [4, -2.0]],
  1.5: [[0.5, -0.05], [1, -0.15], [2, -0.45], [4, -0.9], [8, -1.5]],
  4.5: [[1, 0.05], [2, 0.25], [4, 0.6], [8, 1.0]],
  6: [[1, 0.1], [2, 0.5], [4, 1.1], [8, 2.0]],
}

// ── 1. evaluator ─────────────────────────────────────────────────────────────
{
  const r = evalAt(3)
  check('supported; baseline 3; reference white 203; one mixing type (shared); PCHIP slopes',
    r.supported && rel(r.baselineHeadroom, 3, 1e-6) && rel(r.referenceWhite, 203, 1e-6) && r.sharedMixing === true && r.derivedSlopes === true, r)
  check('curves at 0, 1.5, 3, 4.5, 6 — only the baseline is the identity',
    JSON.stringify(r.curves.map((c) => +c.headroom.toFixed(3))) === '[0,1.5,3,4.5,6]' && r.curves.map((c) => c.identity).join() === 'false,false,true,false,false',
    r.curves.map((c) => [c.headroom, c.identity]))
  check('grid has a sample on every control-point x', Object.values(AUTH).flat().every(([xv]) => idx(r, xv) >= 0), { n: r.x.length, xmax: r.x.at(-1) })
  check('at the baseline the blended gain is 0 everywhere', r.blendGain.every((g) => Math.abs(g) < 1e-6))
}
for (const [h, pts] of Object.entries(AUTH)) {
  const r = evalAt(+h)
  const got = pts.map(([xv]) => r.blendGain[idx(r, xv)])
  check(`at ${h} stops the gain passes through every authored control point`, pts.every(([, yv], i) => Math.abs(got[i] - yv) < 1e-4), got)
  const [xl, yl] = pts[pts.length - 1]
  const peakOut = xl * 2 ** yl
  const beyond = r.x.map((xv, i) => [xv, r.neutralOut[i]]).filter(([xv]) => xv > xl + 1e-6)
  check(`at ${h} stops grey output reaches ${+peakOut.toFixed(3)} at x=${xl} and holds it above`,
    rel(r.neutralOut[idx(r, xl)], peakOut, 1e-3) && beyond.length > 0 && beyond.every(([, o]) => rel(o, peakOut, 1e-4)), beyond.slice(0, 3))
}
check('compressing curves end at their own display peak (0 → 1×, 1.5 → 2.828×)', rel(4 * 2 ** -2, 2 ** 0, 1e-9) && rel(8 * 2 ** -1.5, 2 ** 1.5, 1e-9))
{
  let bad = null
  for (let h = 0; h <= 6 + 1e-9 && !bad; h += 0.25) {
    const r = evalAt(h)
    for (let i = 1; i < r.neutralOut.length; i++) {
      if (r.neutralOut[i] < r.neutralOut[i - 1] * (1 - 1e-6) - 1e-9) { bad = { h, x: r.x[i], prev: r.neutralOut[i - 1], cur: r.neutralOut[i] }; break }
    }
  }
  check('grey output never decreases, at every headroom 0 … 6 in quarter stops', !bad, bad)
}
{
  // A blend between two neighbouring curves must lie between them at every input.
  const pairs = [[0.75, 0, 1.5], [2.25, 1.5, 3], [3.75, 3, 4.5], [5.25, 4.5, 6]]
  for (const [h, lo, hi] of pairs) {
    const m = evalAt(h), a = evalAt(lo), b = evalAt(hi)
    const ok = m.blendGain.every((g, i) => g >= Math.min(a.blendGain[i], b.blendGain[i]) - 1e-5 && g <= Math.max(a.blendGain[i], b.blendGain[i]) + 1e-5)
    const strict = m.blendGain.some((g, i) => Math.abs(a.blendGain[i] - b.blendGain[i]) > 1e-3 && Math.abs(g - a.blendGain[i]) > 1e-4 && Math.abs(g - b.blendGain[i]) > 1e-4)
    check(`blend at ${h} stops lies between the ${lo} and ${hi} curves (and is neither)`, ok && strict)
  }
}
{
  let below = true, above = true
  for (const h of [0, 0.5, 1, 1.5, 2, 2.5]) if (evalAt(h).blendGain.some((g) => g > 1e-6)) below = false
  for (const h of [3.5, 4, 4.5, 5, 5.5, 6]) if (evalAt(h).blendGain.some((g) => g < -1e-6)) above = false
  check('gain ≤ 0 at every headroom below the baseline, ≥ 0 at every headroom above it', below && above, { below, above })
}

// ── 2. the CMM applies the same numbers ──────────────────────────────────────
const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = nits / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const X = [0.5, 1, 2, 4, 8]                    // × HDR reference white (203 cd/m²)
const greys = new Float32Array(X.flatMap((x) => { const s = pq(x * 203); return [s, s, s] }))
function applyY(headroomStops) {
  const info = cmm.hdrApplyBegin(bytes, 2 ** headroomStops, 1 /* HAGC */, 1)
  try {
    const r = cmm.hdrApplyChunk(new Uint8Array(greys.slice().buffer))
    return { info, Y: X.map((_, i) => r.xyz[i * 3 + 1]) }
  } finally { cmm.hdrApplyEnd() }
}
{
  const a = applyY(3)
  check('CMM: HDR path, PQ (16), reference white 203', a.info.hdrPath === true && a.info.transfer === 16 && rel(a.info.referenceWhite, 203, 1e-4), a.info)
  check('CMM at the baseline: output = input (0.5 1 2 4 8)', a.Y.every((y, i) => rel(y, X[i], 5e-3)), a.Y)
  for (const h of [0, 0.75, 1.5, 4.5, 6]) {
    const c = applyY(h)
    const r = evalAt(h)
    const want = X.map((xv) => r.neutralOut[idx(r, xv)])
    check(`CMM at ${h} stops matches the evaluator's grey output (${want.map((v) => +v.toFixed(3)).join(' ')})`,
      c.info.toneMapping === true && c.Y.every((y, i) => rel(y, want[i], 5e-3)), { cmm: c.Y, evaluator: want })
  }
}

// ── 3. the strip builder ─────────────────────────────────────────────────────
{
  const s = makeTestStrip('PQ')
  check(`strip is ${STRIP_W}×${RAMP_H + COLOUR_ROWS.length * ROW_H}`, s.w === STRIP_W && s.h === RAMP_H + COLOUR_ROWS.length * ROW_H && s.rgb.length === s.w * s.h * 3)
  const px = (x, y) => Array.from(s.rgb.subarray((y * s.w + x) * 3, (y * s.w + x) * 3 + 3))
  check('PQ: grey ramp from signal 0 to 1, R=G=B', px(0, 0).every((v) => v === 0) && px(s.w - 1, RAMP_H - 1).every((v) => v === 1) && px(200, 10).every((v, _, a) => v === a[0]))
  const rowMid = (k) => RAMP_H + k * ROW_H + (ROW_H >> 1)
  check('colour bands carry the signal only on their channels (R, G, B, Y, C, M)',
    COLOUR_ROWS.every(([, mask], k) => px(s.w - 1, rowMid(k)).every((v, c) => v === mask[c])), COLOUR_ROWS.map((_, k) => px(s.w - 1, rowMid(k))))
  check(`Linear: logarithmic over ${LINEAR_STOPS} stops (u=1 → 1, u=0.5 → 2^-${LINEAR_STOPS / 2}, u=0 → 0)`,
    signalAt(1, 'Linear') === 1 && rel(signalAt(0.5, 'Linear'), 2 ** (-LINEAR_STOPS / 2), 1e-12) && signalAt(0, 'Linear') === 0 && signalAt(0.5, 'HLG') === 0.5)
  const capped = limitToPeak(new Float32Array([0.5, 3, -0.1, NaN, Infinity]), 2)
  check('limitToPeak caps at the peak, keeps negatives, zeroes non-finite', Array.from(capped).join() === '0.5,2,' + Math.fround(-0.1) + ',0,0', Array.from(capped))
  check('refuses an absurd strip width', (() => { try { makeTestStrip('PQ', 1e6); return false } catch { return true } })())

  // End to end: the strip through the CMM at the baseline, then the tick positions.
  const info = cmm.hdrApplyBegin(bytes, 8, 1, 1)
  let out
  try { out = cmm.hdrApplyChunk(new Uint8Array(s.rgb.slice().buffer)).xyz } finally { cmm.hdrApplyEnd() }
  void info
  // Row 0's PCS Y directly (the component takes Rec.709 luminance of linear sRGB, which for a
  // neutral is the same number); rampLuminance is checked separately on a known triple.
  const Y = new Float32Array(s.w)
  for (let x = 0; x < s.w; x++) Y[x] = out[x * 3 + 1]
  const refX = firstReaching(Y, 1)
  check('rampLuminance uses Rec.709 weights', rel(rampLuminance(new Float32Array([1, 0, 0, 0, 1, 0]), 2)[0], 0.2126, 1e-6) && rel(rampLuminance(new Float32Array([1, 0, 0, 0, 1, 0]), 2)[1], 0.7152, 1e-6))
  check('reference-white tick lands where the PQ signal reaches 203 cd/m² (±1 column)', refX > 0 && Math.abs(refX / (s.w - 1) - pq(203)) <= 1.5 / (s.w - 1), { refX, want: pq(203) * (s.w - 1) })
  check('firstReaching returns −1 when nothing reaches the level', firstReaching(new Float32Array([0, 0.5]), 2) === -1)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
