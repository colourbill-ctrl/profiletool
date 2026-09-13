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

console.log(failed ? `\n${failed} failed` : `\nall passed — images written to ${HERE}`)
process.exit(failed ? 1 : 0)
