#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests iccconstruct's HDR profile apply (hdrApplyBegin / hdrApplyChunk / hdrApplyEnd) in
// Node against numbers taken from iccDEV's NATIVE iccApplyNamedCmm — so the WASM entry point
// is checked against the library's own reference tool, not against itself.
//
// Reference (iccApplyNamedCmm at hdr-profiles ac264764 lineage, intent 1, float XYZ out):
// grey PQ code values for 0, 100, 203, 300, 600, 1000, 4000 cd/m² through
//   HagcDisplay.icc        -HDR 8     Y = 0 0.333332 0.676667 1.000001 1.999998 3.333330 13.333281
//                          -HDR 2.23  Y = 0 0.314686 0.601517 0.843391 1.101869 1.341816 2.290318
//                          -HDR 1     Y = 0 0.303517 0.558662 0.757858 0.757858 0.757858 0.757858
//                          lut / off / no -HDR: 0.000002 1.016140 1.161360 1.243707 1.392567 1.503631 1.805116
//   HdrDisplayMetadata.icc any -HDR   Y = 0 0.492619 1.000022 1.477866 2.955726 4.926208 19.704777
// (HagcDisplay's HDR reference white is its HAGC tag's 300 cd/m²; HdrDisplayMetadata has no
// HAGC and uses the 203 default, and with no gain curve tone-maps nothing.)
//
// Usage: node scripts/check-hdr-apply.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WASM = join(ROOT, 'frontend/public/wasm')
const HDR = join(ROOT, 'test-corpus/hdr')
const factory = (await import(pathToFileURL(join(WASM, 'iccconstruct.mjs')).href)).default
const mod = await factory({ locateFile: (p) => join(WASM, p) })

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}
const errText = (e) => { try { const m = mod.getExceptionMessage(e); return Array.isArray(m) ? m[1] || m[0] : String(m) } catch { return String(e?.message || e) } }

check('module exports hdrApplyBegin / hdrApplyChunk / hdrApplyEnd',
  ['hdrApplyBegin', 'hdrApplyChunk', 'hdrApplyEnd'].every((f) => typeof mod[f] === 'function'))
if (typeof mod.hdrApplyBegin !== 'function') { console.log(`\n${passed} passed, ${failed} failed`); process.exit(1) }

const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = nits / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const NITS = [0, 100, 203, 300, 600, 1000, 4000]
const grey = new Float32Array(NITS.flatMap((n) => [pq(n), pq(n), pq(n)]))

function run(profile, headroom, policy = 0) {
  const bytes = new Uint8Array(readFileSync(join(HDR, profile)))
  const info = mod.hdrApplyBegin(bytes, headroom, policy, 1)
  try {
    const r = mod.hdrApplyChunk(new Uint8Array(grey.slice().buffer))
    return { info, xyz: Array.from(r.xyz) }
  } finally { mod.hdrApplyEnd() }
}
const Ys = (xyz) => NITS.map((_, i) => xyz[i * 3 + 1])
const matches = (got, want, tol = 2e-3) => got.every((v, i) => Math.abs(v - want[i]) <= Math.max(tol, 1e-3 * Math.abs(want[i])))

const REF = {
  hagc8: [0, 0.333332, 0.676667, 1.000001, 1.999998, 3.333330, 13.333281],
  hagc223: [0, 0.314686, 0.601517, 0.843391, 1.101869, 1.341816, 2.290318],
  hagc1: [0, 0.303517, 0.558662, 0.757858, 0.757858, 0.757858, 0.757858],
  legacy: [0.000002, 1.016140, 1.161360, 1.243707, 1.392567, 1.503631, 1.805116],
  meta: [0, 0.492619, 1.000022, 1.477866, 2.955726, 4.926208, 19.704777],
}

{
  const a = run('HagcDisplay.icc', 8)
  check('HagcDisplay headroom 8 (baseline): Y matches native CLI — values above 1 survive', matches(Ys(a.xyz), REF.hagc8), Ys(a.xyz))
  check('HagcDisplay: reports HDR path, transfer 16 (PQ), reference white 300', a.info.hdrPath === true && a.info.transfer === 16 && Math.abs(a.info.referenceWhite - 300) < 1e-3, a.info)
  check('HagcDisplay: reports PCS XYZ, 3 source channels, HAGC present', a.info.pcs === 'XYZ' && a.info.nSrc === 3 && a.info.hasHagc === true, a.info)
  const b = run('HagcDisplay.icc', 2.23)
  check('HagcDisplay headroom 2.23: Y matches native CLI (tone-mapped)', matches(Ys(b.xyz), REF.hagc223), Ys(b.xyz))
  check('HagcDisplay headroom 2.23: gain curve engaged (toneMapping)', b.info.toneMapping === true, b.info)
  const c = run('HagcDisplay.icc', 1)
  check('HagcDisplay headroom 1 (SDR): Y matches native CLI (clips at 2^-0.4)', matches(Ys(c.xyz), REF.hagc1), Ys(c.xyz))
  const lut = run('HagcDisplay.icc', 8, 2)
  check('HagcDisplay policy lut: baked AToB0 path, matches CLI', matches(Ys(lut.xyz), REF.legacy) && lut.info.hdrPath === false, { y: Ys(lut.xyz), info: lut.info })
  const off = run('HagcDisplay.icc', 8, 3)
  check('HagcDisplay policy off: same as a pre-amendment CMM', matches(Ys(off.xyz), REF.legacy) && off.info.hdrPath === false, Ys(off.xyz))
  const none = run('HagcDisplay.icc', 0)
  check('HagcDisplay no headroom (0): no hint attached → legacy path', matches(Ys(none.xyz), REF.legacy) && none.info.hintAttached === false, none.info)
  check('neutral grey stays neutral in PCS (X/Y and Z/Y at D50 white ratios)',
    Math.abs(a.xyz[3 * 3] / a.xyz[3 * 3 + 1] - 0.9642) < 2e-3 && Math.abs(a.xyz[3 * 3 + 2] / a.xyz[3 * 3 + 1] - 0.8249) < 2e-3, a.xyz.slice(9, 12))
}
{
  const m8 = run('HdrDisplayMetadata.icc', 8)
  const m1 = run('HdrDisplayMetadata.icc', 1)
  check('HdrDisplayMetadata (no HAGC): Y matches native CLI, 1.0 at 203 cd/m²', matches(Ys(m8.xyz), REF.meta), Ys(m8.xyz))
  check('HdrDisplayMetadata: same output at any headroom (no gain curve; NOTE 6 identity)', matches(Ys(m1.xyz), REF.meta) && m1.info.toneMapping === false, m1.info)
  check('HdrDisplayMetadata: reference white 203 (default), HDR path engaged', Math.abs(m8.info.referenceWhite - 203) < 1e-3 && m8.info.hdrPath === true, m8.info)
}
{
  let msg = ''
  try { mod.hdrApplyChunk(new Uint8Array(new Float32Array(3).buffer)) } catch (e) { msg = errText(e) }
  check('chunk without a session → a clear error', /no hdr .*session|No HDR/i.test(msg), msg)
  msg = ''
  try { mod.hdrApplyBegin(new Uint8Array([1, 2, 3, 4]), 8, 0, 1) } catch (e) { msg = errText(e) }
  check('garbage profile bytes → a clear error', /could not be read|profile/i.test(msg), msg)
  const bytes = new Uint8Array(readFileSync(join(HDR, 'HagcDisplay.icc')))
  mod.hdrApplyBegin(bytes, 8, 0, 1)
  msg = ''
  try { mod.hdrApplyChunk(new Uint8Array(new Float32Array(4).buffer)) } catch (e) { msg = errText(e) }
  mod.hdrApplyEnd()
  check('chunk not a multiple of 3 floats → malformed error', /malformed/i.test(msg), msg)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
