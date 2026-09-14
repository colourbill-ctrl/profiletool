#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the HAGC CLAMP fixture (test-corpus/hdr/ProfiletoolHagcClamp): a headroom-
// AdaptiveGainCurveTag with the Headroom Adaptive Tone Map flag SET and ZERO alternate images.
// Proposal 1.2.2.6: no tone mapping, and the baseline image is clamped to the target colour
// volume. Checked on both sides of the division of labour IccProfLib draws:
//
//   EVALUATOR (iccplot hagcEvaluate → CIccHagcEvaluator): accepts the tag, builds no curves,
//     reports ClampsToTargetVolume, and applies NO gain — the grey output is the identity at
//     every headroom, because the clamp is the caller's job, not the evaluator's.
//   CMM (iccconstruct hdrApplyBegin/Chunk): does that clamp — grey output is
//     min(input, target headroom) relative to HDR reference white — and engages no gain curve.
//
// And against its twin HagcHexData (flag CLEAR, zero alternates), which the evaluator must
// decline before the count matters — the difference this fixture exists to pin.
//
// Usage: node scripts/check-hagc-clamp.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM = join(ROOT, 'frontend/public/wasm')
const HDR = join(ROOT, 'test-corpus/hdr')
const load = async (name) => (await import(pathToFileURL(join(WASM, `${name}.mjs`)).href)).default({ locateFile: (p) => join(WASM, p) })
const plot = await load('iccplot')
const cmm = await load('iccconstruct')
const bytesOf = (f) => new Uint8Array(readFileSync(join(HDR, f)))
const clamp = bytesOf('ProfiletoolHagcClamp.icc')

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// ── evaluator ────────────────────────────────────────────────────────────────
for (const h of [0, 1.5, 2, 5, 6]) {
  const r = JSON.parse(plot.hagcEvaluate(clamp, h, 33))
  check(`evaluator @${h} stops: supported, ClampsToTargetVolume, no curves, baseline 2, reference white 203`,
    r.supported === true && r.clampsToTargetVolume === true && r.curves.length === 0 && rel(r.baselineHeadroom, 2, 1e-6) && rel(r.referenceWhite, 203, 1e-6) && !r.unsupportedReason, r)
  check(`evaluator @${h} stops: no gain (0 everywhere) and grey output = input — the clamp is left to the caller`,
    r.x.length > 0 && r.blendGain.every((g) => g === 0) && r.neutralOut.every((o, i) => rel(o, r.x[i], 1e-6)), { G: r.blendGain.slice(0, 4), out: r.neutralOut.slice(0, 4) })
}
{
  const twin = JSON.parse(plot.hagcEvaluate(bytesOf('HagcHexData.icc'), 2, 9))
  check('twin HagcHexData (flag clear, zero alternates) is declined — flag, not count, decides',
    twin.supported === false && twin.clampsToTargetVolume === false && /Headroom Adaptive Tone Map flag is not set/.test(twin.unsupportedReason), twin)
}

// ── CMM ─────────────────────────────────────────────────────────────────────
const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = nits / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const X = [0.5, 1, 2, 4, 8, 4000 / 203]            // × HDR reference white (203 cd/m²)
const greys = new Float32Array(X.flatMap((x) => { const s = pq(x * 203); return [s, s, s] }))
function applyY(headroom, policy) {
  const info = cmm.hdrApplyBegin(clamp, headroom, policy, 1)
  try {
    const r = cmm.hdrApplyChunk(new Uint8Array(greys.slice().buffer))
    return { info, Y: X.map((_, i) => r.xyz[i * 3 + 1]) }
  } finally { cmm.hdrApplyEnd() }
}
for (const headroom of [1, 4, 16]) {
  for (const policy of [0, 1]) {
    const { info, Y } = applyY(headroom, policy)
    const want = X.map((x) => Math.min(x, headroom))
    check(`CMM headroom ${headroom}×, policy ${policy ? 'HAGC' : 'auto'}: HDR path, no gain curve, grey = min(input, ${headroom})`,
      info.hdrPath === true && info.toneMapping === false && info.transfer === 16 && Y.every((y, i) => rel(y, want[i], 5e-3)), { Y, want })
  }
}
{
  const lut = applyY(4, 2)
  check('CMM policy lut: baked AToB0 path instead (not the HDR path)', lut.info.hdrPath === false, lut.info)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
