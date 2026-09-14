#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the BAKED-FALLBACK fixture test-corpus/hdr/ProfiletoolHagcBaked.icc — ProfiletoolHagcFamily
// with the identity AToB0/BToA0 pair replaced by what iccDEV's own baker (iccHdrFallback -grid 33,
// ICC White Paper #62, headroom 1.0) produces — through iccconstruct's HDR CMM in Node.
//
// Reference numbers are from iccDEV's NATIVE iccApplyNamedCmm at hdr-profiles 649fc750 (a native
// build of the pinned worktree), intent 1, float XYZ out, for grey PQ code values of
// 0, 50, 100, 203, 300, 600, 1000, 4000, 10000 cd/m², then green PQ(600) and blue PQ(1000):
//   ProfiletoolHagcBaked  -HDR 1 -HDRMAP lut   Y = 0 0.238724 0.447105 0.726858 0.816266 0.904094 1.000015 1.000015 1.000015 | G 0.668966 | B 0.044555
//                         (no -HDR)            identical — the baked table IS the pre-amendment rendering
//                         -HDR 1 -HDRMAP hagc  Y = 0 0.237915 0.445030 0.732043 0.821056 0.899150 1 1 1 | G 0.840536 | B 0.061326
//   ProfiletoolHagcFamily (no -HDR)            Y = 0.000001 0.880550 1.016141 1.161360 1.243707 1.392567 1.503631 1.805117 1.999969
//                         (identity pair: PQ code values pass through)
//
// What is pinned:
//   1. the fixture is what it claims: HAGC/cicp/metadata identical to the family, AToB0/BToA0 real;
//   2. WASM agrees with native for the baked table, with and without the HDR hint;
//   3. grey through the baked table follows the gain curve at headroom 1.0 within the CLUT's error;
//   4. saturated highlights above the peak are clipped per channel by the table (a lutAToBType
//      cannot hold > 1.0), where the gain-curve path keeps them — by design, not a defect;
//   5. the family's identity pair does NOT render SDR (why this fixture exists).
//
// Usage: node scripts/check-hagc-baked.mjs

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

const POLICY = { auto: 0, hagc: 1, lut: 2, off: 3 }
const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = nits / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const NITS = [0, 50, 100, 203, 300, 600, 1000, 4000, 10000]
const samples = new Float32Array([...NITS.flatMap((n) => [pq(n), pq(n), pq(n)]), 0, pq(600), 0, 0, 0, pq(1000)])

const BAKED = readFileSync(join(HDR, 'ProfiletoolHagcBaked.icc'))
const FAMILY = readFileSync(join(HDR, 'ProfiletoolHagcFamily.icc'))

function run(bytes, headroom, policy) {
  const info = mod.hdrApplyBegin(new Uint8Array(bytes), headroom, policy, 1)
  try {
    const xyz = Array.from(mod.hdrApplyChunk(new Uint8Array(samples.slice().buffer)).xyz)
    const Y = (i) => xyz[i * 3 + 1]
    return { info, xyz, grey: NITS.map((_, i) => Y(i)), green: Y(NITS.length), blue: Y(NITS.length + 1) }
  } finally { mod.hdrApplyEnd() }
}
const near = (got, want, tol) => got.every((v, i) => Math.abs(v - want[i]) <= Math.max(tol, tol * Math.abs(want[i])))

// ── 1. the fixture itself ───────────────────────────────────────────────────
function tags(b) {
  const m = new Map()
  for (let i = 0, n = b.readUInt32BE(128); i < n; i++) {
    const o = 132 + i * 12
    m.set(b.toString('latin1', o, o + 4), b.subarray(b.readUInt32BE(o + 4), b.readUInt32BE(o + 4) + b.readUInt32BE(o + 8)))
  }
  return m
}
{
  const bt = tags(BAKED), ft = tags(FAMILY)
  check('HAGC, cicp and metadata tags identical to ProfiletoolHagcFamily (bake copies them)',
    ['HAGC', 'cicp', 'meta'].every((s) => bt.get(s)?.equals(ft.get(s))))
  // The family's placeholder tables are a few dozen bytes; a 33³ CLUT with 1024-entry curves is
  // hundreds of kilobytes, and must be an 'mAB ' / 'mBA ' table.
  check('AToB0 is a real lutAToBType (mAB, > 100 KB), BToA0 a real lutBToAType (mBA, > 100 KB)',
    bt.get('A2B0')?.toString('latin1', 0, 4) === 'mAB ' && bt.get('A2B0').length > 100_000 &&
    bt.get('B2A0')?.toString('latin1', 0, 4) === 'mBA ' && bt.get('B2A0').length > 100_000,
    [bt.get('A2B0')?.length, bt.get('B2A0')?.length])
  check('the family\'s pair really was a placeholder (< 1 KB each)', ft.get('A2B0').length < 1024 && ft.get('B2A0').length < 1024)
}

// ── 2. WASM agrees with native iccApplyNamedCmm ─────────────────────────────
const NATIVE_LUT = [0, 0.238724, 0.447105, 0.726858, 0.816266, 0.904094, 1.000015, 1.000015, 1.000015]
const NATIVE_HAGC = [0, 0.237915, 0.445030, 0.732043, 0.821056, 0.899150, 1, 1, 1]
const lut = run(BAKED, 1, POLICY.lut)
check('baked, -HDR 1 lut: grey matches native to 1e-4', near(lut.grey, NATIVE_LUT, 1e-4), lut.grey)
check('baked, -HDR 1 lut: saturated green/blue match native', near([lut.green, lut.blue], [0.668966, 0.044555], 1e-4), [lut.green, lut.blue])
check('baked, -HDR 1 lut: reported as the baked-table path (not HDR, no tone mapping)', lut.info.hdrPath === false && !lut.info.toneMapping, lut.info)
const noHint = run(BAKED, 0, POLICY.auto)
check('baked, no HDR hint (pre-amendment CMM): same rendering as the lut policy', near(noHint.grey, lut.grey, 1e-6) && near([noHint.green, noHint.blue], [lut.green, lut.blue], 1e-6), noHint.grey)
const hagc = run(BAKED, 1, POLICY.hagc)
check('baked, -HDR 1 hagc: grey matches native (the gain curve still evaluates dynamically)', near(hagc.grey, NATIVE_HAGC, 1e-4) && hagc.info.hdrPath === true, hagc.grey)
check('baked, -HDR 1 hagc: saturated green/blue match native', near([hagc.green, hagc.blue], [0.840536, 0.061326], 1e-4), [hagc.green, hagc.blue])

// ── 3. grey: baked table ≈ gain curve at headroom 1.0 ───────────────────────
{
  let worst = 0
  lut.grey.forEach((v, i) => { if (hagc.grey[i] > 0.05) worst = Math.max(worst, Math.abs(v - hagc.grey[i]) / hagc.grey[i]) })
  check('grey: baked table within 1% of the gain curve at headroom 1.0 (measured 0.8% on these levels)', worst <= 0.01, `${(100 * worst).toFixed(2)}%`)
  check('grey: baked table is an SDR rendering — peaks at 1.0 = reference white, monotone',
    Math.abs(Math.max(...lut.grey) - 1) < 1e-3 && lut.grey.every((v, i) => i === 0 || v >= lut.grey[i - 1] - 1e-6), lut.grey)
}

// ── 4. saturated highlights: per-channel clip in the table, by design ───────
check('saturated green at 600 cd/m²: table clips to the primary\'s own peak (Y 0.669), gain curve keeps Y 0.841',
  lut.green < hagc.green - 0.1 && Math.abs(lut.green - 0.669) < 2e-3, [lut.green, hagc.green])
check('saturated blue at 1000 cd/m²: table clips (Y 0.0446 < 0.0613 on the curve)', lut.blue < hagc.blue - 0.01, [lut.blue, hagc.blue])

// ── 5. why the fixture exists: the identity pair renders code values ────────
{
  const fam = run(FAMILY, 0, POLICY.auto)
  const NATIVE_FAMILY = [0.000001, 0.880550, 1.016141, 1.161360, 1.243707, 1.392567, 1.503631, 1.805117, 1.999969]
  check('family, no HDR hint: identity pair passes PQ code values through (matches native)', near(fam.grey, NATIVE_FAMILY, 1e-4), fam.grey)
  check('family: that is not an SDR rendering (grey exceeds 1.0 by up to 2×)', Math.max(...fam.grey) > 1.9)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
