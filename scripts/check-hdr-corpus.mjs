#!/usr/bin/env node
// (c) 2026 William Li
//
// Verify test-corpus/hdr against iccDEV's hdr-corpus-manifest.tsv.
//
// WHY THIS EXISTS. The manifest records each fixture's clause-8.10
// CLASSIFICATION, which is a different axis from the validation verdict: failing
// 8.10.1's membership conditions does not make a profile invalid, so the
// membership negatives all validate `valid` and are indistinguishable there.
// Upstream enforces it with CTest (iccdev.hdr-corpus-manifest); this is the
// profiletool-side equivalent, run against the committed WASM.
//
// It also exists because our own expectations broke twice in two rebuilds — once
// when the corpus was rewritten for a new amendment revision, once when an H-item
// verdict was corrected upstream. Asserting against the manifest rather than
// against remembered verdicts is what stops that recurring silently.
//
// How classification is read back. AddHdrItems() returns early for a profile of
// class `none`, so the report carries no HDR section at all; for a member it emits
// H1 as OK; for a non-member that still carries HDR content it emits H1 as N/A.
// That gives an exact three-way mapping with no extra API:
//
//     no `hdr` section  ->  none
//     H1 == OK          ->  conforming
//     H1 == N/A         ->  hdr-content
//
// Usage:  node scripts/check-hdr-corpus.mjs [--manifest <path>] [--dir <path>]
// Exits non-zero on any mismatch, so it can gate a rebuild.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt }
const CORPUS   = argOf('--dir', join(ROOT, 'test-corpus/hdr'))
const MANIFEST = argOf('--manifest', join(CORPUS, 'hdr-corpus-manifest.tsv'))

if (!existsSync(MANIFEST)) {
  console.error(`no manifest at ${MANIFEST}\n` +
    `Copy it from iccDEV's Testing/HDR/, or pass --manifest.`)
  process.exit(2)
}

const createIccPawgModule = (await import(join(ROOT, 'frontend/public/wasm/iccpawg.mjs'))).default
const mod = await createIccPawgModule()

// Tab-separated; '#' comments and blank lines skipped. Only the first two columns
// are checked here — the headroom columns assert icHdrProfileInfo fields that the
// PAWG report does not expose numerically, so they stay upstream's to enforce.
const rows = readFileSync(MANIFEST, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.split('\t'))
  .filter((c) => c.length > 1)
  .map((c) => ({ fixture: c[0].trim(), cls: c[1].trim(), purpose: (c[6] || '').trim() }))

let pass = 0, fail = 0, missing = 0
const problems = []

for (const row of rows) {
  const path = join(CORPUS, `${row.fixture}.icc`)
  if (!existsSync(path)) { missing++; problems.push(`MISSING  ${row.fixture}.icc`); continue }

  let report
  try { report = JSON.parse(mod.pawgReport(new Uint8Array(readFileSync(path)))) }
  catch (e) { fail++; problems.push(`THREW    ${row.fixture}: ${e.message}`); continue }

  const hdr = report.items.filter((i) => i.section === 'hdr')
  const h1 = hdr.find((i) => i.id === 'H1')
  const actual = hdr.length === 0 ? 'none'
               : h1?.verdict === 'OK' ? 'conforming'
               : h1?.verdict === 'N/A' ? 'hdr-content'
               : `unknown(H1=${h1?.verdict ?? 'absent'})`

  if (actual === row.cls) { pass++ }
  else { fail++; problems.push(`MISMATCH ${row.fixture}: manifest=${row.cls} actual=${actual}  (${row.purpose})`) }
}

// Fixtures present but NOT in the manifest. Not an error — ProfiletoolHdrDisplay
// is ours and deliberately absent from upstream's manifest, which we keep
// verbatim so it can be re-copied without a merge. But list them, so a fixture
// can never sit in the corpus silently unchecked: that is how a stale binary
// survived our last two rebuilds unnoticed.
const named = new Set(rows.map((r) => r.fixture))
const extras = readdirSync(CORPUS)
  .filter((f) => f.endsWith('.icc'))
  .map((f) => f.replace(/\.icc$/, ''))
  .filter((f) => !named.has(f))

console.log(`hdr corpus: ${rows.length} manifest rows — ${pass} match, ${fail} mismatch, ${missing} missing`)
for (const p of problems) console.log('  ' + p)
if (extras.length) {
  console.log(`  ${extras.length} fixture(s) not in the manifest (ours, checked only by the sweep):`)
  for (const e of extras) console.log(`    ${e}.icc`)
}
process.exit(fail + missing ? 1 : 0)
