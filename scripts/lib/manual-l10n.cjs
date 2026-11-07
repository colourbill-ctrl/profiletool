// (c) 2026 William Li
'use strict';
// scripts/lib/manual-l10n.cjs — shared model for the localized user manual.
//
// Used by scripts/generate-help.js (builds help.html + help.<lang>.html) and
// scripts/check-manual-l10n.mjs (structure / staleness / UI-label checks).
//
// THE MODEL
//   MANUAL.md                  English, the single source of truth.
//   manual/MANUAL.<lang>.md    one translation per interface locale.
//
// Both files are split into CHUNKS: a chunk is one heading line plus everything
// up to the next heading of ANY level (headings inside ``` fences don't count).
// A chunk is the unit of translation, of staleness and of fallback.
//
// Every heading in a translation carries its English chunk's anchor and a hash
// of the English chunk it was translated from:
//
//     ## 2. Panneau des réglages {#2-settings-panel src=1a2b3c4d}
//
// The anchor is the English slug, so links, the diagrams' insertion points and
// the help pane's in-page navigation are identical in every language. (Slugging
// a translated heading would not work anyway: the slug keeps only [a-z0-9], so a
// Chinese, Japanese or Korean heading would collapse to an empty anchor.)
//
// When the English chunk changes, its hash changes, and the translated chunk is
// STALE: the build shows the English chunk in its place with a localized note,
// rather than a silently outdated translation. A missing chunk falls back the
// same way. Stale chunks never block a build; `check-manual-l10n.mjs --strict`
// turns them into failures when a release wants full coverage.
//
// ENGLISH-ONLY CHUNKS (EN_ONLY) are never translated: the build always takes the
// English text and adds an English note saying why. Today that is the HDR
// material, which documents a beta feature still following a draft ICC
// amendment. A translation file does not carry these chunks at all.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..', '..');
const MANUAL_EN = path.join(REPO, 'MANUAL.md');
const MANUAL_DIR = path.join(REPO, 'manual');
const I18N_SRC = path.join(REPO, 'frontend', 'src', 'i18n.jsx');

// The interface's locales, minus English. Same codes as i18n.jsx's I18N keys,
// so the help pane can map the resolved Language setting straight to a file.
const LOCALES = ['fr', 'de', 'it', 'es', 'pt-PT', 'pt-BR', 'sv', 'zh-CN', 'zh-TW', 'ja', 'ko'];

// Chunks kept in English in every locale, by English anchor.
const EN_ONLY = new Set([
  '4-7-hdr-tab',            // ### 4.7 HDR tab
  'hdr-gain-curves-hagc',   // #### HDR gain curves (HAGC), under 3.2 Tags
]);

// Shown under each English-only heading in a localized page. Deliberately in
// English: it explains to the reader why the section in front of them is.
const EN_ONLY_NOTE =
  '<strong>This section is in English only.</strong> It describes HDR support, a beta feature ' +
  'that follows a draft ICC amendment and is still changing. It will be translated once the ' +
  'feature and its text are stable.';

const pageFile = (lang) => (lang === 'en' ? 'help.html' : `help.${lang}.html`);
const manualFile = (lang) => (lang === 'en' ? MANUAL_EN : path.join(MANUAL_DIR, `MANUAL.${lang}.md`));

// Same slug the generator has always used, so every existing English anchor
// (and every #anchor link anyone has bookmarked) is unchanged.
function slug(h) {
  return h.replace(/^#+\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// `## Title {#id src=abcd1234}` → { text: 'Title', id, src }. Attributes are
// optional; a heading without them returns id/src undefined.
const ATTR_RE = /\s*\{#([a-z0-9-]+)(?:\s+src=([0-9a-f]{8}))?\}\s*$/;
function splitHeading(line) {
  const m = /^(#{1,4})\s+(.*)$/.exec(line);
  if (!m) return null;
  const level = m[1].length;
  let text = m[2];
  const a = ATTR_RE.exec(text);
  let id, src;
  if (a) { id = a[1]; src = a[2]; text = text.slice(0, a.index); }
  return { level, text: text.trim(), id, src };
}

// Split markdown into chunks. chunks[0] is the PREAMBLE (text before the first
// heading, e.g. the copyright comment) with id '' and level 0.
function parseChunks(md, { english }) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const chunks = [{ id: '', level: 0, title: '', lines: [], src: undefined, headingLine: '' }];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const h = !inFence && splitHeading(line);
    if (h) {
      const id = english ? (h.id || slug(h.text)) : h.id;
      chunks.push({ id, level: h.level, title: h.text, src: h.src, headingLine: line, lines: [line] });
    } else {
      chunks[chunks.length - 1].lines.push(line);
    }
  }
  for (const c of chunks) {
    while (c.lines.length && c.lines[c.lines.length - 1].trim() === '') c.lines.pop();
    c.text = c.lines.join('\n');
  }
  return chunks;
}

// Hash of an English chunk: its text with trailing whitespace normalised. Any
// edit to the heading or body changes it; re-wrapping blank lines does not.
function chunkHash(chunk) {
  const norm = chunk.lines.map((l) => l.replace(/\s+$/, '')).join('\n').trim();
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 8);
}

function readEnglish() {
  const chunks = parseChunks(fs.readFileSync(MANUAL_EN, 'utf8'), { english: true });
  const seen = new Set();
  for (const c of chunks.slice(1)) {
    if (!c.id) throw new Error(`MANUAL.md: heading "${c.title}" slugs to an empty anchor`);
    if (seen.has(c.id)) throw new Error(`MANUAL.md: duplicate anchor #${c.id} ("${c.title}")`);
    seen.add(c.id);
    c.hash = chunkHash(c);
  }
  return chunks;
}

function readTranslation(lang) {
  const file = manualFile(lang);
  if (!fs.existsSync(file)) return null;
  return parseChunks(fs.readFileSync(file, 'utf8'), { english: false });
}

// Rewrite a chunk's heading line to carry an explicit anchor (and optionally a
// src hash), keeping its level and text. The generator reads ids from these.
function withAttrs(chunk, id, src) {
  const h = splitHeading(chunk.headingLine);
  const head = `${'#'.repeat(h.level)} ${h.text} {#${id}${src ? ' src=' + src : ''}}`;
  return [head, ...chunk.lines.slice(1)].join('\n');
}

// A note block inserted directly under a heading.
const noteAfterHeading = (chunkText, html) => {
  const nl = chunkText.indexOf('\n');
  const head = nl === -1 ? chunkText : chunkText.slice(0, nl);
  const rest = nl === -1 ? '' : chunkText.slice(nl + 1);
  return `${head}\n\n<div class="note">${html}</div>\n${rest}`;
};

// Assemble the markdown the generator renders for one locale, chunk by chunk in
// ENGLISH order, and report what fell back. For 'en' this is MANUAL.md with
// explicit anchors on every heading.
function assemble(lang, staleNoteHtml) {
  const en = readEnglish();
  const report = { stale: [], missing: [], orphan: [], enOnly: [], translated: 0 };
  if (lang === 'en') {
    const md = [en[0].text, ...en.slice(1).map((c) => withAttrs(c, c.id))].join('\n\n');
    return { md, report };
  }
  const tr = readTranslation(lang) || [{ id: '', lines: [], text: '' }];
  const byId = new Map(tr.slice(1).map((c) => [c.id, c]));
  const enIds = new Set(en.slice(1).map((c) => c.id));
  for (const c of tr.slice(1)) if (!c.id || !enIds.has(c.id)) report.orphan.push(c.id || c.title);

  const parts = [en[0].text];   // preamble (copyright comment) is not translated
  for (const c of en.slice(1)) {
    if (EN_ONLY.has(c.id)) {
      report.enOnly.push(c.id);
      parts.push(noteAfterHeading(withAttrs(c, c.id), EN_ONLY_NOTE));
      continue;
    }
    const t = byId.get(c.id);
    if (t && t.src === c.hash) {
      report.translated++;
      parts.push(withAttrs(t, c.id));
    } else {
      (t ? report.stale : report.missing).push(c.id);
      parts.push(noteAfterHeading(withAttrs(c, c.id), staleNoteHtml));
    }
  }
  return { md: parts.join('\n\n'), report };
}

// A fresh translation file: English text with every translatable heading
// stamped with its anchor and current hash, English-only chunks left out.
function template(lang) {
  const en = readEnglish();
  const out = [`<!-- (c) 2026 William Li -->`, `<!-- ${lang} translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->`];
  for (const c of en.slice(1)) {
    if (EN_ONLY.has(c.id)) continue;
    out.push(withAttrs(c, c.id, c.hash));
  }
  return out.join('\n\n') + '\n';
}

// I18N dictionary from i18n.jsx, by brace-depth matching — the same approach as
// scripts/sync-translations.mjs. Our own committed file, a static literal.
let i18nCache = null;
function loadI18N() {
  if (i18nCache) return i18nCache;
  const src = fs.readFileSync(I18N_SRC, 'utf8');
  const start = src.indexOf('export const I18N = {');
  if (start < 0) throw new Error('I18N dictionary not found in ' + I18N_SRC);
  const brace = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('Unmatched brace in the I18N dictionary');
  i18nCache = (new Function('return ' + src.slice(brace, end)))();
  return i18nCache;
}

// English UI string → the I18N keys that carry it (several keys may share one
// English value). Placeholder strings ({n}) are skipped: they never appear
// verbatim in prose.
let uiIndex = null;
function uiKeysFor(enText) {
  if (!uiIndex) {
    uiIndex = new Map();
    for (const [k, v] of Object.entries(loadI18N().en)) {
      if (typeof v !== 'string' || v.includes('{')) continue;
      const s = v.trim();
      if (!uiIndex.has(s)) uiIndex.set(s, []);
      uiIndex.get(s).push(k);
    }
  }
  return uiIndex.get(String(enText).trim()) || [];
}

module.exports = {
  REPO, MANUAL_EN, MANUAL_DIR, LOCALES, EN_ONLY, EN_ONLY_NOTE,
  pageFile, manualFile, slug, splitHeading, parseChunks, chunkHash,
  readEnglish, readTranslation, assemble, template, loadI18N, uiKeysFor,
};
