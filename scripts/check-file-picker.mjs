#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/filePicker.js — the `accept` attribute rule that keeps iOS able to load
// .icc profiles at all. iOS resolves `accept` through system UTIs, so an extension it does not know
// (.icc, .icm, .cube, .exr, .cgats …) greys EVERY file out in the Files picker. There the attribute
// must be absent; everywhere else it stays a useful filter. Also checks the components that carry a
// list of such extensions actually route it through the helper.
//
// Usage: node scripts/check-file-picker.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIosFilePicker, acceptFor } from '../frontend/src/lib/filePicker.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0, fail = 0
const check = (name, ok, detail) => {
  if (ok) pass++; else fail++
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`)
}

// Real user agents.
const UA = {
  iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
  ipad: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
  // iPadOS 13+ claims to be a Mac; touch points are the only tell.
  ipadDesktopMode: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', maxTouchPoints: 5 },
  mac: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', maxTouchPoints: 0 },
  windows: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', maxTouchPoints: 0 },
  // A Windows touch laptop is NOT iOS, however many touch points it reports.
  windowsTouch: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', maxTouchPoints: 10 },
  androidChrome: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36', maxTouchPoints: 5 },
  firefoxIos: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15', maxTouchPoints: 5 },
}
for (const [name, nav] of Object.entries(UA)) {
  const want = ['iphone', 'ipad', 'ipadDesktopMode', 'firefoxIos'].includes(name)
  check(`isIosFilePicker: ${name} → ${want}`, isIosFilePicker(nav) === want)
}
check('no navigator (SSR / Node) → not iOS, list kept', isIosFilePicker(null) === false && acceptFor('.icc,.icm', null) === '.icc,.icm')
check('iOS: the attribute is dropped (undefined, so React omits it)', acceptFor('.icc,.icm', UA.iphone) === undefined)
check('desktop: the list is returned unchanged', acceptFor('.icc,.icm', UA.windows) === '.icc,.icm')

// The components must not hardcode a list containing an extension iOS cannot resolve.
const RISKY = /\.(icc|icm|cube|exr|hdr|pic|rgbe|cgats|it8|cxf)\b/
const comps = join(ROOT, 'frontend/src/components')
const offenders = []
for (const f of readdirSync(comps).filter((f) => f.endsWith('.jsx'))) {
  const src = readFileSync(join(comps, f), 'utf8')
  for (const m of src.matchAll(/accept=(?:"([^"]*)"|'([^']*)'|\{acceptFor\((?:'([^']*)'|"([^"]*)")\)\})/g)) {
    const [, dq, sq, helperSq, helperDq] = m
    const literal = dq ?? sq                      // a hardcoded attribute
    const viaHelper = helperSq ?? helperDq
    if (literal && RISKY.test(literal)) offenders.push(`${f}: hardcoded ${literal}`)
    if (viaHelper && !RISKY.test(viaHelper)) offenders.push(`${f}: helper used for a safe list ${viaHelper} (harmless, but unnecessary)`)
  }
}
check('no component hardcodes an accept list iOS cannot resolve', offenders.filter((o) => o.includes('hardcoded')).length === 0, offenders)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
