#!/usr/bin/env node
// (c) 2026 William Li
//
// Checks the iccxml WASM module's XML → ICC reader on colorantTable channels (iccDEV #2548,
// first pinned in profiletool at hdr-profiles 80a162c2). Before that fix a channel was read
// with bare atof(): "not-a-number" silently became 0 and "50abc" became 50. Now a value must
// be a whole, finite number or the conversion is refused.
//
// Input: iccDEV's own Testing/CLUT/avx2-3d-9-output.xml (a profile with a ColorantTable),
// from ICCDEV_ROOT (default ~/code/iccdev). Only the channel attributes are altered.
//
// Usage: ICCDEV_ROOT=/path/to/iccdev node scripts/check-xml-colorant.mjs

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICCDEV = process.env.ICCDEV_ROOT || join(homedir(), 'code/iccdev')
const SAMPLE = join(ICCDEV, 'Testing/CLUT/avx2-3d-9-output.xml')
if (!existsSync(SAMPLE)) { console.error(`sample not found: ${SAMPLE} (set ICCDEV_ROOT)`); process.exit(2) }

const factory = (await import(join(ROOT, 'frontend/public/wasm/iccxml.mjs'))).default
const mod = await factory()

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++; else failed++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + detail : ''}`)
}
// Convert; return { bytes } or { error } with the C++ exception text.
const convert = (xml) => {
  try { return { bytes: mod.xmlToIcc(xml) } } catch (e) {
    let msg = e?.message || String(e)
    try { const m = mod.getExceptionMessage?.(e); if (m) msg = Array.isArray(m) ? m.join(': ') : String(m) } catch { /* keep msg */ }
    return { error: msg }
  }
}

const xml = readFileSync(SAMPLE, 'utf8')
const FIRST = 'Channel1="0.1"'
check('sample carries a ColorantTable with the expected first channel', xml.includes('<ColorantTable') && xml.includes(FIRST))

const base = convert(xml)
check('unaltered sample converts', !!base.bytes && base.bytes.length > 128, base.error)
if (base.bytes) {
  const back = mod.iccToXml(base.bytes)
  check('round trip keeps the colorant table', back.includes('<ColorantTable') && /Channel1="0\.1/.test(back))
}

const CASES = [
  // [attribute value, should convert, label]
  ['not-a-number', false, 'non-numeric channel refused'],
  ['50abc', false, 'trailing garbage refused'],
  ['1e400', false, 'value beyond float range refused'],
  ['', false, 'empty channel refused'],
  ['  0.1  ', true, 'leading/trailing whitespace accepted'],
  ['1e-3', true, 'exponent form accepted'],
]
for (const [value, ok, label] of CASES) {
  const r = convert(xml.replace(FIRST, `Channel1="${value}"`))
  const refused = !r.bytes
  check(`"${value}": ${label}`, ok ? !refused : refused && /finite numbers/.test(r.error || ''), r.error)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
