#!/usr/bin/env node
// (c) 2026 William Li
//
// Check the headroom columns of iccDEV's hdr-corpus-manifest.tsv by recomputing
// them from each fixture's XML — WITHOUT calling IccProfLib.
//
// WHY THIS IS SEPARATE FROM check-hdr-corpus.mjs. That script reads
// classification back through icGetHdrProfileInfo(), which is the same function
// upstream's CTest asserts against and the one the manifest's numbers came from,
// so it cannot corroborate the classifier — it is a cross-build check. This file
// deliberately imports no WASM and links no ICC code at all; its only imports are
// from node:fs and node:path, which is checkable at a glance from the import
// block below. It reads the metadata entries straight out of the XML
// and does the clause-8.10.4 / 8.10.5 arithmetic here, so a disagreement is real
// news rather than the same bug seen twice.
//
// WHAT IT DOES AND DOES NOT ESTABLISH. It verifies the manifest's NUMBERS against
// the fixtures' metadata, given the rule the manifest's `source` column names. It
// does NOT independently decide WHICH rule applies — that precedence (8.10.5 a-d,
// 8.10.4 a-c) is taken from the manifest. So it catches a wrong value, a fixture
// whose metadata drifted from its expected headroom, and a transcription error;
// it does not catch a wrong rule SELECTION. Checking that too would mean
// implementing the precedence from the clause text, which is unpublished.
//
// Headroom here is a RATIO, not log2 stops: DERH is taken directly, and every
// other rule divides a luminance by a reference white.
//
// Usage:  node scripts/check-hdr-headroom.mjs [--dir <path>] [--manifest <path>]

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }
const CORPUS   = argOf('--dir', join(ROOT, 'test-corpus/hdr'))
const MANIFEST = argOf('--manifest', join(CORPUS, 'hdr-corpus-manifest.tsv'))

// The 203 cd/m^2 default content reference white of clause 8.10.4, used when the
// profile states none. Named rather than inlined because it appears twice.
const DEFAULT_REFERENCE_WHITE = 203.0
// Clause 8.10.4's default peak, the "default-1000" source.
const DEFAULT_PEAK = 1000.0
// The manifest compares floats to a relative tolerance of 1e-5, because these are
// icFloatNumber (float, not double) upstream — match that exactly rather than
// inventing our own epsilon.
const RTOL = 1e-5

// Pull the dictType entries and the HAGC reference white out of the XML by text.
// A real parse would buy nothing here: these fixtures are generated, uniformly
// formatted, and we want to stay clear of anything that could import shared
// assumptions from the code under test.
function readXml(path) {
  const xml = readFileSync(path, 'utf8')
  const entries = {}
  for (const m of xml.matchAll(/<DictEntry\s+Name="([^"]*)"\s+Value="([^"]*)"/g)) {
    entries[m[1]] = m[2]
  }
  const white = xml.match(/HDRReferenceWhite="([^"]*)"/)
  return { entries, hagcWhite: white ? parseFloat(white[1]) : null }
}

// First number of a multi-valued entry. CLL is "maxCLL maxFALL n"; DCV and MDCV
// are "maxLuminance minLuminance n" — in both, the peak luminance leads.
const peakOf = (v) => (v == null ? null : parseFloat(String(v).trim().split(/\s+/)[0]))

// Content reference white: the profile's own CRWL entry if it has one, else the
// HAGC tag's HDRReferenceWhite, else the 203 default. This ordering is the one
// the HdrLinearHagcWhite fixture pins (no CRWL, HAGC white 300 -> 600/300 = 2).
function referenceWhite({ entries, hagcWhite }) {
  if (entries.CRWL != null) return parseFloat(entries.CRWL)
  if (hagcWhite != null) return hagcWhite
  return DEFAULT_REFERENCE_WHITE
}

// Rule -> value. Returns null for a rule we do not implement, so an unknown
// source in a future manifest is reported as unchecked rather than passing.
function expectedDisplay(src, x) {
  const { entries } = x
  switch (src) {
    case '-':        return 0
    case 'derh':     return entries.DERH != null ? parseFloat(entries.DERH) : null
    case 'dcv-drwl': return peakOf(entries.DCV) / parseFloat(entries.DRWL)
    case 'dcv-crwl': return peakOf(entries.DCV) / parseFloat(entries.CRWL)
    default:         return null
  }
}

function expectedContent(src, x) {
  const { entries } = x
  switch (src) {
    case '-':            return 0
    case 'cll':          return peakOf(entries.CLL)  / referenceWhite(x)
    case 'mdcv':         return peakOf(entries.MDCV) / referenceWhite(x)
    case 'default-1000': return DEFAULT_PEAK / referenceWhite(x)
    default:             return null
  }
}

const close = (a, b) => Math.abs(a - b) <= RTOL * Math.max(1, Math.abs(b))

const rows = readFileSync(MANIFEST, 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.split('\t')).filter((c) => c.length > 5)

let checked = 0, agree = 0, unchecked = 0
const problems = []

for (const c of rows) {
  const [fixture, , dispStr, dispSrc, contStr, contSrc] = c.map((v) => v.trim())
  const xmlPath = join(CORPUS, `${fixture}.xml`)
  if (!existsSync(xmlPath)) { problems.push(`MISSING XML  ${fixture}.xml`); continue }
  const x = readXml(xmlPath)

  for (const [axis, src, stated, fn] of [
    ['display', dispSrc, parseFloat(dispStr.replace(',', '.')), expectedDisplay],
    ['content', contSrc, parseFloat(contStr.replace(',', '.')), expectedContent],
  ]) {
    const ours = fn(src, x)
    if (ours === null || Number.isNaN(ours)) {
      unchecked++
      problems.push(`UNCHECKED    ${fixture} ${axis}: rule '${src}' not implemented, or its entries are absent`)
      continue
    }
    checked++
    if (close(ours, stated)) agree++
    else problems.push(`DISAGREE     ${fixture} ${axis}: manifest=${stated} recomputed=${ours} (rule '${src}')`)
  }
}

console.log(`hdr headroom: ${rows.length} rows, ${checked} values recomputed from XML — ` +
            `${agree} agree, ${checked - agree} disagree, ${unchecked} unchecked`)
for (const p of problems) console.log('  ' + p)
process.exit(checked - agree || problems.some((p) => p.startsWith('MISSING')) ? 1 : 0)
