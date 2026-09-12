#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/hdrProfile.js — the client-side 8.10.1 membership test that
// Compare and Link use to decide whether to explain what they are showing.
//
// CROSS-CHECKED AGAINST PAWG, which is the point. PAWG's H1 item is the authoritative
// classifier (icGetHdrProfileInfo, in the library); this JS re-derives the same test from
// the parsed profile so the gamut views do not have to load the PAWG module. Running both
// over the whole corpus and requiring agreement is what keeps the duplicate honest — a
// drift here would otherwise show up as a caveat appearing on the wrong profiles.
//
// Usage: node scripts/check-hdr-profile-class.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORPUS = join(ROOT, 'test-corpus/hdr')
const { classifyHdrProfile } = await import(join(ROOT, 'frontend/src/lib/hdrProfile.js'))
const createDump = (await import(join(ROOT, 'frontend/public/wasm/iccprofiledump.mjs'))).default
const createPawg = (await import(join(ROOT, 'frontend/public/wasm/iccpawg.mjs'))).default
const dump = await createDump(), pawg = await createPawg()

let agree = 0, disagree = 0, skipped = 0
const rows = []
for (const f of readdirSync(CORPUS).filter((f) => f.endsWith('.icc')).sort()) {
  const bytes = new Uint8Array(readFileSync(join(CORPUS, f)))
  let data
  try { data = JSON.parse(dump.validateProfile(bytes)) } catch { skipped++; continue }
  if (!data.tags) { skipped++; continue }

  const ours = classifyHdrProfile(data, bytes)

  // PAWG's verdict: H1 == OK means a conforming member of the sub-class.
  let theirs = null
  try {
    const r = JSON.parse(pawg.pawgReport(bytes))
    const h1 = r.items.find((i) => i.id === 'H1')
    theirs = h1 ? h1.verdict === 'OK' : false
  } catch { skipped++; continue }

  const ok = ours.isHdr === theirs
  ok ? agree++ : disagree++
  rows.push([ok, f, ours.isHdr, theirs, ours.transfer, ours.reasons[0] || ''])
}

for (const [ok, f, o, t, tr, why] of rows) {
  if (!ok) console.log(`FAIL  ${f.padEnd(30)} ours=${o} pawg=${t}  ${why}`)
}
console.log(`\nagreement with PAWG H1 across the corpus: ${agree} agree, ${disagree} disagree, ${skipped} skipped`)

// Show the members, so a reader can see the classifier is not trivially returning false.
const members = rows.filter((r) => r[2]).map((r) => `${r[1].replace('.icc','')}(${r[4]})`)
console.log(`conforming HDR Profiles found: ${members.length}`)
console.log('  ' + members.join(', '))

// A classifier that says "no" to everything would agree with PAWG on SDR profiles and
// look fine. Require that it actually identifies members, and a range of transfers.
const transfers = new Set(rows.filter((r) => r[2]).map((r) => r[4]))
const enough = members.length >= 5 && transfers.size >= 2
console.log(`${enough ? 'pass' : 'FAIL'}  identifies members across ${transfers.size} transfer characteristic(s): ${[...transfers].join(', ')}`)

process.exit(disagree === 0 && enough ? 0 : 1)
