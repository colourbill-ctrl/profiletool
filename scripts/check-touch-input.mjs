#!/usr/bin/env node
// (c) 2026 William Li
//
// Tests frontend/src/lib/touchInput.js — the "can this user drag?" check behind the tap path that
// replaces drag and drop on touch screens (iOS has no HTML5 drag and drop at all).
//
// Usage: node scripts/check-touch-input.mjs

import { isTouchPrimary } from '../frontend/src/lib/touchInput.js'

let pass = 0, fail = 0
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? 'pass' : 'FAIL'}  ${name}`) }
const mm = (coarse) => (q) => ({ matches: /pointer:\s*coarse/.test(q) ? coarse : false })

check('coarse pointer (phone, tablet) → touch primary', isTouchPrimary(mm(true)) === true)
check('fine pointer (mouse) → not touch primary', isTouchPrimary(mm(false)) === false)
check('no matchMedia (old browser, SSR, Node) → not touch primary', isTouchPrimary(null) === false)
check('matchMedia that throws → not touch primary, no crash', isTouchPrimary(() => { throw new Error('nope') }) === false)
// A query the engine does not understand parses to 'not all' and never matches: that reads as a
// mouse, which is the safe default — drag stays, and the tap path is additive anyway.
check('unknown media feature → not touch primary', isTouchPrimary(() => ({ matches: false, media: 'not all' })) === false)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
