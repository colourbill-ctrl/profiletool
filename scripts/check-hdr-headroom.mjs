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

import { readFileSync, existsSync, readdirSync } from 'node:fs'
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

// Registry value shapes, per key. Every one leads with the MAXIMUM luminance,
// which is all this file reads (IccProfLib does the same: lums[0]):
//
//   CLL   max, AVERAGE, primaries           (MaxCLL / MaxFALL)
//   MDCV  max, min, primaries
//   CCV   max, average, min, primaries      (FOUR values)
//   DCV   max, min, primaries               (HDR Display registration)
//
// An earlier version of this comment called every entry "maxLum minLum n". That
// shorthand came from an iccDEV description that was itself corrected against the
// registry pages: CLL's second field is an AVERAGE, not a minimum, and CCV carries
// four values. peakOf() only ever took index 0, so no headroom number was affected
// — but an arity check must expect 4 for CCV, and prose naming CLL's second field
// "min" is simply wrong.
//
// The arity check itself is not defensive padding. Our own fixtures twice shipped
// a TEN-value DCV (chromaticities first, luminance at index 8) copied from a
// pre-refresh upstream fixture; taking [0] from that yields 0.708 as a peak, and
// it hid both times behind a `derh` rule that consults no DCV.
const EXPECTED_ARITY = { CLL: 3, MDCV: 3, CCV: 4, DCV: 3 }

// 0.0 IS "UNKNOWN", NOT A PEAK. The CLL, MDCV and CCV registry entries and the DCV
// registration all say "Value of 0.0 means that the respective value is unknown".
// So an unknown maximum supplies no peak at all, and resolution falls through to
// the next rule (8.10.4 a -> b -> the 1000 default; 8.10.5 b/c -> d). Treating it
// as a real 0 would compute 0/white = 0, which is below every target and — in
// IccProfLib before 88672a2e — also switched the target-volume clamp off. If the
// manifest ever names a rule whose entry is unknown, that is a manifest/spec
// inconsistency and this reports it UNCHECKED rather than inventing a number.
function peakOf(key, v) {
  if (v == null) return null
  const parts = String(v).trim().split(/\s+/)
  if (EXPECTED_ARITY[key] != null && parts.length !== EXPECTED_ARITY[key]) return null
  const n = parseFloat(parts[0])
  if (!Number.isFinite(n) || n === 0) return null
  return n
}

// Content reference white: the HAGC tag's HDRReferenceWhite if the tag carries
// one, else the metadataTag CRWL entry, else the 203 default.
//
// THIS ORDERING IS DERIVED FROM THE CLAUSE for the axis this function feeds.
// 8.10.4's default paragraph fires only when there is NO HAGC tag *and* no CRWL
// entry — a condition that is only coherent if the HAGC tag supplies the white
// when it is present — and 8.10.4 a) then divides CLL.max by "the value derived
// above", i.e. by that same HAGC-aware derivation. That is normative text, so
// HAGC-first is what the clause says for content headroom, not a house rule.
// (8.10.3 ranks the HAGC tag highest among tone-mapping descriptors and has it
// applied as its own Annex 1 defines, which agrees — but 8.10.3 is explicitly
// INFORMATIVE and ranks descriptors rather than metadata values, so it supports
// the reading without carrying it. 8.10.4 a) is the load-bearing half.)
//
// An earlier version of this comment called the ordering iccDEV's ruling rather
// than a derivation. That was accurate when written and is not now: iccDEV
// re-examined 8.10.3/8.10.4 and reclassified it. Recorded because the distinction
// decides what happens if the register item moves — a ruling could be reversed,
// a clause reading changes only if the clause does.
//
// WHERE IT REMAINS A RULING: 8.10.5 c), which this file's `dcv-crwl` rule feeds.
// That clause literally names the ENTRY — CRWL "taken from the HDR Image metadata
// of 8.10.4", defaulting "when no CRWL entry is present", a condition that never
// mentions the HAGC tag. Dividing the display axis by the HAGC-first value is
// therefore a decision that one named quantity has one value, taken against
// 8.10.5 c)'s literal words. Our cross-axis check pins that CHOICE, not a defect.
//
// This file first shipped with the order INVERTED (CRWL first) and still scored
// 84/84, because no fixture in the upstream corpus carries both a HAGC reference
// white and a CRWL entry. iccDEV found that by comparing the two orders. The
// coverage report at the end of this file exists so that gap can never again be
// invisible behind a green run.
function referenceWhite({ entries, hagcWhite }) {
  if (hagcWhite != null) return hagcWhite
  if (entries.CRWL != null) return parseFloat(entries.CRWL)
  return DEFAULT_REFERENCE_WHITE
}

// Rule -> value. Returns null for a rule we do not implement, so an unknown
// source in a future manifest is reported as unchecked rather than passing.
// Divide, propagating "could not read this" as null rather than letting it coerce.
// `null / 203` is 0 in JavaScript, not NaN, so without this an unparsable entry is
// reported as a wrong VALUE instead of an unverifiable one -- which would send a
// reader hunting for a data error that is really a parser limitation.
const div = (n, d) => (n == null || d == null || !Number.isFinite(d) || d === 0 ? null : n / d)
const num = (v) => { const n = v == null ? NaN : parseFloat(v); return Number.isFinite(n) ? n : null }

function expectedDisplay(src, x) {
  const { entries } = x
  switch (src) {
    case '-':        return 0
    case 'derh':     return num(entries.DERH)
    case 'dcv-drwl': return div(peakOf('DCV', entries.DCV), num(entries.DRWL))
    case 'dcv-crwl': return div(peakOf('DCV', entries.DCV), referenceWhite(x))
    default:         return null
  }
}

function expectedContent(src, x) {
  const { entries } = x
  switch (src) {
    case '-':            return 0
    case 'cll':          return div(peakOf('CLL', entries.CLL),  referenceWhite(x))
    case 'mdcv':         return div(peakOf('MDCV', entries.MDCV), referenceWhite(x))
    case 'default-1000': return div(DEFAULT_PEAK, referenceWhite(x))
    default:             return null
  }
}

// Which entries each rule reads, so an unchecked value can say WHY it could not be
// checked. One catch-all sentence ("not implemented, or its entries are absent")
// was wrong for the case that matters most — an entry that is present and well
// formed but carries 0.0, which the registry defines as unknown — and a wrong
// reason sends the reader to look in the wrong place.
const READS = {
  'dcv-drwl': ['DCV', 'DRWL'], 'dcv-crwl': ['DCV'], derh: ['DERH'],
  cll: ['CLL'], mdcv: ['MDCV'], 'default-1000': [],
}
function whyUnchecked(src, x) {
  if (!(src in READS)) return `rule '${src}' is not implemented here`
  for (const key of READS[src]) {
    const v = x.entries[key]
    if (v == null) return `rule '${src}' reads ${key}, which this fixture does not carry`
    const parts = String(v).trim().split(/\s+/)
    if (EXPECTED_ARITY[key] != null && parts.length !== EXPECTED_ARITY[key]) {
      return `${key} has ${parts.length} value(s) but the registry shape is ${EXPECTED_ARITY[key]}`
    }
    if (EXPECTED_ARITY[key] != null && parseFloat(parts[0]) === 0) {
      return `${key}'s maximum is 0.0, which the registry defines as UNKNOWN — it supplies no ` +
             `peak, so the manifest names a rule this entry cannot drive (resolution should have ` +
             `fallen through to the next rule)`
    }
    if (!Number.isFinite(parseFloat(parts[0]))) return `${key} does not parse as a number`
  }
  return `rule '${src}' produced no value for a reason not classified here`
}

const close = (a, b) => Math.abs(a - b) <= RTOL * Math.max(1, Math.abs(b))


// Our own fixtures live in a separate expectations file so upstream's manifest
// stays a verbatim copy. Same columns; absent is fine.
function loadRows(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
}
const LOCAL = argOf('--local', join(CORPUS, 'profiletool-fixtures.tsv'))
const rows = [...loadRows(MANIFEST), ...loadRows(LOCAL)].filter((c) => c.length > 5)

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
      problems.push(`UNCHECKED    ${fixture} ${axis}: ${whyUnchecked(src, x)}`)
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

// NO CROSS-AXIS CHECK HERE, deliberately. An earlier version of this file
// reported that 8.10.4 and 8.10.5 c) divide by different reference whites on any
// fixture whose XML carried both carriers with different values. That was a
// statement about IccProfLib's BEHAVIOUR made by a file that links no ICC code and
// so cannot observe it: it detected the precondition from XML shape and then
// asserted what the implementation did. When iccDEV fixed the divergence
// (88672a2e), it would have gone on reporting it — a status claim with no evidence
// behind it, pointing at a bug that no longer existed.
//
// An invariant about what the implementation DOES belongs where the implementation
// is observed: check-hdr-corpus.mjs now reads H7's resolved content reference white
// and H8's rule-c divisor out of the real PAWG report and flags them only if they
// differ. This file keeps to what it can actually establish from the XML.

// ENTRY-ARITY AUDIT. Every reader of these dictType entries -- ours, IccProfLib's,
// anyone's -- reads them POSITIONALLY, so a key that appears with two different
// value shapes across the corpus is a silent misparse waiting to happen: taking
// [0] from a ten-value DCV (chromaticities first, luminance at index 8) yields
// 0.708 as a peak luminance rather than failing. We shipped exactly that twice,
// both times shielded by a fixture whose display rule was `derh` and so consulted
// no DCV at all. Auditing shapes across the whole corpus catches it even when no
// rule currently reads the entry -- which is the only way to catch it early,
// since the bug is invisible precisely while nothing exercises it.
const arities = {}
for (const f of readdirSync(CORPUS).filter((f) => f.endsWith('.xml'))) {
  const xml = readFileSync(join(CORPUS, f), 'utf8')
  for (const m of xml.matchAll(/<DictEntry\s+Name="([^"]*)"\s+Value="([^"]*)"/g)) {
    const n = m[2].trim().split(/\s+/).length
    ;(arities[m[1]] ||= new Map()).set(n, [...(arities[m[1]].get(n) || []), f.replace(/\.xml$/, '')])
  }
}
// Two failure shapes, reported separately because they mean different things:
//   inconsistent  one key, two arities across the corpus — somebody's reader
//                 is wrong for half of them, whichever convention is right;
//   off-registry  one arity everywhere, but not the registry's — a corpus can
//                 be perfectly self-consistent and still uniformly wrong, which
//                 a consistency check alone would pass.
let arityProblem = false
for (const [key, shapes] of Object.entries(arities)) {
  const detail = [...shapes.entries()]
    .map(([n, files]) => `${n} value(s) in ${files.join(', ')}`).join('; ')
  if (shapes.size > 1) {
    arityProblem = true
    console.log(`  ARITY       ${key} appears with inconsistent shapes — ${detail}`)
  } else if (EXPECTED_ARITY[key] != null && !shapes.has(EXPECTED_ARITY[key])) {
    arityProblem = true
    console.log(`  ARITY       ${key} has ${[...shapes.keys()][0]} value(s) everywhere; the registry ` +
                `shape is ${EXPECTED_ARITY[key]} — ${detail}`)
  }
}

// COVERAGE, not correctness. A green run says the values agree; it does not say
// which RULES were exercised to get there. The reference-white precedence is only
// tested by a fixture carrying BOTH carriers with DIFFERENT values — invert the
// order without one and every row still passes. Report that explicitly so the
// absence of a test never reads as the presence of one.
const discriminating = rows
  .map((c) => c[0].trim())
  .filter((f) => {
    const x = existsSync(join(CORPUS, `${f}.xml`)) ? readXml(join(CORPUS, `${f}.xml`)) : null
    return x && x.hagcWhite != null && x.entries.CRWL != null &&
           Math.abs(x.hagcWhite - parseFloat(x.entries.CRWL)) > 1e-9
  })
console.log(discriminating.length
  ? `  reference-white precedence: EXERCISED by ${discriminating.join(', ')}`
  : `  reference-white precedence: NOT EXERCISED — no manifest fixture carries both a HAGC
` +
    `    reference white and a differing CRWL entry, so inverting the order still passes.`)
// UNCHECKED fails the run as well. A value that could not be verified is not a
// verified value, and the exit status is the only part a CI gate reads — a count of
// "1 unchecked" printed above an exit 0 is a pass to anything automated.
process.exit(checked - agree || unchecked || arityProblem ||
             problems.some((p) => p.startsWith('MISSING')) ? 1 : 0)
