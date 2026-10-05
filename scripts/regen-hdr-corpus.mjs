#!/usr/bin/env node
// (c) 2026 William Li
//
// Regenerate test-corpus/hdr/*.icc from the committed XML, through profiletool's OWN
// iccxml WASM (xmlToIcc) — the refresh step test-corpus/hdr/README.md describes.
//
// WHY THROUGH OUR WASM AND NOT upstream's mkprofiles.sh. Upstream commits XML only and
// builds binaries with Testing/HDR/mkprofiles.sh, which we cannot run here. Generating
// through the Emscripten build of IccXML is also the point: check-hdr-corpus.mjs then
// asserts that the WASM build classifies every fixture exactly as the native build's
// manifest says — a cross-toolchain agreement nothing upstream covers.
//
// RUN AFTER a WASM rebuild (scripts/build-wasm.sh), never before: it links whatever is
// in frontend/public/wasm/, so running it first regenerates the corpus with the OLD
// library and the checks then compare old binaries against the new classifier.
//
// It reports which binaries CHANGED, not just how many it wrote. That is deliberate: a
// stale .icc once survived two rebuilds here unnoticed, and "wrote 45" says nothing
// about which of them moved.
//
// TIMESTAMP-ONLY CHANGES ARE NOT WRITTEN. The ten BT2100* fixtures' XML sets
// <CreationDateTime>now</CreationDateTime>, so every conversion stamps a new header date
// (bytes 24..35) and therefore a new MD5 profile ID (bytes 84..99) — 19 bytes that
// differ on every run while nothing else does. Rewriting them would put ten meaningless
// binaries in every refresh's diff, so a regenerated profile that differs from the
// committed one ONLY inside those two ranges is left untouched and reported as such.
// Any change outside them is written and reported as CHANGED. --force writes regardless.
//
// Usage:  node scripts/regen-hdr-corpus.mjs [--dir <path>] [--only <Fixture>] [--force]
// Exits non-zero if any XML fails to convert, so it can gate a refresh.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const argOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }
const CORPUS = argOf('--dir', join(ROOT, 'test-corpus/hdr'))
const ONLY = argOf('--only', null)
const FORCE = argv.includes('--force')

const createIccXml = (await import(join(ROOT, 'frontend/public/wasm/iccxml.mjs'))).default
const mod = await createIccXml()
// Embind throws a WASM exception pointer, not an Error; unwrap it for a readable reason.
const why = (e) => { try { return mod.getExceptionMessage(e)[1] } catch { return e?.message || String(e) } }

// Byte equality, so "changed" means changed rather than "rewritten".
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
// ICC header: creation dateTimeNumber at 24..35, profile ID (MD5) at 84..99.
const inStampOrId = (i) => (i >= 24 && i < 36) || (i >= 84 && i < 100)
const onlyStampDiffers = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i] || inStampOrId(i))

const xmls = readdirSync(CORPUS).filter((f) => f.endsWith('.xml'))
  .filter((f) => !ONLY || f === `${ONLY}.xml`).sort()
if (!xmls.length) { console.error(ONLY ? `no ${ONLY}.xml in ${CORPUS}` : `no XML in ${CORPUS}`); process.exit(2) }

const changed = [], added = [], failed = []
let unchanged = 0, stampOnly = 0
for (const f of xmls) {
  const out = join(CORPUS, f.replace(/\.xml$/, '.icc'))
  let bytes
  try { bytes = new Uint8Array(mod.xmlToIcc(readFileSync(join(CORPUS, f), 'utf8'))) }
  catch (e) { failed.push(`${f}: ${why(e)}`); continue }
  const before = existsSync(out) ? new Uint8Array(readFileSync(out)) : null
  if (before && same(before, bytes)) { unchanged++; continue }
  if (before && !FORCE && onlyStampDiffers(before, bytes)) { stampOnly++; continue }
  writeFileSync(out, bytes)
  if (!before) added.push(f)
  else changed.push(f)
}

// Binaries with no XML beside them are left alone but named: a deleted fixture's .icc
// otherwise lingers, and check-hdr-corpus.mjs only lists extras, it does not fail on them.
const orphans = readdirSync(CORPUS).filter((f) => f.endsWith('.icc'))
  .filter((f) => !existsSync(join(CORPUS, f.replace(/\.icc$/, '.xml'))))

console.log(`regen-hdr-corpus: ${xmls.length} XML — ${unchanged} unchanged, ` +
            `${stampOnly} kept (only the header date + profile ID would change), ` +
            `${changed.length} changed, ${added.length} new, ${failed.length} failed`)
for (const f of changed) console.log(`  CHANGED   ${f.replace(/\.xml$/, '.icc')}`)
for (const f of added) console.log(`  NEW       ${f.replace(/\.xml$/, '.icc')}`)
for (const f of orphans) console.log(`  ORPHAN    ${f} has no XML — a deleted fixture? remove it by hand`)
for (const x of failed) console.log(`  FAILED    ${x}`)
process.exit(failed.length ? 1 : 0)
