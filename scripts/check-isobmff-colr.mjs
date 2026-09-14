#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests the ISOBMFF `colr` walker in validator-wasm/iccimage-wrapper.cpp — the path
// that pulls an embedded ICC profile out of a HEIC or AVIF file.
//
// WHY THE FIXTURES ARE GENERATED HERE rather than committed. The cases that matter
// are structural, not pictorial: a file whose FIRST colr belongs to a non-primary
// item, an rICC instead of a prof, a missing pitm, 64-bit box sizes, truncation. Real
// HEICs are awkward to obtain in those exact shapes, and one case needs an 8 MB
// payload to prove the walk does not read the raster — which has no business in git.
// Building them here keeps every case visible as code and costs nothing to run.
//
// The ICC payloads are two real profiles from test-corpus/hdr, chosen because they
// differ in both content and LENGTH: an implementation that returned the wrong one
// is caught by size alone, before the hash is even checked.
//
// Usage: node scripts/check-isobmff-colr.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const createIccImageModule = (await import(join(ROOT, 'frontend/public/wasm/iccimage.mjs'))).default

// ── minimal ISOBMFF construction ────────────────────────────────────────────
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b }
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b }
const box = (t, payload, large = false) => large
  ? Buffer.concat([u32(1), Buffer.from(t), u64(16 + payload.length), payload])
  : Buffer.concat([u32(8 + payload.length), Buffer.from(t), payload])
const full = (t, payload, version = 0, flags = 0, large = false) =>
  box(t, Buffer.concat([Buffer.from([version]), u32(flags).subarray(1), payload]), large)

const colrProf = (icc) => box('colr', Buffer.concat([Buffer.from('prof'), icc]))
const colrRicc = (icc) => box('colr', Buffer.concat([Buffer.from('rICC'), icc]))
const colrNclx = () => box('colr', Buffer.concat([Buffer.from('nclx'), u16(9), u16(16), u16(0), Buffer.from([0x80])]))
const pitm = (item, version = 0) => full('pitm', version === 0 ? u16(item) : u32(item), version)
const ipma = (entries, version = 0, flags = 0) => full('ipma', Buffer.concat([
  u32(entries.length),
  ...entries.map(([item, idxs]) => Buffer.concat([
    version === 0 ? u16(item) : u32(item),
    Buffer.from([idxs.length]),
    ...idxs.map((i) => (flags & 1) ? u16(i) : Buffer.from([i & 0x7f])),
  ])),
]), version, flags)

function build({ props, assoc = null, primary = null, pitmV = 0, ipmaV = 0, ipmaF = 0,
                 largeMeta = false, mdat = Buffer.alloc(4096, 0xab) }) {
  const ipco = box('ipco', Buffer.concat(props))
  const iprp = box('iprp', Buffer.concat([ipco, assoc ? ipma(assoc, ipmaV, ipmaF) : Buffer.alloc(0)]))
  const metaKids = Buffer.concat([primary !== null ? pitm(primary, pitmV) : Buffer.alloc(0), iprp])
  const meta = full('meta', metaKids, 0, 0, largeMeta)
  const ftyp = box('ftyp', Buffer.concat([Buffer.from('heic'), u32(0), Buffer.from('heicmif1')]))
  return Buffer.concat([ftyp, meta, box('mdat', mdat)])
}

// ── cases ───────────────────────────────────────────────────────────────────
const A = readFileSync(join(ROOT, 'test-corpus/hdr/ProfiletoolHdrDisplay.icc'))   // "primary"
const B = readFileSync(join(ROOT, 'test-corpus/hdr/HagcDisplay.icc'))             // "gain map"
if (A.length === B.length) throw new Error('payloads must differ in length for the size check to bite')

const cases = [
  ['single_prof',      build({ props: [colrProf(A)], assoc: [[1, [1]]], primary: 1 }), A],
  // THE CASE THIS WALKER EXISTS FOR. Two items; the first colr in ipco belongs to
  // item 2. A gain-map HEIC has exactly this shape, so an implementation that takes
  // the first colr returns the GAIN MAP's profile — plausible-looking and wrong.
  ['multi_primary2nd', build({ props: [colrProf(B), colrProf(A)], assoc: [[2, [1]], [1, [2]]], primary: 1 }), A],
  ['ricc',             build({ props: [colrRicc(A)], assoc: [[1, [1]]], primary: 1 }), A],
  ['nclx_only',        build({ props: [colrNclx()], assoc: [[1, [1]]], primary: 1 }), null],
  ['nclx_plus_prof',   build({ props: [colrNclx(), colrProf(A)], assoc: [[1, [1, 2]]], primary: 1 }), A],
  ['no_pitm',          build({ props: [colrProf(A)], assoc: [[1, [1]]], primary: null }), A],
  ['no_ipma',          build({ props: [colrProf(A)], assoc: null, primary: 1 }), A],
  ['large_box',        build({ props: [colrProf(A)], assoc: [[1, [1]]], primary: 1, largeMeta: true }), A],
  ['ipma_v1_flags1',   build({ props: [colrProf(B), colrProf(A)], assoc: [[2, [1]], [1, [2]]], primary: 1,
                               pitmV: 1, ipmaV: 1, ipmaF: 1 }), A],
  ['truncated',        build({ props: [colrProf(A)], assoc: [[1, [1]]], primary: 1 }).subarray(0, 120), null],
  ['zero_size_box',    Buffer.concat([Buffer.from('\0\0\0\0ftyp'), Buffer.alloc(8)]), null],
  // 8 MB of payload: proves the walk reads the metadata region and one read-ahead
  // chunk, not the raster. This is the claim that lets the feature ship with no codec.
  ['big_mdat',         build({ props: [colrProf(B), colrProf(A)], assoc: [[2, [1]], [1, [2]]], primary: 1,
                               mdat: Buffer.alloc(8 * 1024 * 1024, 0x5a) }), A],
  // HOSTILE: a 64-bit largesize of 2^64 − 16 at offset 16. `pos + size` wraps to 0, so a
  // bounds check written as a sum passes and the walk jumps back to the start — forever.
  // Before the fix this case never returned; now it must refuse the box and find nothing.
  ['largesize_wraps',  Buffer.concat([box('ftyp', Buffer.concat([Buffer.from('heic'), u32(0)])),
                                      u32(1), Buffer.from('meta'), u64(2n ** 64n - 16n), Buffer.alloc(16)]), null],
  // HOSTILE: an ipma far larger than any real file (100 000 entries). Entries past the cap are
  // ignored, so the primary item's association — placed LAST — is never seen and the walker
  // falls back to the first colr in ipco. Bounded memory, a defined answer, no exception.
  ['ipma_over_cap',    build({ props: [colrProf(B), colrProf(A)], primary: 1,
                               assoc: [...Array.from({ length: 100000 }, (_, i) => [i + 2, []]), [1, [2]]], ipmaV: 1 }), B],
]

const mod = await createIccImageModule()
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const READ_AHEAD_CAP = 1024 * 1024      // Reader's chunk is 256 KB; allow slack, not a raster

let pass = 0, fail = 0
for (const [name, buf, want] of cases) {
  let bytesRead = 0
  globalThis.__imgSize = () => buf.length
  globalThis.__imgRead = (id, off, size) => {
    const end = Math.min(off + size, buf.length)
    bytesRead += Math.max(0, end - off)
    return new Uint8Array(buf.subarray(off, end))
  }
  const norm = (v) => (v && v.length ? Buffer.from(v) : null)
  const s = norm(mod.findProfileStream(0))               // ranged-read path (the app's)
  const b = norm(mod.findProfile(new Uint8Array(buf)))   // whole-buffer path
  const shows = (v) => (v ? `${v.length}B ${sha(v)}` : 'null')
  let ok, note = ''
  if (want === null) ok = (s === null && b === null)
  else ok = !!s && !!b && s.equals(want) && b.equals(want)
  if (name === 'big_mdat') {
    note = `  read ${(bytesRead / 1024).toFixed(0)}KB of ${(buf.length / 1048576).toFixed(1)}MB`
    if (bytesRead > READ_AHEAD_CAP) { ok = false; note += '  ** READ THE RASTER **' }
  }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(18)} stream=${shows(s)} bytes=${shows(b)} want=${want ? `${want.length}B ${sha(want)}` : 'null'}${note}`)
  ok ? pass++ : fail++
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
