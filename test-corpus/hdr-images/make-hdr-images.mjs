#!/usr/bin/env node
// (c) 2026 William Li
//
// Builds the HDR test images in this folder: a PQ luminance ramp, encoded as TIFF, PNG and
// JPEG, each carrying an EMBEDDED HDR Profile (test-corpus/hdr/HagcDisplay.icc — an ICC.1
// clause 8.10 conforming Display profile with a headroomAdaptiveGainCurveTag, PQ transfer).
//
// WHY: dropping one of these on the Profile tab exercises the image → embedded-profile →
// HDR report path end to end (ingestFile → findEmbeddedProfileFromFile → addIccEntry →
// PAWG section H, Tags → HAGC gain curve). Before these existed the only way to see an HDR
// Profile in the app was to load the .icc directly.
//
// WHAT THE PIXELS ARE. Horizontal ramp, grey (R=G=B), PQ code values:
//   x = 0          → 0 cd/m²
//   x = W/2        → 203 cd/m² (BT.2408 SDR reference white)
//   x = W−1        → 1000 cd/m²
// The encoder is iccDEV-independent (our iccimage WASM: libtiff/libpng/libjpeg), and the
// script DECODES each file back and re-extracts the profile, failing on any mismatch — so a
// committed image is known to carry exactly HagcDisplay.icc's bytes.
//
// Profiletool does not yet DISPLAY HDR pixels (DL-HDRDISP1); today these files show their
// profile. No browser will render them as HDR either: TIFF/PNG/JPEG signal HDR through the
// ICC profile here, not through cICP or a gain map, and browsers do not honour ICC-signalled PQ.
//
// Usage: node test-corpus/hdr-images/make-hdr-images.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { deflateSync as zlibDeflate } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const createIccImageModule = (await import(join(ROOT, 'frontend/public/wasm/iccimage.mjs'))).default
const mod = await createIccImageModule()

const PROFILE_NAME = 'HagcDisplay.icc'
const profile = new Uint8Array(readFileSync(join(ROOT, 'test-corpus/hdr', PROFILE_NAME)))
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)

// SMPTE ST 2084 inverse EOTF: absolute luminance (cd/m²) → PQ signal in [0, 1].
const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = Math.min(Math.max(nits, 0), 10000) / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const W = 512, H = 128
const nitsAt = (x) => {
  const mid = W / 2
  return x <= mid ? 203 * x / mid : 203 + (1000 - 203) * (x - mid) / (W - 1 - mid)
}

// Interleaved RGB samples. 16-bit samples are HOST order (little-endian under WASM); the
// round-trip check below catches it if the codec expects otherwise.
function samples(bits) {
  const max = bits === 16 ? 65535 : 255
  const n = W * H * 3
  const arr = bits === 16 ? new Uint16Array(n) : new Uint8Array(n)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.round(pq(nitsAt(x)) * max)
    const o = (y * W + x) * 3
    arr[o] = arr[o + 1] = arr[o + 2] = v
  }
  return { typed: arr, bytes: new Uint8Array(arr.buffer) }
}

const TARGETS = [
  // name, format, bits, extra encode args, exact pixel round-trip expected
  ['hagc-pq-ramp-16bit.tif', 'tiff', 16, true],
  ['hagc-pq-ramp-16bit.png', 'png', 16, true],
  ['hagc-pq-ramp-8bit.jpg', 'jpeg', 8, false],   // lossy: compare within tolerance
]

let failed = 0
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + detail : ''}`) }

for (const [file, format, bits, lossless] of TARGETS) {
  const s = samples(bits)
  // encodeImage(format, w, h, channels, bits, photometric, samples, profile, quality,
  //             sampleFmt 0=uint, compression 2=zip (TIFF only), planar 0=contig)
  const out = mod.encodeImage(format, W, H, 3, bits, 2 /* RGB */, s.bytes, profile, 95, 0, 2, 0)
  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out)
  writeFileSync(join(HERE, file), bytes)

  // 1. The embedded profile comes back byte-for-byte.
  const found = mod.findProfile(bytes)
  const got = found ? new Uint8Array(found.profile ?? found) : null
  check(`${file}: findProfile returns ${PROFILE_NAME} exactly`,
    !!got && got.length === profile.length && sha(got) === sha(profile),
    got ? `${got.length} B sha ${sha(got)} vs ${profile.length} B sha ${sha(profile)}` : 'no profile')

  // 2. The pixels come back as written (exactly for TIFF/PNG, within JPEG error otherwise).
  const d = mod.decodeImage(bytes)
  const ok = d && d.ok
  check(`${file}: decodes (${W}×${H}, ${bits}-bit, 3 ch)`, ok && d.width === W && d.height === H && d.channels === 3 && d.bitDepth === bits,
    ok ? `${d.width}×${d.height} ${d.bitDepth}-bit ${d.channels} ch` : (d && d.error))
  if (ok) {
    const raw = new Uint8Array(d.samples)
    const back = bits === 16 ? new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2) : raw
    const row = H >> 1
    const idx = (x) => (row * W + x) * 3
    const probes = [0, W / 4, W / 2, (3 * W) / 4, W - 1]
    const tol = lossless ? 0 : 4
    const diffs = probes.map((x) => Math.abs(back[idx(x)] - s.typed[idx(x)]))
    check(`${file}: ramp samples round-trip${lossless ? ' exactly' : ' within ±4'}`, diffs.every((v) => v <= tol),
      `probes ${JSON.stringify(probes.map((x) => back[idx(x)]))} expected ${JSON.stringify(probes.map((x) => s.typed[idx(x)]))}`)
  }
}

// ── Images WITHOUT an ICC profile, for the HDR tab's display paths ──────────────────────
//
// hdr-ramp-linear.exr   OpenEXR, uncompressed, FLOAT R/G/B, Rec.709/D65 chromaticities
//                       attribute. Scene-linear: top half a grey ramp 0 → 4.926 (i.e. 1000/203,
//                       the same luminances as the PQ ramps, with 1.0 = SDR white); bottom half
//                       three bands, pure R, G and B ramps over the same range. Displayed by
//                       profiletool's own renderer (HdrSurface).
// pq-ramp-cicp-16bit.png  PNG, 16-bit, grey PQ ramp tagged with a cICP chunk (BT.2020 / PQ /
//                       RGB / full range) and NO iCCP. The browser's own HDR route: Chromium
//                       honours cICP, which is how headless measurement confirmed 1.0 = 203 nits
//                       (scripts/probe-hdr-canvas.mjs uses the same construction).
// Neither container is written by encodeImage (no EXR encoder; no cICP support), so both are
// assembled here byte by byte, then DECODED BACK with the iccimage WASM before passing.

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function exrRamp() {
  const EW = 256, EH = 96
  const band = EH / 2 / 3
  const value = (x) => nitsAt(Math.round(x * (W - 1) / (EW - 1))) / 203
  const px = (x, y) => {
    const v = value(x)
    if (y < EH / 2) return [v, v, v]
    const k = Math.min(2, Math.floor((y - EH / 2) / band))
    return [k === 0 ? v : 0, k === 1 ? v : 0, k === 2 ? v : 0]
  }
  const parts = []
  const str = (s) => Buffer.from(s + '\0', 'latin1')
  const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b }
  const f32 = (n) => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b }
  const attr = (name, type, value) => Buffer.concat([str(name), str(type), i32(value.length), value])
  // Channel list, sorted by name as the format requires: B, G, R. pixel_type 2 = FLOAT.
  const chan = (n) => Buffer.concat([str(n), i32(2), Buffer.from([0, 0, 0, 0]), i32(1), i32(1)])
  const chlist = Buffer.concat([chan('B'), chan('G'), chan('R'), Buffer.from([0])])
  const box = Buffer.concat([i32(0), i32(0), i32(EW - 1), i32(EH - 1)])
  const header = Buffer.concat([
    Buffer.from([0x76, 0x2f, 0x31, 0x01]), i32(2),
    attr('channels', 'chlist', chlist),
    attr('chromaticities', 'chromaticities', Buffer.concat([0.64, 0.33, 0.30, 0.60, 0.15, 0.06, 0.3127, 0.3290].map(f32))),
    attr('compression', 'compression', Buffer.from([0])),
    attr('dataWindow', 'box2i', box),
    attr('displayWindow', 'box2i', box),
    attr('lineOrder', 'lineOrder', Buffer.from([0])),
    attr('pixelAspectRatio', 'float', f32(1)),
    attr('screenWindowCenter', 'v2f', Buffer.concat([f32(0), f32(0)])),
    attr('screenWindowWidth', 'float', f32(1)),
    Buffer.from([0]),
  ])
  // NO_COMPRESSION: one scanline per block. Offset table = one uint64 per line.
  const lineBytes = EW * 4 * 3
  const tableStart = header.length
  const firstLine = tableStart + EH * 8
  const table = Buffer.alloc(EH * 8)
  const lines = []
  for (let y = 0; y < EH; y++) {
    table.writeBigUInt64LE(BigInt(firstLine + y * (8 + lineBytes)), y * 8)
    const data = Buffer.alloc(lineBytes)
    for (let x = 0; x < EW; x++) {
      const [r, g, b] = px(x, y)
      data.writeFloatLE(b, x * 4)                    // B block
      data.writeFloatLE(g, EW * 4 + x * 4)           // G block
      data.writeFloatLE(r, 2 * EW * 4 + x * 4)       // R block
    }
    lines.push(i32(y), i32(lineBytes), data)
  }
  parts.push(header, table, ...lines)
  return { bytes: new Uint8Array(Buffer.concat(parts)), EW, EH, px }
}

function cicpPng() {
  const raw = Buffer.alloc(H * (1 + W * 6))
  for (let y = 0; y < H; y++) {
    const o = y * (1 + W * 6)
    for (let x = 0; x < W; x++) {
      const v = Math.round(pq(nitsAt(x)) * 65535)
      for (let ch = 0; ch < 3; ch++) raw.writeUInt16BE(v, o + 1 + x * 6 + ch * 2)
    }
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), crc = Buffer.alloc(4)
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([16, 2, 0, 0, 0], 8)
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('cICP', Buffer.from([9, 16, 0, 1])),
    chunk('IDAT', zlibDeflate(raw)), chunk('IEND', Buffer.alloc(0))]))
}

{
  const { bytes, EW, EH, px } = exrRamp()
  writeFileSync(join(HERE, 'hdr-ramp-linear.exr'), bytes)
  const d = mod.decodeImage(bytes)
  check('hdr-ramp-linear.exr: decodes as float RGB', d && d.ok && d.sampleFormat === 'float' && d.width === EW && d.height === EH && d.channels === 3,
    d && (d.ok ? `${d.width}×${d.height} ${d.sampleFormat} ${d.channels} ch` : d.error))
  if (d && d.ok) {
    const raw = new Uint8Array(d.samples)
    const f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
    const at = (x, y) => [f[(y * EW + x) * 3], f[(y * EW + x) * 3 + 1], f[(y * EW + x) * 3 + 2]]
    const probes = [[0, 10], [128, 10], [EW - 1, 10], [EW - 1, EH / 2 + 2], [EW - 1, EH / 2 + 18], [EW - 1, EH - 2]]
    const ok = probes.every(([x, y]) => at(x, y).every((v, c) => Math.abs(v - px(x, y)[c]) < 1e-6))
    check('hdr-ramp-linear.exr: grey ramp + R/G/B bands decode exactly, top = 4.926× SDR white', ok,
      JSON.stringify(probes.map(([x, y]) => at(x, y).map((v) => +v.toFixed(4)))))
    check('hdr-ramp-linear.exr: chromaticities attribute read back as Rec.709/D65',
      Array.isArray(d.chromaticities) && Math.abs(d.chromaticities[6] - 0.3127) < 1e-6, JSON.stringify(d.chromaticities))
  }
  check('hdr-ramp-linear.exr: carries no ICC profile (the format has no slot)', !mod.findProfile(bytes))
}
{
  const bytes = cicpPng()
  writeFileSync(join(HERE, 'pq-ramp-cicp-16bit.png'), bytes)
  const d = mod.decodeImage(bytes)
  const ok = d && d.ok && d.width === W && d.bitDepth === 16
  check('pq-ramp-cicp-16bit.png: decodes (16-bit)', ok, d && (d.ok ? `${d.width}×${d.height} ${d.bitDepth}-bit` : d.error))
  if (ok) {
    const raw = new Uint8Array(d.samples)
    const u = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
    const want = [0, W / 2, W - 1].map((x) => Math.round(pq(nitsAt(x)) * 65535))
    const got = [0, W / 2, W - 1].map((x) => u[((H >> 1) * W + x) * 3])
    check('pq-ramp-cicp-16bit.png: PQ code values exact (203 nits at centre)', got.every((v, i) => v === want[i]), `got ${got} want ${want}`)
  }
  check('pq-ramp-cicp-16bit.png: no ICC profile (HDR is signalled by cICP alone)', !mod.findProfile(bytes))
}

console.log(failed ? `\n${failed} failed` : `\nall passed — images written to ${HERE}`)
process.exit(failed ? 1 : 0)
