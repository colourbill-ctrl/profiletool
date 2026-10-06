#!/usr/bin/env node
// (c) 2026 William Li
//
// Long text must survive the XML converters byte for byte, in both directions.
//
// WHY THIS EXISTS. From 2026-03-27 (iccDEV f49ad7987, #740, "CFL-001") until iccDEV #2768,
// icUtf8ToAnsi() / icAnsiToUtf8() copied at most 256 bytes on every non-Windows build — which
// includes this WASM. Every textType tag was silently truncated in both iccToXml (profiletool's
// XML tab) and xmlToIcc. A charTargetTag carrying ISO 28178 / CGATS characterization data runs to
// tens or hundreds of KB, so the XML view showed only its first 256 bytes and an XML round trip
// destroyed it. Nothing failed: the output simply stopped. It was found while investigating a
// PAWG Q4 report on Phil Green's profiles, and it is exactly the kind of loss a test has to name,
// because no error is ever raised.
//
// WHAT IT CHECKS, against the iccxml module in frontend/public/wasm/ (or --wasm <dir>):
//   1. ICC -> XML: a profile whose charTargetTag holds ~40 KB of CGATS text converts to XML whose
//      charTargetTag carries that text exactly.
//   2. XML -> ICC: converting that XML back gives a charTargetTag with exactly the same bytes.
//   3. A text just past the old limit (257 bytes) and one well under it (100 bytes) both survive,
//      so the boundary itself is pinned, not only the large case.
//
// The fixture is built here, in memory, from a corpus profile: no new binary is committed.
//
// Usage: node scripts/check-xml-long-text.mjs [--wasm <dir>]

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const wi = argv.indexOf('--wasm')
const WASM = wi >= 0 ? argv[wi + 1] : join(ROOT, 'frontend/public/wasm')
const createXml = (await import(pathToFileURL(join(WASM, 'iccxml.mjs')).href)).default
const mod = await createXml({ locateFile: (p) => join(WASM, p) })
const errText = (e) => { try { const m = mod.getExceptionMessage(e); return Array.isArray(m) ? m[1] || m[0] : String(m) } catch { return String(e?.message || e) } }

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + detail : ''}`)
}

// ── Build a profile carrying `text` in a charTargetTag (textType), from a corpus profile. ──────────
// A tag is appended by rewriting the tag table and re-laying the data, 4-byte aligned; the header
// size is updated and the profile ID cleared, since the bytes it hashed have changed.
function withCharTarget(srcBytes, text) {
  const src = Buffer.from(srcBytes)
  const n = src.readUInt32BE(128)
  const blocks = []
  for (let i = 0; i < n; i++) {
    const e = 132 + 12 * i
    const sig = src.toString('latin1', e, e + 4)
    if (sig === 'targ') continue                       // replace any existing one
    blocks.push([sig, src.subarray(src.readUInt32BE(e + 4), src.readUInt32BE(e + 4) + src.readUInt32BE(e + 8))])
  }
  const body = Buffer.concat([Buffer.from('text\0\0\0\0', 'latin1'), Buffer.from(text, 'latin1'), Buffer.from([0])])
  blocks.push(['targ', body])
  let pos = 132 + 12 * blocks.length
  const entries = [], parts = []
  for (const [sig, blk] of blocks) {
    const pad = (4 - (pos % 4)) % 4
    if (pad) { parts.push(Buffer.alloc(pad)); pos += pad }
    entries.push([sig, pos, blk.length]); parts.push(blk); pos += blk.length
  }
  const tail = (4 - (pos % 4)) % 4
  if (tail) parts.push(Buffer.alloc(tail))
  const head = Buffer.alloc(132 + 12 * blocks.length)
  src.copy(head, 0, 0, 128)
  head.writeUInt32BE(blocks.length, 128)
  entries.forEach(([sig, off, sz], i) => { head.write(sig, 132 + 12 * i, 'latin1'); head.writeUInt32BE(off, 136 + 12 * i); head.writeUInt32BE(sz, 140 + 12 * i) })
  const out = Buffer.concat([head, ...parts])
  out.writeUInt32BE(out.length, 0)
  out.fill(0, 84, 100)
  return new Uint8Array(out)
}

// The text inside the binary's charTargetTag, without its trailing NUL.
function charTargetOf(bytes) {
  const b = Buffer.from(bytes)
  const n = b.readUInt32BE(128)
  for (let i = 0; i < n; i++) {
    const e = 132 + 12 * i
    if (b.toString('latin1', e, e + 4) !== 'targ') continue
    const off = b.readUInt32BE(e + 4), sz = b.readUInt32BE(e + 8)
    return b.toString('latin1', off + 8, off + sz).replace(/\0+$/, '')
  }
  return null
}

// The text inside the XML's charTargetTag. iccToXml writes it as CDATA (or as escaped text).
function charTargetInXml(xml) {
  const m = /<charTargetTag>[\s\S]*?<TextData>([\s\S]*?)<\/TextData>/.exec(xml)
  if (!m) return null
  const cd = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(m[1].trim())
  return cd ? cd[1] : m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

// CGATS-shaped text of roughly `bytes` length — the real-world shape of the data that was lost.
function cgats(bytes) {
  const head = 'CGATS.17\nORIGINATOR "profiletool check-xml-long-text"\nBEGIN_DATA_FORMAT\nSAMPLE_ID CMYK_C CMYK_M CMYK_Y CMYK_K LAB_L LAB_A LAB_B\nEND_DATA_FORMAT\nBEGIN_DATA\n'
  let rows = '', k = 1
  while (head.length + rows.length + 9 < bytes) { rows += `${k} ${k % 101} ${(k * 7) % 101} ${(k * 13) % 101} ${(k * 3) % 101} ${(50 + (k % 50)).toFixed(2)} ${((k % 41) - 20).toFixed(2)} ${((k % 37) - 18).toFixed(2)}\n`; k++ }
  return head + rows + 'END_DATA'
}

const base = new Uint8Array(readFileSync(join(ROOT, 'test-corpus/hdr/HdrColorSpaceClass.icc')))
for (const [label, text] of [['~40 KB CGATS', cgats(40000)], ['257 bytes (one past the old cap)', cgats(257).slice(0, 257)],
                             ['100 bytes (under it)', cgats(100).slice(0, 100)]]) {
  const icc = withCharTarget(base, text)
  check(`${label}: the fixture carries ${text.length} bytes`, charTargetOf(icc) === text)
  let xml, back
  try { xml = mod.iccToXml(icc) } catch (e) { check(`${label}: ICC -> XML`, false, errText(e)); continue }
  const inXml = charTargetInXml(xml)
  check(`${label}: ICC -> XML keeps every byte`, inXml === text,
    inXml === null ? 'no charTargetTag in the XML' : `${inXml.length} of ${text.length} bytes`)
  try { back = new Uint8Array(mod.xmlToIcc(xml)) } catch (e) { check(`${label}: XML -> ICC`, false, errText(e)); continue }
  const round = charTargetOf(back)
  check(`${label}: XML -> ICC keeps every byte`, round === text,
    round === null ? 'no charTargetTag in the ICC' : `${round.length} of ${text.length} bytes`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
