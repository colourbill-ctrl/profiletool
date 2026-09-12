#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the EXR path in validator-wasm/iccimage-wrapper.cpp: probe (streaming, header
// only), decode (float samples), the colour attributes EXR uses INSTEAD of an ICC
// profile, and the named refusal for a compression this build cannot handle.
//
// The fixtures are written here rather than committed, for the same reason as the
// ISOBMFF ones: the cases are structural, and generating them keeps every byte
// visible as code. An uncompressed scanline EXR is simple enough to write directly,
// which also means these tests do not depend on tinyexr to produce their own input —
// if the writer and the reader disagreed, that would show up as a failure rather than
// cancelling out.
//
// Usage: node scripts/check-exr.mjs

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const createIccImageModule = (await import(join(ROOT, 'frontend/public/wasm/iccimage.mjs'))).default

// ── a minimal OpenEXR writer (uncompressed scanlines, float or half) ────────
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b }
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b }
const cstr = (s) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.from([0])])
const attr = (name, type, payload) => Buffer.concat([cstr(name), cstr(type), u32(payload.length), payload])

const PIXELTYPE_FLOAT = 2
// Channels must be written in alphabetical order; B,G,R is what that gives for RGB.
const chlist = (names) => Buffer.concat([
  ...names.map((n) => Buffer.concat([cstr(n), u32(PIXELTYPE_FLOAT), Buffer.from([1, 0, 0, 0]), u32(1), u32(1)])),
  Buffer.from([0]),
])
const box2i = (a, b, c, d) => Buffer.concat([i32(a), i32(b), i32(c), i32(d)])

function writeExr({ width, height, pixels, compression = 0, chromaticities = null, whiteLuminance = null }) {
  const names = ['B', 'G', 'R']
  const attrs = [
    attr('channels', 'chlist', chlist(names)),
    attr('compression', 'compression', Buffer.from([compression])),
    attr('dataWindow', 'box2i', box2i(0, 0, width - 1, height - 1)),
    attr('displayWindow', 'box2i', box2i(0, 0, width - 1, height - 1)),
    attr('lineOrder', 'lineOrder', Buffer.from([0])),
    attr('pixelAspectRatio', 'float', f32(1)),
    attr('screenWindowCenter', 'v2f', Buffer.concat([f32(0), f32(0)])),
    attr('screenWindowWidth', 'float', f32(1)),
  ]
  if (chromaticities) attrs.push(attr('chromaticities', 'chromaticities', Buffer.concat(chromaticities.map(f32))))
  if (whiteLuminance !== null) attrs.push(attr('whiteLuminance', 'float', f32(whiteLuminance)))
  const header = Buffer.concat([Buffer.from([0x76, 0x2f, 0x31, 0x01]), u32(2), ...attrs, Buffer.from([0])])

  // Uncompressed scanline block: y (int32), data size (uint32), then B,G,R planes.
  const blocks = []
  for (let y = 0; y < height; y++) {
    const planes = names.map((c) => {
      const b = Buffer.alloc(width * 4)
      for (let x = 0; x < width; x++) b.writeFloatLE(pixels(x, y, c), x * 4)
      return b
    })
    const data = Buffer.concat(planes)
    blocks.push(Buffer.concat([i32(y), u32(data.length), data]))
  }
  const tableSize = height * 8
  let off = header.length + tableSize
  const table = blocks.map((b) => { const e = u64(off); off += b.length; return e })
  return Buffer.concat([header, ...table, ...blocks])
}

// ── cases ───────────────────────────────────────────────────────────────────
const mod = await createIccImageModule()
const W = 4, H = 3
// Deliberately includes values >1.0 and <0.0: unbounded is the point of EXR, and a
// reader that clamped or treated these as integers would show it here.
const val = (x, y, c) => ({ R: 4.5, G: 0.5, B: -0.25 }[c] + x * 0.125 + y)
const REC709 = [0.64, 0.33, 0.30, 0.60, 0.15, 0.06, 0.3127, 0.3290]

const cases = []
cases.push(['plain_float', writeExr({ width: W, height: H, pixels: val }), { ok: true }])
cases.push(['with_chroma', writeExr({ width: W, height: H, pixels: val, chromaticities: REC709, whiteLuminance: 203 }),
            { ok: true, chroma: REC709, white: 203 }])
cases.push(['dwaa_refused', writeExr({ width: W, height: H, pixels: val, compression: 8 }),
            { ok: false, errorHas: 'DWAA' }])
cases.push(['not_exr', Buffer.from('not an image at all, and no format magic'), { unrecognised: true }])

let pass = 0, fail = 0
const near = (a, b) => Math.abs(a - b) < 1e-5
for (const [name, buf, want] of cases) {
  globalThis.__imgSize = () => buf.length
  globalThis.__imgRead = (id, off, size) => new Uint8Array(buf.subarray(off, Math.min(off + size, buf.length)))
  const probe = mod.probeImage(0)
  const dec = mod.decodeImage(new Uint8Array(buf))
  let ok = true, notes = []

  if (want.unrecognised) {
    ok = !probe.ok || probe.width !== W
    notes.push(`probe.ok=${probe.ok} (expected not an EXR)`)
  } else if (!want.ok) {
    ok = !probe.ok && String(probe.error).includes(want.errorHas) &&
         !dec.ok && String(dec.error).includes(want.errorHas)
    notes.push(`refused by name: ${JSON.stringify(String(probe.error).slice(0, 64))}`)
  } else {
    ok = probe.ok && probe.width === W && probe.height === H && probe.bitDepth === 32 &&
         probe.sampleFormat === 'float' && dec.ok && dec.sampleFormat === 'float' &&
         dec.channels === 3 && dec.samples.length === W * H * 3 * 4
    notes.push(`${probe.width}x${probe.height} ${probe.bitDepth}-bit ${probe.sampleFormat} ${probe.compression}`)
    // Sample fidelity, including the out-of-range values.
    const f = new Float32Array(dec.samples.buffer, dec.samples.byteOffset, dec.samples.length / 4)
    for (let y = 0; y < H && ok; y++) for (let x = 0; x < W && ok; x++) {
      const i = (y * W + x) * 3
      if (!near(f[i], val(x, y, 'R')) || !near(f[i + 1], val(x, y, 'G')) || !near(f[i + 2], val(x, y, 'B'))) {
        ok = false; notes.push(`sample mismatch at ${x},${y}: got ${f[i]},${f[i+1]},${f[i+2]}`)
      }
    }
    if (ok) notes.push(`samples exact incl. ${val(0,0,'R')} and ${val(0,0,'B')}`)
    if (want.chroma) {
      const c = probe.chromaticities
      const got = c ? Array.from({ length: 8 }, (_, k) => c[k]) : null
      if (!got || !got.every((v, k) => near(v, want.chroma[k]))) { ok = false; notes.push('chromaticities missing/wrong') }
      else if (!near(probe.whiteLuminance, want.white)) { ok = false; notes.push('whiteLuminance wrong') }
      else notes.push(`chromaticities + whiteLuminance=${probe.whiteLuminance} read`)
    }
    // EXR carries no ICC profile, so this must come back empty — null or zero-length,
    // both of which the JS layer normalises to "no profile".
    const fp = mod.findProfile(new Uint8Array(buf))
    if (fp && fp.length) { ok = false; notes.push('findProfile returned a profile for EXR') }
    else notes.push('no ICC (correct for EXR)')
  }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(14)} ${notes.join('; ')}`)
  ok ? pass++ : fail++
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
