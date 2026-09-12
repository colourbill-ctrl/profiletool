#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/capabilities.js against SYNTHETIC environments.
//
// Why synthetic: the targets DL-HDRENV1 names are Chrome/Windows, Safari/iOS, Safari on a
// Mac with an XDR display, Chrome/macOS and Firefox — hardware nobody has all of. The
// decision logic is pure, so it can be exercised exhaustively here instead of being
// discovered one device at a time. What this does NOT test is environment.js's probes,
// which need a real browser; the split exists so that everything decidable is decided here.
//
// The cases encode the matrix in hdr-platform-capabilities.md. If that document and this
// file disagree, one of them is wrong — which is the point of writing the expectations out.

import { capabilityFor, capabilityMatrix, hdrPathway, environmentSummary } from
  '../frontend/src/lib/capabilities.js'
import { classifyFile, rejectReason, FileKind, ImageFormat } from
  '../frontend/src/lib/fileKind.js'

// An HDR-capable, modern environment unless a case says otherwise.
const base = {
  majorVersion: 130, webkitEngine: false,
  decode: { heic: null, avif: null, jxl: null },
  display: { hdr: true, videoHdr: true, p3: true, rec2020: true },
  pathway: { float16Canvas: true, webgpu: true },
  userAgent: '(synthetic)',
}
const env = (o) => ({ ...base, ...o, decode: { ...base.decode, ...(o.decode || {}) },
  display: { ...base.display, ...(o.display || {}) }, pathway: { ...base.pathway, ...(o.pathway || {}) } })

const CASES = [
  // name, env, expectations: [format, inspect, display, hdr]
  ['Chrome / Windows (HDR)', env({ browser: 'Chrome', os: 'Windows', decode: { heic: false, avif: true, jxl: false } }), [
    ['icc', true, true, true], ['exr', true, true, true], ['avif', true, true, true],
    ['heic', true, false, false],   // the headline cost of DL-HDRENV1
    ['jxl', true, false, false], ['jpeg', true, true, true],
  ]],
  ['Chrome / macOS (HDR)', env({ browser: 'Chrome', os: 'macOS', decode: { heic: false, avif: true, jxl: false } }), [
    ['heic', true, false, false],   // macOS does NOT change this: Chrome uses no system decoder
    ['avif', true, true, true], ['exr', true, true, true],
  ]],
  ['Safari / iOS (HDR)', env({ browser: 'Safari', os: 'iOS', webkitEngine: true,
    decode: { heic: null, avif: null, jxl: null }, pathway: { float16Canvas: false, webgpu: true } }), [
    ['heic', true, true, true],     // no ImageDecoder probe exists; engine knowledge must carry it
    ['jxl', true, true, true], ['avif', true, true, true], ['exr', true, true, true],
  ]],
  ['Safari / macOS XDR', env({ browser: 'Safari', os: 'macOS', webkitEngine: true,
    pathway: { float16Canvas: false, webgpu: true } }), [
    ['heic', true, true, true], ['jxl', true, true, true], ['jpeg', true, true, true],
  ]],
  ['Firefox / Windows (HDR screen)', env({ browser: 'Firefox', os: 'Windows',
    decode: { heic: false, avif: true, jxl: false } }), [
    ['avif', true, true, false],    // decodes, but Firefox renders no HDR images
    ['heic', true, false, false], ['exr', true, true, false],
    ['icc', true, true, false],
  ]],
  ['Chrome / Windows, SDR screen', env({ browser: 'Chrome', os: 'Windows',
    decode: { heic: false, avif: true }, display: { hdr: false } }), [
    ['avif', true, true, false], ['exr', true, true, false],
  ]],
  ['Chrome, no HDR canvas path', env({ browser: 'Chrome', os: 'Windows',
    decode: { avif: true }, pathway: { float16Canvas: false, webgpu: false } }), [
    ['avif', true, true, false],
  ]],
  // Firefox on iPhone is WebKit underneath: it has Safari's image support, not Firefox's.
  // Gating on the brand would be wrong in both directions.
  ['Firefox / iOS (WebKit engine)', env({ browser: 'Firefox', os: 'iOS', webkitEngine: true,
    pathway: { float16Canvas: false, webgpu: true } }), [
    ['heic', true, true, true],
  ]],
]

let pass = 0, fail = 0
for (const [name, e, expectations] of CASES) {
  const lines = []
  let ok = true
  for (const [fmt, wi, wd, wh] of expectations) {
    const c = capabilityFor(fmt, e)
    const got = [c.inspect.ok, c.display.ok, c.hdr.ok]
    const want = [wi, wd, wh]
    const good = got.every((v, i) => v === want[i])
    if (!good) { ok = false; lines.push(`      ${fmt}: got ${got.join('/')} want ${want.join('/')}`) }
  }
  // Every refusal must carry a reason — a bare `false` is what DL-HDRENV1 forbids.
  for (const [fmt] of expectations) {
    const c = capabilityFor(fmt, e)
    for (const k of ['inspect', 'display', 'hdr']) {
      if (!c[k].ok && !c[k].why) { ok = false; lines.push(`      ${fmt}.${k} refused with no reason`) }
    }
  }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(32)} ${environmentSummary(e)} · pathway=${hdrPathway(e) || 'none'}`)
  for (const l of lines) console.log(l)
  ok ? pass++ : fail++
}

// Inspection must be true for every format in every environment — the property the whole
// "a browser that cannot decode HEIC still inspects it" argument rests on.
let inspectOk = true
for (const [, e] of CASES) {
  const m = capabilityMatrix(e)
  for (const [fmt, c] of Object.entries(m)) {
    if (!c.inspect.ok) { inspectOk = false; console.log(`FAIL  inspect false for ${fmt} in ${environmentSummary(e)}`) }
  }
}
console.log(`${inspectOk ? 'pass' : 'FAIL'}  inspect is unconditional across every format and environment`)
inspectOk ? pass++ : fail++

// ── file classification ─────────────────────────────────────────────────────
// The first half of "what can we do with this file". Every format below must be
// RECOGNISED, or the capability table never gets consulted at all — which is how HEIC,
// AVIF and EXR were silently rejected before this change despite the WASM handling them.
const icc = (() => { const b = new Uint8Array(132); b.set([0x61,0x63,0x73,0x70], 36); return b })()
const ftyp = (brand) => { const b = new Uint8Array(16); b.set([0,0,0,16], 0)
  b.set([0x66,0x74,0x79,0x70], 4); b.set([...brand].map(c => c.charCodeAt(0)), 8); return b }
const CLASSIFY = [
  ['ICC profile',   icc,                                              FileKind.ICC,   undefined],
  ['TIFF LE',       new Uint8Array([0x49,0x49,0x2a,0x00]),            FileKind.IMAGE, ImageFormat.TIFF],
  ['TIFF BE',       new Uint8Array([0x4d,0x4d,0x00,0x2a]),            FileKind.IMAGE, ImageFormat.TIFF],
  ['PNG',           new Uint8Array([0x89,0x50,0x4e,0x47]),            FileKind.IMAGE, ImageFormat.PNG],
  ['JPEG',          new Uint8Array([0xff,0xd8,0xff,0xe0]),            FileKind.IMAGE, ImageFormat.JPEG],
  ['EXR',           new Uint8Array([0x76,0x2f,0x31,0x01]),            FileKind.IMAGE, ImageFormat.EXR],
  ['HEIC (heic)',   ftyp('heic'),                                     FileKind.IMAGE, ImageFormat.HEIC],
  ['HEIC (mif1)',   ftyp('mif1'),                                     FileKind.IMAGE, ImageFormat.HEIC],
  ['AVIF (avif)',   ftyp('avif'),                                     FileKind.IMAGE, ImageFormat.AVIF],
  ['AVIF sequence', ftyp('avis'),                                     FileKind.IMAGE, ImageFormat.AVIF],
  ['not an image',  new Uint8Array([1,2,3,4,5,6,7,8]),                FileKind.UNKNOWN, undefined],
]
for (const [name, bytes, wantKind, wantFormat] of CLASSIFY) {
  const got = classifyFile(bytes, name)
  const ok = got.kind === wantKind && got.format === wantFormat
  console.log(`${ok ? 'pass' : 'FAIL'}  classify ${name.padEnd(22)} kind=${got.kind} format=${got.format ?? '-'}`)
  ok ? pass++ : fail++
}

// EXR having no ICC profile is a PROPERTY OF THE FORMAT, not a fault in the file, and the
// message has to say so — "image has no embedded ICC profile" reads as a defect.
{
  const exr = rejectReason(FileKind.IMAGE, ImageFormat.EXR)
  const jpg = rejectReason(FileKind.IMAGE, ImageFormat.JPEG)
  const ok = /carries no ICC profile/.test(exr) && /no embedded ICC profile/.test(jpg) && exr !== jpg
  console.log(`${ok ? 'pass' : 'FAIL'}  EXR refusal explains the format rather than blaming the file`)
  console.log(`      EXR: ${exr}`)
  ok ? pass++ : fail++
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
