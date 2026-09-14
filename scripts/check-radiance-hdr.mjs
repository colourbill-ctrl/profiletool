#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/radianceHdr.js — the Radiance HDR (.hdr, RGBE) decoder the HDR tab
// uses — in Node.
//
// Two kinds of evidence, because a decoder tested only against its own encoder can share
// its misreading of the format:
//   1. SYNTHETIC files written here byte by byte in all three scanline encodings (new-style
//      RLE, old-style repeat markers, flat), every orientation, and malformed variants that
//      must be refused rather than read past the end.
//   2. REAL files from Poly Haven (test-corpus/hdr-images/polyhaven/), each published as both
//      .hdr and .exr of the same capture. The .exr is decoded by the iccimage WASM (tinyexr),
//      an independent implementation, and the two must agree to RGBE's quantisation.
//
// Usage: node scripts/check-radiance-hdr.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeRadiance, isRadianceHdr, MAX_RADIANCE_PIXELS } from '../frontend/src/lib/radianceHdr.js'
import { classifyFile, rejectReason, FileKind, ImageFormat } from '../frontend/src/lib/fileKind.js'
import { normalizeChromaticities } from '../frontend/src/lib/hdrPixels.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`)
}
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }
const floats = (d) => new Float32Array(d.samples.buffer, d.samples.byteOffset, d.samples.byteLength / 4)

// ── a small reference ENCODER, written from the format description ────────────
const enc = new TextEncoder()
// float RGB → RGBE, as Radiance's setcolr(): mantissa from frexp, E biased by 128.
function toRgbe(r, g, b) {
  const v = Math.max(r, g, b)
  if (v < 1e-32) return [0, 0, 0, 0]
  let e = Math.ceil(Math.log2(v))
  if (v / 2 ** e >= 1) e++                  // keep the mantissa in [0.5, 1)
  if (v / 2 ** e < 0.5) e--
  const s = 256 / 2 ** e
  return [Math.floor(r * s), Math.floor(g * s), Math.floor(b * s), e + 128]
}
function header(res, extra = []) {
  return enc.encode(['#?RADIANCE', ...extra, 'FORMAT=32-bit_rle_rgbe', '', res, ''].join('\n'))
}
// scanlines: array of arrays of [R,G,B,E]; mode 'rle' | 'flat' | 'oldrle'
function body(scanlines, mode) {
  const out = []
  for (const px of scanlines) {
    const w = px.length
    if (mode === 'flat') { for (const p of px) out.push(...p); continue }
    if (mode === 'oldrle') {
      // Collapse runs of identical pixels into one pixel + a (1,1,1,n) marker (n < 256).
      let j = 0
      while (j < w) {
        const p = px[j]
        out.push(...p)
        let n = 0
        while (j + 1 + n < w && n < 255 && px[j + 1 + n].every((v, k) => v === p[k])) n++
        if (n > 0) out.push(1, 1, 1, n)
        j += 1 + n
      }
      continue
    }
    out.push(2, 2, w >> 8, w & 0xff)
    for (let c = 0; c < 4; c++) {
      const ch = px.map((p) => p[c])
      let j = 0
      while (j < w) {
        let run = 1
        while (j + run < w && run < 127 && ch[j + run] === ch[j]) run++
        if (run >= 4) { out.push(128 + run, ch[j]); j += run; continue }
        let lit = 0
        while (j + lit < w && lit < 128) {
          let r2 = 1
          while (j + lit + r2 < w && r2 < 4 && ch[j + lit + r2] === ch[j + lit]) r2++
          if (r2 >= 4) break
          lit++
        }
        out.push(lit, ...ch.slice(j, j + lit)); j += lit
      }
    }
  }
  return Uint8Array.from(out)
}
const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length } return o }

// A W×H test pattern with distinct values per pixel, runs (flat regions) and black.
const W = 37, H = 5
const truth = (x, y) => (y === 2 && x >= 10 && x < 30) ? [0, 0, 0]              // black run
  : (y === 3) ? [4.5, 4.5, 4.5]                                                   // one long run
  : [0.01 + x * 0.25, 0.5 + y * 3, x * y * 0.125 + 0.001]
const px = (x, y) => toRgbe(...truth(x, y))
// Decoded value of an RGBE pixel, per colr_color, for exact expectations.
const val = (p) => p[3] === 0 ? [0, 0, 0] : [0, 1, 2].map((c) => (p[c] + 0.5) * 2 ** (p[3] - 136))

// Standard orientation: scanlines = rows, top first, left to right.
const stdRows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => px(x, y)))
function expectStd(d, label) {
  const f = floats(d)
  let worst = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = val(px(x, y)), o = (y * W + x) * 3
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(f[o + c] - e[c]))
  }
  check(`${label}: ${d.width}×${d.height}, every pixel exact`, d.width === W && d.height === H && worst < 1e-6, { worst, w: d.width, h: d.height })
}

// ── synthetic: the three encodings ───────────────────────────────────────────
for (const mode of ['rle', 'flat', 'oldrle']) {
  const file = cat(header(`-Y ${H} +X ${W}`), body(stdRows, mode))
  const d = decodeRadiance(file)
  expectStd(d, `encoding ${mode}`)
  if (mode === 'rle') check('  reports RLE compression', d.compression === 'RLE', d.compression)
  if (mode === 'flat') check('  reports no compression', d.compression === 'none', d.compression)
}
{
  const file = cat(header(`-Y ${H} +X ${W}`), body(stdRows, 'rle'))
  const d = decodeRadiance(file)
  check('decoded shape matches iccimage decodeImage (3-ch float, LE Float32 bytes)', d.ok && d.channels === 3 && d.sampleFormat === 'float' && d.bitDepth === 32 && d.samples instanceof Uint8Array && d.samples.byteLength === W * H * 12)
  const f = floats(d)
  check('RGBE (…, E=0) decodes to exact black', f[(2 * W + 15) * 3] === 0 && f[(2 * W + 15) * 3 + 1] === 0)
  check('value formula (byte + 0.5)·2^(E−136)', Math.abs(f[(3 * W) * 3] - val(px(0, 3))[0]) < 1e-9 && Math.abs(val(px(0, 3))[0] - 4.5) / 4.5 < 1 / 128)
}
// Mixed: scanline 0 RLE, the rest flat — Radiance's reader decides per scanline.
{
  const file = cat(header(`-Y ${H} +X ${W}`), body(stdRows.slice(0, 1), 'rle'), body(stdRows.slice(1), 'flat'))
  expectStd(decodeRadiance(file), 'mixed RLE and flat scanlines')
}
// Narrow images (< 8 px) are never RLE-coded; a flat scanline starting 2,2 must still read.
{
  const rows = [[[2, 2, 0, 130], [9, 9, 9, 129], [1, 2, 3, 128]]]
  const d = decodeRadiance(cat(header('-Y 1 +X 3'), body(rows, 'flat')))
  const f = floats(d)
  check('width < 8: a pixel beginning 2,2 is read as a pixel, not an RLE marker', Math.abs(f[0] - 2.5 * 2 ** -6) < 1e-12 && Math.abs(f[3] - 9.5 * 2 ** -7) < 1e-12)
}

// ── synthetic: orientations ──────────────────────────────────────────────────
// Build the file for each resolution string by walking its scan order over the standard
// image, then require the decoder to put every pixel back in top-row-first order.
const ORIENTS = ['-Y H +X W', '-Y H -X W', '+Y H +X W', '+Y H -X W', '+X W -Y H', '-X W -Y H', '+X W +Y H', '-X W +Y H']
for (const o of ORIENTS) {
  const [a, b] = o.split(/\s+(?=[-+][XY])/)
  const yFirst = a[1] === 'Y'
  const sY = yFirst ? a[0] : b[0], sX = yFirst ? b[0] : a[0]
  const n1 = yFirst ? H : W, n2 = yFirst ? W : H
  const scan = []
  for (let i = 0; i < n1; i++) {
    const row = []
    for (let j = 0; j < n2; j++) {
      const fy = yFirst ? i : j, fx = yFirst ? j : i
      row.push(px(sX === '+' ? fx : W - 1 - fx, sY === '-' ? fy : H - 1 - fy))
    }
    scan.push(row)
  }
  const res = o.replace(/H/, String(H)).replace(/W/, String(W))
  // Columns are only 5 px long, below the RLE minimum, so X-first files are written flat.
  expectStd(decodeRadiance(cat(header(res), body(scan, yFirst ? 'rle' : 'flat'))), `orientation "${res}"`)
}

// ── header fields ────────────────────────────────────────────────────────────
{
  const rows = [Array.from({ length: 8 }, () => [128, 128, 128, 129])]
  const d = decodeRadiance(cat(header('-Y 1 +X 8', ['# comment line', 'EXPOSURE=2', 'SOFTWARE=test', 'EXPOSURE=1.5', 'PRIMARIES=0.680 0.320 0.265 0.690 0.150 0.060 0.3127 0.3290']), body(rows, 'rle')))
  check('EXPOSURE lines are cumulative and reported (2 × 1.5 = 3), values not rescaled', d.exposure === 3 && Math.abs(floats(d)[0] - 128.5 / 128) < 1e-9, d.exposure)
  const p = normalizeChromaticities(d.chromaticities)
  check('PRIMARIES parsed into chromaticities (Display P3)', p && p.red[0] === 0.68 && p.white[1] === 0.329, d.chromaticities)
  const z = decodeRadiance(cat(header('-Y 1 +X 8', ['GAMMA=1', 'PRIMARIES=0 0 0 0 0 0 0 0']), body(rows, 'rle')))
  check('Photoshop\'s all-zero PRIMARIES states nothing → Rec. 709 assumed downstream', normalizeChromaticities(z.chromaticities) === null)
  const crlf = enc.encode('#?RGBE\r\nFORMAT=32-bit_rle_rgbe\r\n\r\n-Y 1 +X 8\r\n')
  check('"#?RGBE" magic and CRLF line endings accepted', decodeRadiance(cat(crlf, body(rows, 'rle'))).width === 8)
}

// ── refusals: malformed files must throw, never read out of bounds ────────────
{
  const good = cat(header(`-Y ${H} +X ${W}`), body(stdRows, 'rle'))
  check('refuses: no magic', throws(() => decodeRadiance(good.slice(2)), /signature/))
  check('refuses: truncated pixel data', throws(() => decodeRadiance(good.slice(0, good.length - 7)), /truncated/))
  check('refuses: file ends in header', throws(() => decodeRadiance(enc.encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n')), /header/))
  check('refuses: XYZE pixels', throws(() => decodeRadiance(cat(enc.encode('#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 8\n'), new Uint8Array(32))), /xyze/))
  check('refuses: bad resolution line', throws(() => decodeRadiance(enc.encode('#?RADIANCE\n\n-Y 5 -Y 5\n')), /resolution/))
  check(`refuses: over ${MAX_RADIANCE_PIXELS / 1e6} MP, before allocating`, throws(() => decodeRadiance(enc.encode('#?RADIANCE\n\n-Y 20000 +X 20000\n')), /limit/))
  // RLE run longer than the rest of the scanline (129+100 on an 8-wide line).
  const over = cat(header('-Y 1 +X 8'), Uint8Array.from([2, 2, 0, 8, 228, 7]))
  check('refuses: RLE run overflowing the scanline', throws(() => decodeRadiance(over), /overflows/))
  const lit0 = cat(header('-Y 1 +X 8'), Uint8Array.from([2, 2, 0, 8, 0]))
  check('refuses: zero literal count (would loop forever)', throws(() => decodeRadiance(lit0), /literal/))
  const wrongW = cat(header('-Y 1 +X 8'), Uint8Array.from([2, 2, 0, 9]))
  check('refuses: RLE scanline width ≠ header width', throws(() => decodeRadiance(wrongW), /width/))
  const rep0 = cat(header('-Y 1 +X 2'), Uint8Array.from([1, 1, 1, 1]))
  check('refuses: old-style repeat with no pixel before it', throws(() => decodeRadiance(rep0), /repeat/))

  // Allocation bombs: refused from the header and the file size alone, before the output
  // buffer exists. Timed, because an allocate-then-fail decoder also "refuses" these.
  {
    const t0 = performance.now()
    const headerOnly = header('-Y 6324 +X 6324')
    check('refuses: header-only 40 MP file as truncated, without allocating',
      throws(() => decodeRadiance(headerOnly), /truncated/) && performance.now() - t0 < 50, `${(performance.now() - t0).toFixed(1)} ms`)
    // One pixel plus repeat markers per scanline describes 6324×6324 in ~76 KB.
    const scan = Uint8Array.from([128, 128, 128, 128, 1, 1, 1, 0xb3, 1, 1, 1, 0x18])
    const rows = new Uint8Array(scan.length * 6324)
    for (let i = 0; i < 6324; i++) rows.set(scan, i * scan.length)
    const t1 = performance.now()
    check('refuses: repeat-marker decompression bomb (~76 KB → 40 MP)',
      throws(() => decodeRadiance(cat(header('-Y 6324 +X 6324'), rows)), /compression/) && performance.now() - t1 < 50, `${(performance.now() - t1).toFixed(1)} ms`)
  }
  // A 4th consecutive repeat marker is legal (Radiance oldreadcolrs has no digit limit short
  // of the run fitting): 0, 0, 0, 1 repeats the pixel 2^24 times. Padded so the file is not
  // rejected as a bomb; the pad is past the last scanline and never read.
  {
    const W = 2 ** 24 + 1
    const px = Uint8Array.from([100, 50, 25, 129, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1])
    const pad = new Uint8Array(Math.ceil(W / 64) + 64)
    let d = null
    try { d = decodeRadiance(cat(header(`-Y 1 +X ${W}`), px, pad)) } catch (e) { d = { error: e.message } }
    const f = d.rgb
    const same = f && f[3 * (W - 1)] === f[0] && f[3 * (W - 1) + 2] === f[2] && f[0] > 0
    check('accepts: 4th repeat marker (2^24-pixel run) and fills the whole scanline', !!same, d.error || `${d.width}×${d.height}`)
  }
  // `rgb` is the samples' own float view — no second copy.
  {
    const d = decodeRadiance(good)
    check('rgb is a Float32Array over the same buffer as samples', d.rgb instanceof Float32Array && d.rgb.buffer === d.samples.buffer && d.rgb.length * 4 === d.samples.byteLength)
  }
}

// ── file classification ──────────────────────────────────────────────────────
{
  const c1 = classifyFile(enc.encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n'))
  const c2 = classifyFile(enc.encode('#?RGBE\n'))
  check('classifyFile: #?RADIANCE and #?RGBE → image/hdr', c1.kind === FileKind.IMAGE && c1.format === ImageFormat.HDR && c2.format === ImageFormat.HDR, [c1, c2])
  check('classifyFile: "#?" alone is not Radiance', classifyFile(enc.encode('#?HELLO\n')).kind === FileKind.UNKNOWN && !isRadianceHdr(enc.encode('#?')))
  check('pool refusal explains the format has no ICC slot', /Radiance HDR carries no ICC profile/.test(rejectReason(FileKind.IMAGE, ImageFormat.HDR)), rejectReason(FileKind.IMAGE, ImageFormat.HDR))
}

// ── real files: .hdr vs .exr of the same capture, decoded independently ────────
const PH = join(ROOT, 'test-corpus/hdr-images/polyhaven')
const pairs = existsSync(PH) ? readdirSync(PH).filter((f) => f.endsWith('.hdr')).map((f) => f.slice(0, -4)).filter((b) => existsSync(join(PH, b + '.exr'))) : []
check('Poly Haven .hdr/.exr pairs present', pairs.length >= 3, pairs)
if (pairs.length) {
  const createIccImageModule = (await import(join(ROOT, 'frontend/public/wasm/iccimage.mjs'))).default
  const mod = await createIccImageModule()
  for (const b of pairs) {
    const h = decodeRadiance(new Uint8Array(readFileSync(join(PH, b + '.hdr'))))
    const x = mod.decodeImage(new Uint8Array(readFileSync(join(PH, b + '.exr'))))
    const hf = floats(h)
    const xr = x.samples, xf = new Float32Array(xr.buffer.slice(xr.byteOffset, xr.byteOffset + xr.byteLength))
    const n = h.width * h.height
    // RGBE stores one shared exponent with 8-bit mantissas, so each channel is exact only to
    // 1/256 of the pixel's BRIGHTEST channel (plus the half-step offset). Measure every
    // channel's error in that unit; a wrong orientation or exponent is off by whole units.
    let within = 0, peakH = 0, peakX = 0, sumH = 0, sumX = 0
    for (let i = 0; i < n; i++) {
      const o = i * 3
      const m = Math.max(xf[o], xf[o + 1], xf[o + 2], 1e-6)
      let ok = true
      for (let c = 0; c < 3; c++) {
        if (Math.abs(hf[o + c] - xf[o + c]) > m * (3 / 256) + 1e-6) ok = false
        sumH += hf[o + c]; sumX += xf[o + c]
      }
      if (ok) within++
      peakH = Math.max(peakH, hf[o], hf[o + 1], hf[o + 2]); peakX = Math.max(peakX, xf[o], xf[o + 1], xf[o + 2])
    }
    const share = within / n
    check(`${b}: ${h.width}×${h.height} matches the EXR (${x.compression}) — ${(share * 100).toFixed(3)}% of pixels within RGBE quantisation`,
      x.ok && h.width === x.width && h.height === x.height && share > 0.999, { share, meanRatio: sumH / sumX })
    check(`${b}: peak ${peakH.toFixed(1)} vs EXR ${peakX.toFixed(1)}; mean ratio ${(sumH / sumX).toFixed(4)}`,
      Math.abs(peakH / peakX - 1) < 0.02 && Math.abs(sumH / sumX - 1) < 0.01)
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
