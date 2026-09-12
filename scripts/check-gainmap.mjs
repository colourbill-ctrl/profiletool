#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests gain-map detection in validator-wasm/iccimage-wrapper.cpp.
//
// A gain map is the mechanism behind essentially every consumer HDR photo — an SDR
// base plus a map that reconstructs an HDR rendition — and it describes the same thing
// the profile's adaptive gain curve does. The point of reading it is to let an author
// see whether the file and the profile agree.
//
// THE TWO FORMATS ARE TREATED DIFFERENTLY, ON PURPOSE:
//   Ultra HDR (JPEG)  parsed — its `hdrgm` XMP schema is publicly specified.
//   ISO 21496-1       detected only — its binary layout is in the paywalled ISO
//   (HEIC/AVIF tmap)  document. Reporting confident field values we had guessed would
//                     be worse than reporting none, so the tests assert that it says
//                     "present but not parsed" rather than inventing numbers.
//
// Usage: node scripts/check-gainmap.mjs

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const createIccImageModule = (await import(join(ROOT, 'frontend/public/wasm/iccimage.mjs'))).default
const mod = await createIccImageModule()

// ── Ultra HDR fixture: a JPEG carrying the gain-map XMP packet ──────────────
const XMP_NS = 'http://ns.adobe.com/hdr-gain-map/1.0/'
function ultraHdrJpeg(attrs, { gcontainer = true } = {}) {
  const body = Object.entries(attrs).map(([k, v]) => `     hdrgm:${k}="${v}"`).join('\n')
  const dir = gcontainer
    ? `<Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource">` +
      `<Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li>` +
      `<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" ` +
      `Item:Mime="image/jpeg" Item:Length="1234"/></rdf:li></rdf:Seq></Container:Directory>`
    : ''
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ` +
    `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:hdrgm="${XMP_NS}" ` +
    `xmlns:Container="http://ns.google.com/photos/1.0/container/" ` +
    `xmlns:Item="http://ns.google.com/photos/1.0/container/item/"\n${body}>` +
    `${dir}</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  const payload = Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xmp, 'utf8')])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), (() => {
    const b = Buffer.alloc(2); b.writeUInt16BE(payload.length + 2); return b })(), payload])
  // SOI + APP1 + a minimal (not decodable) remainder + EOI. Detection is metadata-only,
  // so the entropy-coded image is irrelevant here.
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])])
}

// ── ISOBMFF fixture: a meta/iinf/infe item of type `tmap` ───────────────────
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b }
const box = (t, p) => Buffer.concat([u32(8 + p.length), Buffer.from(t), p])
const full = (t, p, v = 0, f = 0) => box(t, Buffer.concat([Buffer.from([v]), u32(f).subarray(1), p]))
const infe = (id, type) => full('infe', Buffer.concat([u16(id), u16(0), Buffer.from(type), Buffer.from([0])]), 2)
function isoWithItems(types) {
  const iinf = full('iinf', Buffer.concat([u16(types.length), ...types.map((t, i) => infe(i + 1, t))]))
  const meta = full('meta', iinf)
  return Buffer.concat([box('ftyp', Buffer.concat([Buffer.from('heic'), u32(0), Buffer.from('heicmif1')])),
                        meta, box('mdat', Buffer.alloc(64, 0xab))])
}

// ── cases ───────────────────────────────────────────────────────────────────
const FULL = { Version: '1.0', GainMapMin: '-0.57609993', GainMapMax: '4.7090998', Gamma: '1',
               OffsetSDR: '0.015625', OffsetHDR: '0.015625', HDRCapacityMin: '0',
               HDRCapacityMax: '4.7090998', BaseRenditionIsHDR: 'False' }
// Only the required fields, so the optional ones must come back as documented defaults.
const MINIMAL = { Version: '1.0', GainMapMax: '3.5', HDRCapacityMax: '3.5' }

const cases = [
  ['ultrahdr_full',    ultraHdrJpeg(FULL),    (g) => g.present && g.kind === 'ultrahdr' && g.parsed &&
      g.fields.gainMapMax === '4.7090998' && g.fields.gamma === '1' && g.gcontainer === true &&
      g.defaulted.length === 0],
  ['ultrahdr_minimal', ultraHdrJpeg(MINIMAL), (g) => g.present && g.parsed &&
      g.fields.gainMapMax === '3.5' && g.fields.gamma === '1.0' &&
      g.fields.offsetSDR === '0.015625' && g.fields.baseRenditionIsHDR === 'False' &&
      g.defaulted.length === 6],
  ['ultrahdr_no_gcont', ultraHdrJpeg(FULL, { gcontainer: false }), (g) => g.present && g.gcontainer === false],
  ['plain_jpeg',       Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16), Buffer.from([0xff, 0xd9])]),
                       (g) => g.present === false],
  ['iso_tmap',         isoWithItems(['av01', 'tmap']), (g) => g.present && g.kind === 'iso21496' &&
      g.parsed === false && typeof g.note === 'string' && g.note.includes('ISO 21496-1')],
  ['iso_no_tmap',      isoWithItems(['av01', 'Exif']), (g) => g.present === false],
]

let pass = 0, fail = 0
for (const [name, buf, check] of cases) {
  let g, ok = false, shown = ''
  try {
    g = mod.gainMapInfo(new Uint8Array(buf))
    ok = check(g)
    shown = g.present
      ? `${g.kind} parsed=${g.parsed}` + (g.parsed
          ? ` max=${g.fields.gainMapMax} capMax=${g.fields.hdrCapacityMax} defaults=${g.defaulted.length}`
          : ' (not decoded, by design)')
      : 'no gain map'
  } catch (e) { shown = 'THREW ' + e }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(19)} ${shown}`)
  ok ? pass++ : fail++
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
