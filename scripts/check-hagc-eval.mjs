#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the HAGC EVALUATED view — iccplot's hagcEvaluate(), i.e. IccVizModel::EvaluateHagc
// over IccProfLib's CIccHagcEvaluator — against what HagcDisplay.icc AUTHORS.
//
// The expectations are read off the fixture's XML, not off the evaluator: the piecewise
// cubic must pass through every authored control point, the baseline must be identity,
// inputs above the last point must clip (G = y_last + log2(x_last / x) makes x·2^G
// constant), and a target outside the tag's headroom range must use the endpoint curve.
// A sampling or packaging bug in the new code would break one of those; a bug inside
// IccProfLib would too, which is the point of checking against the file.
//
// Usage: node scripts/check-hagc-eval.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM = join(ROOT, 'frontend/public/wasm')
const HDR = join(ROOT, 'test-corpus/hdr')
const factory = (await import(pathToFileURL(join(WASM, 'iccplot.mjs')).href)).default
const mod = await factory({ locateFile: (p) => join(WASM, p) })

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}
const bytesOf = (f) => new Uint8Array(readFileSync(join(HDR, f)))
const evalAt = (bytes, h, n = 129) => JSON.parse(mod.hagcEvaluate(bytes, h, n))
const near = (a, b, tol = 1e-4) => a != null && Math.abs(a - b) <= tol
const idx = (r, xv) => r.x.findIndex((v) => Math.abs(v - xv) < 1e-6)

check('module exports hagcEvaluate', typeof mod.hagcEvaluate === 'function')

// ── HagcDisplay: baseline 3 stops; alternate at 0 (explicit slopes), alternate at 5 (PCHIP) ──
const hd = bytesOf('HagcDisplay.icc')
{
  const r = evalAt(hd, 3)
  check('HagcDisplay: supported, baseline 3, reference white 300 cd/m²', r.supported && near(r.baselineHeadroom, 3) && near(r.referenceWhite, 300), r)
  check('HagcDisplay: curves ordered by headroom 0, 3, 5; baseline is identity',
    r.curves.length === 3 && near(r.curves[0].headroom, 0) && near(r.curves[1].headroom, 3) && near(r.curves[2].headroom, 5) && r.curves[1].identity && !r.curves[0].identity,
    r.curves.map((c) => [c.headroom, c.identity]))
  check('HagcDisplay: 129 samples on a grid that contains every control-point x',
    r.x.length === 129 && [0.25, 0.5, 0.75, 1, 1.5].every((xv) => idx(r, xv) >= 0), { n: r.x.length, xmax: r.x[128] })
  check('at the baseline headroom the grey tone curve is identity', r.neutralOut.every((o, i) => near(o, r.x[i], 1e-5)))
  check('at the baseline headroom the blended gain is 0 throughout', r.blendGain.every((g) => near(g, 0, 1e-6)))
  check('PCHIP-derived slopes are reported (alternate 1 carries none)', r.derivedSlopes === true)
}
{
  const r = evalAt(hd, 0)
  const pts = [[0.25, -0.1], [0.5, -0.2], [0.75, -0.3], [1.0, -0.4]]
  check('target 0: blended gain passes through alternate 0\'s control points',
    pts.every(([xv, yv]) => near(r.blendGain[idx(r, xv)], yv)), pts.map(([xv]) => r.blendGain[idx(r, xv)]))
  check('target 0: constant below the first control point (G = y0)', near(r.blendGain[1], -0.1), r.blendGain[1])
  const clip = 2 ** -0.4 * 1.0
  const above = r.x.map((xv, i) => [xv, r.neutralOut[i]]).filter(([xv]) => xv > 1.0001)
  check('target 0: above the last point the output clips to 2^y_last · x_last = 0.7579', above.length > 0 && above.every(([, o]) => near(o, clip, 1e-4)), above.slice(0, 3))
  check('target 0: curve sample for headroom 0 equals the blend', r.curves[0].gain.every((g, i) => near(g, r.blendGain[i], 1e-6)))
}
{
  const r = evalAt(hd, 5)
  const pts = [[0.5, 0.2], [1.0, 0.4], [1.5, 0.6]]
  check('target 5: blended gain passes through alternate 1\'s control points',
    pts.every(([xv, yv]) => near(r.blendGain[idx(r, xv)], yv)), pts.map(([xv]) => r.blendGain[idx(r, xv)]))
  const r7 = evalAt(hd, 7)
  check('target 7 (above the last curve): the endpoint curve is used unchanged', r7.blendGain.every((g, i) => near(g, r.blendGain[i], 1e-6)))
  const rm = evalAt(hd, -2)
  const r0 = evalAt(hd, 0)
  check('target −2 (below the first curve): the endpoint curve is used unchanged', rm.blendGain.every((g, i) => near(g, r0.blendGain[i], 1e-6)))
}
{
  // Between baseline 3 and alternate 5 the blend lies between the two curves at every x.
  const r4 = evalAt(hd, 4), r5 = evalAt(hd, 5)
  const between = r4.blendGain.every((g, i) => {
    const lo = Math.min(0, r5.blendGain[i]), hi = Math.max(0, r5.blendGain[i])
    return g >= lo - 1e-6 && g <= hi + 1e-6
  })
  check('target 4: blended gain lies between the baseline (0) and the 5-stop curve', between)
  const i1 = idx(r4, 1.0)
  check('target 4: blend is strictly inside, not at either end (weights are applied)', r4.blendGain[i1] > 1e-3 && r4.blendGain[i1] < r5.blendGain[i1] - 1e-3, [r4.blendGain[i1], r5.blendGain[i1]])
}
{
  check('sample count is clamped to [16, 1024]', evalAt(hd, 3, 2).x.length === 16 && evalAt(hd, 3, 99999).x.length === 1024 && evalAt(hd, 3, 0).x.length === 129)
  const bad = JSON.parse(mod.hagcEvaluate(hd, NaN, 129))
  check('NaN target → error, not a silently stale curve', typeof bad.error === 'string' && /not a number/.test(bad.error), bad)
  const none = JSON.parse(mod.hagcEvaluate(bytesOf('HdrDisplayMetadata.icc'), 3, 129))
  check('profile without a HAGC tag → error "not found"', typeof none.error === 'string' && /not found/.test(none.error), none)
}
{
  // The authored-points graph's x axis was mislabelled "log2" — the evaluator takes linear x.
  const list = JSON.parse(mod.enumerate(hd))
  const d = list.find((v) => v.kind === 9)
  const g = d ? JSON.parse(mod.renderGraph(hd, d.id)) : null
  check('Gain curve graph x axis is labelled linear, not log2', g && /linear/.test(g.xAxis.label) && !/log2/.test(g.xAxis.label), g && g.xAxis.label)
}

// ── every HAGC-carrying fixture: no crash, consistent shapes, honest flags ──
for (const f of readdirSync(HDR).filter((n) => n.endsWith('.icc')).sort()) {
  const b = bytesOf(f)
  const list = JSON.parse(mod.enumerate(b))
  const hasTag = Array.isArray(list) && list.some((v) => v.kind === 9)
  const xml = (() => { try { return readFileSync(join(HDR, f.replace(/\.icc$/, '.xml')), 'utf8') } catch { return '' } })()
  // Match the tag ELEMENT, not the word: HdrBakedLut and HdrColorSpaceClass mention the tag
  // in XML comments without carrying it, and would otherwise be tested as HAGC profiles.
  if (!/<headroomAdaptiveGainCurveTag>/.test(xml) && !hasTag) continue
  const r = JSON.parse(mod.hagcEvaluate(b, 2.5, 64))
  if (r.error) { check(`${f}: evaluates without error`, false, r.error); continue }
  if (!r.supported) {
    check(`${f}: unsupported, with the library's reason`, typeof r.unsupportedReason === 'string' && r.unsupportedReason.length > 0, r.unsupportedReason)
    continue
  }
  const n = r.x.length
  const shapes = r.neutralOut.length === n && (r.blendGain.length === n || (!r.sharedMixing && r.blendGain.length === 0)) && r.curves.every((c) => c.gain.length === n)
  check(`${f}: supported; every series has ${n} samples`, shapes, { n, neutral: r.neutralOut.length, blend: r.blendGain.length })
  if (/HagcRefWhiteToneMap/.test(f)) check(`${f}: reports its curves as derived (reference-white tone map)`, r.derivedRefWhiteToneMap === true)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
