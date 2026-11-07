#!/usr/bin/env node
// (c) 2026 William Li
//
// Check the manual translations in manual/MANUAL.<lang>.md against MANUAL.md.
// The model (chunks, {#anchor src=hash}, English fallback) is described at the
// top of scripts/lib/manual-l10n.cjs.
//
// ERRORS (exit 1):
//   - a heading without {#anchor src=hash}, an anchor English does not have, a
//     duplicate, or chunks out of English order
//   - a link to an anchor that does not exist
//   - an English `code` span missing from the translated chunk (code, file names,
//     signatures and URLs are never translated)
//   - a different number of note boxes or table rows than the English chunk
//   - an interface label: where English writes a bold UI string (**Combine**),
//     the translation must bold that string's translation from i18n.jsx, so the
//     manual never names a control the app calls something else
//   - a section whose body is still identical to English (an untranslated template)
//   - a diagram label or page string with no entry in manual/strings.<lang>.json
// STALE / MISSING chunks are reported, and fail only with --strict: they build
// fine (English fallback), but a release may want full coverage.
//
// Usage: node scripts/check-manual-l10n.mjs [--lang fr] [--strict] [--quiet]

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const l10n = require('./lib/manual-l10n.cjs')
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
const ONLY = argOf('--lang')
const STRICT = argv.includes('--strict')
const QUIET = argv.includes('--quiet')
const langs = ONLY ? [ONLY] : l10n.LOCALES
if (ONLY && !l10n.LOCALES.includes(ONLY)) { console.error(`unknown locale ${ONLY}`); process.exit(2) }

const I18N = l10n.loadI18N()
const en = l10n.readEnglish()
const enById = new Map(en.slice(1).map((c) => [c.id, c]))
const enOrder = en.slice(1).map((c) => c.id)
const allIds = new Set(enOrder)

// ``` fences are compared whole (fenceBlocks); inline spans are read with the
// fences removed, or a fence's backticks pair with inline ones and swallow prose.
const FENCE_RE = /^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm
const fenceBlocks = (t) => t.match(FENCE_RE) || []
const codeSpans = (t) => [...t.replace(FENCE_RE, '').matchAll(/`([^`]+)`/g)].map((m) => m[1])
// Product names are bold in the prose but are not controls to match.
const NOT_LABELS = new Set(['ICC Profile Tool'])
const bolds = (t) => [...t.matchAll(/\*\*([^*]+)\*\*/g), ...t.matchAll(/<strong>(.*?)<\/strong>/g)].map((m) => m[1].trim())
const links = (t) => [...t.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1])
const notes = (t) => (t.match(/<div class="note">/g) || []).length
const tableRows = (t) => t.split('\n').filter((l) => /^\|/.test(l)).length

// Diagram labels / page strings the generator could not translate, per locale:
// run it into a scratch directory and read its report.
const scratch = mkdtempSync(join(tmpdir(), 'help-check-'))
let genOut = ''
try {
  genOut = execFileSync('node', [join(ROOT, 'scripts/generate-help.js')], {
    encoding: 'utf8', env: { ...process.env, HELP_OUT_DIR: scratch },
  })
} finally { rmSync(scratch, { recursive: true, force: true }) }
const missingDiagram = new Map()
for (const m of genOut.matchAll(/diagram labels with no (\S+) translation \(shown in English\): (.*)/g)) {
  missingDiagram.set(m[1], m[2])
}

let errors = 0, staleTotal = 0
for (const lang of langs) {
  const problems = []
  const tr = l10n.readTranslation(lang)
  if (!tr) {
    console.log(`${lang.padEnd(6)} no manual/MANUAL.${lang}.md — every section shows in English`)
    staleTotal += enOrder.length
    continue
  }
  const seen = new Set()
  let lastIdx = -1, stale = 0, missing = 0, translated = 0
  for (const c of tr.slice(1)) {
    if (!c.id || !c.src) { problems.push(`heading "${c.title}" has no {#anchor src=hash}`); continue }
    if (!allIds.has(c.id)) { problems.push(`#${c.id}: no such English section`); continue }
    if (l10n.EN_ONLY.has(c.id)) { problems.push(`#${c.id}: English-only section; remove it from the translation`); continue }
    if (seen.has(c.id)) { problems.push(`#${c.id}: duplicated`); continue }
    seen.add(c.id)
    const idx = enOrder.indexOf(c.id)
    if (idx < lastIdx) problems.push(`#${c.id}: out of English order`)
    lastIdx = Math.max(lastIdx, idx)

    const e = enById.get(c.id)
    if (c.src !== e.hash) { stale++; continue }   // stale: built as English; nothing else to compare
    translated++

    // A template chunk left in English still carries a current hash, so it would
    // pass as translated. Bodies identical to English are untranslated.
    const body = (t) => t.split('\n').slice(1).join('\n').trim()
    if (body(e.text) && body(c.text) === body(e.text)) problems.push(`#${c.id}: still identical to English`)

    for (const id of links(c.text)) if (!allIds.has(id)) problems.push(`#${c.id}: link to unknown #${id}`)
    const trCode = new Set(codeSpans(c.text))
    for (const s of codeSpans(e.text)) if (!trCode.has(s)) problems.push(`#${c.id}: code span \`${s}\` missing`)
    const trFences = new Set(fenceBlocks(c.text))
    for (const f of fenceBlocks(e.text)) if (!trFences.has(f)) problems.push(`#${c.id}: a code block differs from English (code blocks are not translated)`)
    if (notes(c.text) !== notes(e.text)) problems.push(`#${c.id}: ${notes(c.text)} note boxes, English has ${notes(e.text)}`)
    if (tableRows(c.text) !== tableRows(e.text)) problems.push(`#${c.id}: ${tableRows(c.text)} table rows, English has ${tableRows(e.text)}`)

    const trBold = bolds(c.text)
    for (const b of new Set(bolds(e.text))) {
      const keys = NOT_LABELS.has(b) ? [] : l10n.uiKeysFor(b)
      if (!keys.length) continue                       // emphasis, not an interface label
      const want = [...new Set(keys.map((k) => I18N[lang]?.[k]).filter(Boolean))]
      if (!want.length) continue
      if (!trBold.some((x) => want.some((w) => x.includes(w)))) {
        problems.push(`#${c.id}: UI label **${b}** should appear in bold as ${want.map((w) => `**${w}**`).join(' or ')}`)
      }
    }
  }
  for (const id of enOrder) if (!l10n.EN_ONLY.has(id) && !seen.has(id)) missing++
  if (missingDiagram.has(lang)) problems.push(`manual/strings.${lang}.json lacks diagram labels: ${missingDiagram.get(lang)}`)

  staleTotal += stale + missing
  errors += problems.length
  const total = enOrder.length - l10n.EN_ONLY.size
  console.log(`${lang.padEnd(6)} translated ${translated}/${total}, stale ${stale}, missing ${missing}, errors ${problems.length}`)
  if (!QUIET) for (const p of problems) console.log(`         ${p}`)
}

if (errors || (STRICT && staleTotal)) {
  console.log(`\nFAIL: ${errors} error(s)${STRICT ? `, ${staleTotal} stale/missing section(s)` : ''}`)
  process.exit(1)
}
console.log(`\nOK${staleTotal ? ` (${staleTotal} stale/missing section(s) build in English)` : ''}`)
