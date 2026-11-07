// (c) 2026 William Li
'use strict';
// scripts/generate-help.js
// Run with: node scripts/generate-help.js
//
// Builds the user guide in every interface language:
//   frontend/public/help.html          English, from MANUAL.md
//   frontend/public/help.<lang>.html   one per locale, from manual/MANUAL.<lang>.md
// The SVG layout diagrams are inlined under matching section anchors, with their
// interface labels taken from the app's own I18N dictionary.
//
// The chunk model (anchors, src hashes, English fallback for stale or English-only
// sections) lives in scripts/lib/manual-l10n.cjs; read its header first.
//
//   node scripts/generate-help.js                 build all twelve pages
//   node scripts/generate-help.js --template fr   write a fresh manual/MANUAL.fr.md to translate
//   node scripts/generate-help.js --hashes        print every translatable anchor + current hash
//
// Pattern mirrors chardata's scripts/generate-help.js — same SHARED_STYLE,
// same markdown subset, same diagram-injection hook. Keep the two in sync
// when extending one of them.

const fs   = require('fs');
const path = require('path');
const l10n = require('./lib/manual-l10n.cjs');
// HELP_OUT_DIR lets scripts/check-manual-l10n.mjs build into a scratch directory.
const OUT_DIR = process.env.HELP_OUT_DIR || path.join(__dirname, '../frontend/public');

// ── SVG primitives ────────────────────────────────────────────────────────────

// Every selector is scoped under `.diag` (the class on each diagram's <svg>).
// An SVG <style> inside an HTML document is NOT shadow-scoped — its rules apply
// document-wide — so a bare `text{…}` or `:root{--tx…}` here would leak onto the
// app's own SVG graphs (viz/GraphSvg.jsx) when the guide panel injects these
// diagrams into the live DOM. Scoping to `.diag` also confines the CSS variables
// to the diagram subtree.
//
// Theming: the SAME help.html serves two contexts, so the diagrams follow both.
//   • In profiletool (GuidePanel), the app owns the theme — it sets `body.dark`
//     for dark and `body.light` for light (see SettingsBlade::applyTheme). So
//     `body.dark .diag` drives dark, and `body:not(.light)` guards the OS media
//     query so an app set to *light* on a dark-OS machine stays light.
//   • Standalone help.html has no body theme class, so the media query falls
//     through to the OS preference (`body:not(.light)` always matches there).
const DIAG_DARK = `
    --bg:#1a1c1f; --pnl:#22262e; --pnl-bd:#3a4048; --hd:#252930; --hd-bd:#3a4048;
    --sec:#1e2128; --sec-bd:#333a44; --btn:#252930; --btn-bd:#444;
    --act:#2a5a90; --act2:#1f4070; --red:#8a2a2a; --amber:#7a5418; --green:#1f6a3a;
    --tx:#c8cdd4; --tx2:#9aa0a8; --tx3:#555e6a; --txW:#c8cdd4; --txA:#7ab8e8;
    --ln:#2e3440;`;
const SHARED_STYLE = `
<style>
.diag {
  --bg:#f0f2f5; --pnl:#fff; --pnl-bd:#ccd6e0; --hd:#e8edf2; --hd-bd:#c0ccd8;
  --sec:#f5f6f8; --sec-bd:#dde4ec; --btn:#e8edf2; --btn-bd:#bbb;
  --act:#4a90e2; --act2:#2a6ab5; --red:#e24a4a; --amber:#d49930; --green:#27ae60;
  --tx:#333; --tx2:#555; --tx3:#888; --txW:#fff; --txA:#1a5a8a;
  --ln:#dde4ec;
}
body.dark .diag {${DIAG_DARK}
}
@media(prefers-color-scheme:dark){
  body:not(.light) .diag {${DIAG_DARK}
  }
}
.diag rect.bg    { fill:var(--bg); }
.diag rect.pnl   { fill:var(--pnl);  stroke:var(--pnl-bd); stroke-width:1.5; }
.diag rect.hd    { fill:var(--hd);   stroke:var(--hd-bd);  stroke-width:1; }
.diag rect.sec   { fill:var(--sec);  stroke:var(--sec-bd); stroke-width:1; }
.diag rect.btn   { fill:var(--btn);  stroke:var(--btn-bd); stroke-width:1; }
.diag rect.act   { fill:var(--act);  stroke:var(--act2);   stroke-width:1; }
.diag rect.red   { fill:var(--red);  stroke:#a03030;       stroke-width:1; }
.diag rect.amber { fill:var(--amber);stroke:#a07418;       stroke-width:1; }
.diag rect.green { fill:var(--green);stroke:#1f7a44;       stroke-width:1; }
.diag rect.lnbd  { fill:none; stroke:var(--ln); stroke-width:1; }
.diag line.div   { stroke:var(--ln); stroke-width:1; }
.diag text       { font-family:Arial,sans-serif; font-size:11px; fill:var(--tx); }
.diag text.tT    { font-size:13px; font-weight:bold; fill:var(--txA); }
.diag text.tB    { font-weight:bold; }
.diag text.t2    { fill:var(--tx2); }
.diag text.t3    { fill:var(--tx3); font-size:10px; }
.diag text.tW    { fill:var(--txW); }
.diag text.tA    { fill:var(--txA); font-weight:bold; }
.diag text.mono  { font-family:ui-monospace,Menlo,Consolas,monospace; }
</style>`;

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="diag" viewBox="0 0 ${w} ${h}"
  style="width:100%;max-width:${w}px;display:block;margin:20px 0;border-radius:8px;overflow:visible;">
${SHARED_STYLE}
${body}
</svg>`;
}

const R = (x,y,w,h,cls,rx=5) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`;

// Diagram text. `maxW` (px) is the room the label has — a tab, a button, a select.
// Translations run longer than English (German by about 30%) and CJK glyphs are
// about twice as wide as Latin ones, so a label estimated wider than its room is
// squeezed to fit with textLength rather than spilling over its box.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Real advance widths (Liberation Sans, metric-compatible with Arial — the font
// the diagrams name) so an English label that fits is never squeezed. CJK and
// other full-width glyphs count 1 em; anything else unknown counts 0.6 em.
const WIDTHS = require('./lib/arial-widths.json');
function textWidth(s, cls) {
  const px = /\btT\b/.test(cls) ? 13 : /\bt3\b/.test(cls) ? 10 : 11;
  const tbl = /\b(tB|tT|tA)\b/.test(cls) ? WIDTHS.bold : WIDTHS.regular;
  let em = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    em += tbl[ch] ?? (cp >= 0x2e80 ? 1 : 0.6);
  }
  return em * px;
}
const T = (x,y,s,cls='',anchor='middle',maxW=0) => {
  const fit = maxW && textWidth(s, cls) > maxW
    ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}"${fit}>${esc(s)}</text>`;
};

// Translated diagram label. The diagrams draw the app's own interface, so a label
// that IS an interface string takes that string's translation from i18n.jsx — the
// manual can then never show a button the app calls something else. Other labels
// (captions, callouts) come from manual/strings.<lang>.json. Data in the mock-ups
// (file names, header values, signatures) is not passed through here: IccProfLib
// shows those in English in every language.
let LANG = 'en';
const missingLabels = new Map();   // lang → Set of English labels with no translation
function lbl(en) {
  if (LANG === 'en') return en;
  const I18N = l10n.loadI18N();
  for (const k of l10n.uiKeysFor(en)) {
    const v = I18N[LANG] && I18N[LANG][k];
    if (v) return v;
  }
  const v = pageStrings(LANG).diagram[en];
  if (v) return v;
  if (!missingLabels.has(LANG)) missingLabels.set(LANG, new Set());
  missingLabels.get(LANG).add(en);
  return en;
}

// manual/strings.<lang>.json: { page: {title, subtitle, stale}, diagram: {English: translation} }
const PAGE_EN = {
  title: 'ICC Profile Tool — Help',
  subtitle: 'Browser-based inspector, validator and round-trip editor for ICC.1 and ICC.2 (iccMAX) profiles',
  stale: '<strong>This section was updated recently.</strong> It is shown in English until its translation is updated.',
};
const stringsCache = new Map();
function pageStrings(lang) {
  if (lang === 'en') return { page: PAGE_EN, diagram: {} };
  if (!stringsCache.has(lang)) {
    const f = path.join(l10n.MANUAL_DIR, `strings.${lang}.json`);
    const j = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
    // Empty entries are untranslated: drop them so English shows and the check flags them.
    const filled = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'string' && v.trim()));
    stringsCache.set(lang, { page: { ...PAGE_EN, ...filled(j.page) }, diagram: filled(j.diagram) });
  }
  return stringsCache.get(lang);
}

const L = (x1,y1,x2,y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="div"/>`;

function callout(lx, ly, tx, ty, label, cls='t3') {
  return `<line x1="${lx}" y1="${ly}" x2="${tx}" y2="${ty}" stroke="var(--tx3)" stroke-width="1" stroke-dasharray="3,2"/>
${T(tx, ty - 3, label, cls, tx > lx ? 'start' : 'end')}`;
}

// ── Diagram 1: The workspace (pool + canvas tabs + Profile view) ─────────────
// Depicts the 2.x layout: a persistent Profiles pool down the left, the canvas
// with its four top-level tabs + accumulator chips, the Profile-tab bar (Save
// profile / Modified pill), and the per-profile viewer nested inside it.
function diag_layout() {
  const W = 780, H = 470;
  const PX = 10,  PW = 172;                 // Profiles pane
  const CX = 194, CW = 440;                 // canvas column
  const BB = W-14, BTX = W-52;              // blade bar / blade buttons

  let b = R(0,0,W,H,'bg',0);

  // ── Profiles pane ──
  b += R(PX,10,PW,H-20,'pnl',8);
  b += R(PX,10,PW,28,'hd',8);
  b += T(PX+12,29,lbl('Profiles'),'tB','start',48);
  b += R(PX+64,17,18,14,'act',7);  b += T(PX+73,28,'3','tW');
  b += T(PX+PW-44,29,'A–Z ↕','t3','start');
  b += T(PX+PW-10,29,'‹','t3','end');
  b += R(PX+12,46,110,20,'act',5); b += T(PX+67,60,lbl('Load Profiles'),'tW tB','middle',102);
  b += T(PX+12,84,'＋ '+lbl('New from .cube'),'tA','start',PW-24);
  b += T(PX+12,106,'▾ '+lbl('Output'),'t3 tB','start',PW-40);
  b += T(PX+PW-14,106,'2','t3','end');
  const prow = (y,name,badges) =>
    R(PX+10,y,PW-20,32,'sec',5)
    + T(PX+18,y+13,name,'t2 mono','start')
    + T(PX+18,y+26,badges,'t3','start')
    + T(PX+PW-18,y+16,'×','t3','end');
  b += prow(114,'Coated.icc','prtr · CMYK · v4.3');
  b += prow(152,'sRGB.icc','mntr · RGB · v4.2');
  b += T(PX+12,206,'▸ '+lbl('Display'),'t3 tB','start',PW-40);
  b += T(PX+PW-14,206,'1','t3','end');
  b += T(PX+12,232,lbl('drag a row onto a tab →'),'t3','start',PW-24);

  // ── canvas: title + tagline ──
  b += T(CX,30,lbl('ICC Profile Tool'),'tT','start',CW);
  b += T(CX,46,lbl('Based on iccDEV demo implementation'),'t3','start',CW);
  b += L(CX,54,CX+CW,54);

  // top-level tabs
  const tabs = [['Profile',true,1],['Compare',false,2],['Combine',false,0],['Spectral',false,0]];
  let tx = CX;
  for (const [label,active,n] of tabs) {
    const tw = 74;
    if (active) {
      b += `<line x1="${tx}" y1="78" x2="${tx+tw}" y2="78" stroke="var(--act)" stroke-width="3"/>`;
      b += T(tx+tw/2,72,lbl(label),'tA','middle',n ? tw-24 : tw-6);   // leave room for the count badge
    } else b += T(tx+tw/2,72,lbl(label),'t2','middle',n ? tw-24 : tw-6);
    if (n) { b += R(tx+tw-14,62,16,12,'act',6); b += T(tx+tw-6,72,String(n),'tW'); }
    tx += tw + 8;
  }
  b += L(CX,80,CX+CW,80);

  // accumulator chip strip
  b += R(CX,90,116,20,'lnbd',9);
  b += T(CX+10,104,'Coated.icc   ×','t3','start');

  // Profile-tab bar: filename · modified pill · Save profile
  b += T(CX,133,'Coated.icc','tB','start');
  b += R(CX+76,121,122,16,'amber',8);
  b += T(CX+137,133,'● '+lbl('Modified — unsaved'),'tW','middle',114);
  b += R(CX+CW-90,119,90,22,'act',5);
  b += T(CX+CW-45,134,lbl('Save profile'),'tW tB','middle',84);

  // ── per-profile viewer ──
  const VY = 150;
  b += R(CX,VY,CW,H-VY-14,'pnl',6);
  b += R(CX,VY,CW,26,'sec',6);
  b += T(CX+10,VY+17,'Coated.icc','tB mono','start');
  b += T(CX+86,VY+17,'· 1,838,244 bytes · IccProfLib 2.3.1','t3','start');
  b += R(CX+CW-52,VY+6,44,14,'green',3);
  b += T(CX+CW-30,VY+17,lbl('Pass'),'tW tB','middle',40);

  const TY = VY+26;
  const itabs = [['Header',58,true,0],['Tags',50,false,14],['Validation',72,false,0],
                 ['Analysis',66,false,0],['XML',38,false,0],['JSON',42,false,0]];
  let ix = CX+10;
  for (const [label,tw,active,badge] of itabs) {
    if (active) {
      b += `<line x1="${ix}" y1="${TY+26}" x2="${ix+tw}" y2="${TY+26}" stroke="var(--act)" stroke-width="3"/>`;
      b += T(ix+tw/2,TY+18,lbl(label),'tA','middle',badge ? tw-20 : tw-4);
    } else b += T(ix+tw/2,TY+18,lbl(label),'t2','middle',badge ? tw-20 : tw-4);
    if (badge) { b += R(ix+tw-12,TY+8,18,12,'act',6); b += T(ix+tw-3,TY+18,String(badge),'tW'); }
    ix += tw + 4;
  }
  b += L(CX+10,TY+28,CX+CW-10,TY+28);

  const PY = TY+40;
  b += R(CX+10,PY,CW-20,20,'sec',4);
  b += T(CX+18,PY+13,'PROFILE ID','t3 tB','start');
  b += T(CX+90,PY+13,'9efa8dc6c12f4e0b8b3a04e6c5a6e51c','tA mono','start');
  const rows = [
    ['Profile Class','Output Profile'], ['Data Color Space','CMYK'],
    ['PCS','Lab'], ['Profile Version','4.30.00'],
    ['Rendering Intent','Perceptual'], ['Creation Date','2025-08-14 10:24 UTC'],
  ];
  for (let i = 0; i < rows.length; i++) {
    const ry = PY + 26 + i*18;
    if (i % 2 === 0) b += R(CX+10, ry, CW-20, 18, 'sec', 0);
    b += T(CX+18, ry+12, rows[i][0], 't3', 'start');
    b += T(CX+150, ry+12, rows[i][1], 't2', 'start');
  }

  // ── settings blade (collapsed bar + tab column) ──
  b += R(BB,10,6,H-20,'pnl',0);
  b += R(BTX,30,38,32,'btn',5);  b += T(BTX+19,51,'⚙','t2 tB');
  b += R(BTX,68,38,32,'btn',5);  b += T(BTX+19,89,'?','t2 tB');
  b += R(BTX,106,38,32,'btn',5); b += T(BTX+19,127,'✉','t2');
  // Labels point LEFT into the gutter between the canvas card and the blade.
  b += callout(BTX+19,46,BTX-16,42,'⚙ '+lbl('Settings'),'t3');
  b += callout(BTX+19,84,BTX-16,80,'? '+lbl('Help'),'t3');
  b += callout(BTX+19,122,BTX-16,118,'✉ '+lbl('Contact'),'t3');

  return svg(W, H, b);
}

// ── Diagram 2: Settings panel (Display group) ────────────────────────────────
function diag_settings() {
  const W = 380;
  const PX = 50, PW = W - PX - 14;
  const VALW = 130;
  const VALX = PX + PW - VALW - 4;

  let content = '';
  let gy = 56;

  const row = (label, value) => {
    content += T(PX + 4, gy + 13, lbl(label), 't3 tB', 'start', VALX - PX - 10);
    content += R(VALX, gy, VALW, 22, 'btn', 4);
    content += T(VALX + 10, gy + 15, lbl(value), 't2', 'start', VALW - 26);
    content += T(VALX + VALW - 10, gy + 15, '▾', 't3', 'end');
    gy += 30;
  };
  const section = (label) => {
    content += T(PX + 4, gy + 13, lbl(label), 'tA tB', 'start', PW - 8);
    gy += 22;
  };

  section('Display');
  row('Background', 'System');
  row('Number format', 'Hexadecimal');
  row('Language', 'System default (English)');

  const H = gy + 18;

  let chrome = '';
  chrome += R(0, 0, W, H, 'bg', 0);
  chrome += R(8, 8, W - 16, H - 16, 'pnl', 8);

  // Tab column on the inner (left) edge
  chrome += R(8, 24, 38, 34, 'btn', 5);    chrome += T(27, 45, '⚙', 't2 tB');
  chrome += R(8, 64, 38, 34, 'btn', 5);    chrome += T(27, 85, '?', 't2 tB');
  chrome += R(8, 104, 38, 34, 'btn', 5);   chrome += T(27, 125, '✉', 't2');
  chrome += L(46, 8, 46, H - 8);

  // Heading
  chrome += T(PX + 4, 32, lbl('Settings'), 'tT', 'start', PW - 8);
  chrome += L(PX, 44, PX + PW, 44);

  return svg(W, H, chrome + content);
}

// ── Diagram 3: Combine tab (Link Pipeline) ───────────────────────────────────
function diag_combine() {
  const W = 780, H = 452;
  let b = R(0,0,W,H,'bg',0);

  // Pool pane (left)
  const PX = 16, PW = 150;
  b += R(PX,12,PW,H-24,'pnl',8);
  b += R(PX,12,PW,26,'hd',8);
  b += T(PX+12,29,lbl('Profiles'),'tB','start',PW-24);
  const chips = ['sRGB.icc','Coated.icc'];
  for (let i=0;i<chips.length;i++){
    const cy = 48 + i*34;
    b += R(PX+10, cy, PW-20, 28, 'sec', 5);
    b += T(PX+20, cy+18, chips[i], 't2 mono', 'start');
  }
  b += T(PX+10, 132, lbl('Drag into the chain →'), 't3', 'start', PW-20);

  // Combine card (centre/right)
  const CX = 186, CW = W-CX-16;
  b += R(CX,12,CW,H-24,'pnl',8);
  b += T(CX+16,32,lbl('Combine — Link Pipeline'),'tT','start',CW-32);
  b += T(CX+16,48,lbl('Chain profiles, then make a DeviceLink or transform an image / dataset.'),'t3','start',CW-32);
  b += L(CX+16,56,CX+CW-16,56);

  // Drop slots
  b += R(CX+16,64,270,32,'sec',6);
  b += T(CX+28,84,'🖼  '+lbl('Drop an image (TIFF/PNG/JPEG)'),'t2','start',248);
  b += R(CX+296,64,CW-312,32,'sec',6);
  b += T(CX+308,84,'🔢  '+lbl('Drop a dataset (CGATS/CSV/CxF)'),'t2','start',CW-336);

  // Global rendering intent
  b += T(CX+16,116,lbl('Rendering intent (all)'),'t3','start',130);
  b += R(CX+150,104,150,18,'btn',4);
  b += T(CX+156,116,lbl('Relative Colorimetric'),'t2','start',140);

  // Vertical chain — two stages with a connecting space between
  const stage = (y, num, name, from, to, ri) => {
    let s = R(CX+16, y, CW-32, 38, 'sec', 6);
    s += T(CX+30, y+23, '⠿', 't3', 'start');
    s += R(CX+44, y+11, 16, 16, 'act', 4);
    s += T(CX+52, y+23, num, 'tW tB');
    s += T(CX+70, y+23, name, 't2 mono', 'start');
    s += T(CX+CW-150, y+23, from+' → '+to, 't3', 'start');
    s += R(CX+CW-58, y+10, 42, 18, 'btn', 4);
    s += T(CX+CW-37, y+23, ri, 't2');
    return s;
  };
  b += stage(130,'1','sRGB.icc','RGB','Lab','Rel');
  // connector + connecting-space chip
  b += `<line x1="${CX+52}" y1="168" x2="${CX+52}" y2="180" stroke="var(--ln)" stroke-width="2"/>`;
  b += R(CX+CW/2-24,170,48,14,'lnbd',7);
  b += T(CX+CW/2,181,'Lab','t3');
  b += stage(184,'2','Coated.icc','Lab','CMYK','Perc');

  // Chain summary
  b += T(CX+16,244,lbl('Chain:'),'t3','start',40);
  b += T(CX+58,244,'RGB → CMYK','tA','start');

  // Action buttons
  const btn = (x,label) => R(x,256,124,24,'act',5) + T(x+62,272,lbl(label),'tW tB','middle',116);
  b += btn(CX+16,'Make DeviceLink');
  b += btn(CX+148,'Transform Image');
  b += btn(CX+280,'Transform Data');

  // Image output-options panel
  const OY = 296;
  b += R(CX+16, OY, CW-32, 96, 'sec', 6);
  b += T(CX+28, OY+18, lbl('Image output options'), 'tB', 'start', CW-56);
  const opt = (x,y,lab,val) => T(x,y,lbl(lab),'t3','start',104) + R(x, y+6, 96, 16, 'btn', 4) + T(x+48, y+18, val, 't2', 'middle', 90);
  b += opt(CX+28,  OY+34, 'Encoding',        lbl('Same as source'));
  b += opt(CX+140, OY+34, 'Compression',     lbl('None'));
  b += opt(CX+252, OY+34, 'Planar',          lbl('Composite'));
  b += opt(CX+28,  OY+70, 'CMM interp.',     lbl('Tetrahedral'));
  b += opt(CX+140, OY+70, 'Embed ICC',       '☑ '+lbl('yes'));

  // Callouts point LEFT (tx < lx) so callout()'s 'end' anchoring keeps the label inside
  // the canvas — a right-pointing label here would run past the 780px viewBox.
  b += callout(CX+CW-37, 138, CX+CW-120, 118, lbl('Per-stage intent'), 't3');
  // The output-options caption sits to the right of the three buttons, with its
  // leader dropping into the options panel. (It used to sit under the buttons and
  // overlap the third one, in English too.)
  b += `<line x1="${CX+CW-60}" y1="${276}" x2="${CX+CW-60}" y2="${OY+2}" stroke="var(--tx3)" stroke-width="1" stroke-dasharray="3,2"/>`;
  b += T(CX+CW-16, 272, lbl('iccApplyProfiles output knobs'), 't3', 'end', CW-436);

  return svg(W, H, b);
}

// ── Markdown → HTML (subset) ─────────────────────────────────────────────────
// Lifted from chardata/scripts/generate-help.js so output formatting matches.
// Headings carry explicit anchors (`## Title {#id}`) — see manual-l10n.cjs — so
// every locale's page has the English anchors; a heading without one falls back
// to the slug. ``` fences render as <pre><code> (they used to fall through as
// paragraphs).
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inTable = false, inList = false, inPara = false, inFence = false;

  const flush = () => {
    if (inTable) { out.push('</tbody></table>'); inTable = false; }
    if (inList)  { out.push('</ul>'); inList = false; }
    if (inPara)  { out.push('</p>'); inPara = false; }
  };

  const inline = s => s
    .replace(/\\\*/g, '\u0001').replace(/\\_/g, '\u0002')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\u0001/g, '*').replace(/\u0002/g, '_');

  const heading = (l) => {
    const h = l10n.splitHeading(l);
    const id = h.id || l10n.slug(h.text);
    return h.level === 1 ? `<h1>${inline(h.text)}</h1>`
      : `<h${h.level} id="${id}">${inline(h.text)}</h${h.level}>`;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush();
      if (!inFence) { out.push('<pre><code>'); inFence = true; }
      else { out.push('</code></pre>'); inFence = false; }
      continue;
    }
    if (inFence) { out.push(esc(l)); continue; }
    if (/^#{1,4}\s/.test(l))     { flush(); out.push(heading(l)); }
    else if (/^---$/.test(l))   { flush(); out.push('<hr>'); }
    else if (/^\|/.test(l)) {
      if (!inTable) {
        flush();
        out.push('<table><thead>');
        const hcells = l.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map(c=>`<th>${inline(c.trim())}</th>`);
        out.push('<tr>' + hcells.join('') + '</tr></thead><tbody>');
        i++; // skip separator row
        inTable = true;
      } else {
        const cells = l.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map(c=>`<td>${inline(c.trim())}</td>`);
        out.push('<tr>' + cells.join('') + '</tr>');
      }
    }
    else if (/^- /.test(l)) {
      if (!inList) { flush(); out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(l.replace(/^- /,''))}</li>`);
    }
    else if (/^\s*<\/?\w/.test(l)) {
      flush();
      out.push(l);
    }
    else if (/^\s*<!--.*-->\s*$/.test(l)) {
      flush();                                  // source comments never reach the page
    }
    else if (l.trim() === '') {
      flush();
    }
    else {
      if (!inPara) { out.push('<p>'); inPara = true; }
      else out.push(' ');
      out.push(inline(l));
    }
  }
  flush();
  return out.join('\n').replace(/<p>\n([^\n]*)\n<\/p>/g, '<p>$1</p>')
    .replace(/<pre><code>\n/g, '<pre><code>').replace(/\n<\/code><\/pre>/g, '</code></pre>');
}

// The table of contents, built from the manual's own Contents list (the region
// between the first two `---` lines) rather than hard-coded English. Top-level
// `N. [Title](#id)` items, nested `   - [Title](#id)` items.
function navHtml(contentsMd) {
  const head = contentsMd.split('\n').find((l) => /^##\s/.test(l));
  const label = head ? l10n.splitHeading(head).text : 'Contents';
  const items = [];
  for (const l of contentsMd.split('\n')) {
    let m;
    if ((m = /^\d+\.\s+\[([^\]]+)\]\((#[^)]+)\)/.exec(l))) items.push({ t: m[1], h: m[2], sub: [] });
    else if ((m = /^\s+-\s+\[([^\]]+)\]\((#[^)]+)\)/.exec(l)) && items.length) items[items.length - 1].sub.push({ t: m[1], h: m[2] });
  }
  const li = (it) => `<li><a href="${it.h}">${esc(it.t)}</a>` +
    (it.sub.length ? `\n        <ol>\n${it.sub.map((s) => `          <li><a href="${s.h}">${esc(s.t)}</a></li>`).join('\n')}\n        </ol>\n      ` : '') + '</li>';
  return `  <nav>\n    <strong>${esc(label)}</strong>\n    <ol>\n${items.map((it) => '      ' + li(it)).join('\n')}\n    </ol>\n  </nav>`;
}

function insertAfter(html, marker, injection) {
  const idx = html.indexOf(marker);
  if (idx === -1) return html;
  const end = html.indexOf('\n', idx) + 1;
  return html.slice(0, end) + injection + html.slice(end);
}

// ── Assemble one page ─────────────────────────────────────────────────────────
function build(lang) {
  LANG = lang;
  const strings = pageStrings(lang).page;
  const { md, report } = l10n.assemble(lang, strings.stale);

  // Strip the H1 title (replaced by hardcoded HTML below).
  const stripped = md.replace(/^[\s\S]*?^#\s[^\n]*\n+/m, (m) => m.replace(/^#\s[^\n]*\n+/m, ''));

  // Intro (before the first `---`), the Contents list (between the first two),
  // and the body (after the second). Same split as chardata's generator.
  const d1 = stripped.indexOf('\n---\n');
  const d2 = d1 === -1 ? -1 : stripped.indexOf('\n---\n', d1 + 5);
  const introMd    = d1 === -1 ? '' : stripped.slice(0, d1).trim();
  const contentsMd = d2 === -1 ? '' : stripped.slice(d1 + 5, d2);
  const bodyMd     = d2 === -1 ? stripped : stripped.slice(d2 + 5);

  const intro = mdToHtml(introMd);
  let body = mdToHtml(bodyMd);
  body = insertAfter(body, 'id="1-the-workspace"',     '\n' + diag_layout());
  body = insertAfter(body, 'id="2-settings-panel"',    '\n' + diag_settings());
  body = insertAfter(body, 'id="4-combine-tab"',       '\n' + diag_combine());

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(strings.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Noto Sans SC', 'Hiragino Sans', 'Microsoft YaHei', 'Apple SD Gothic Neo', sans-serif; background: #f0f2f5; color: #333; line-height: 1.6; }
    .page { max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; }
    h1 { font-size: 24px; color: #1a5a8a; margin-bottom: 6px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    h2 { font-size: 17px; color: #1a5a8a; margin: 36px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #d0e6f5; }
    h3 { font-size: 14px; font-weight: bold; color: #333; margin: 20px 0 6px; }
    h4 { font-size: 13px; font-weight: bold; color: #555; margin: 14px 0 4px; }
    p { font-size: 14px; margin-bottom: 10px; }
    ul, ol { font-size: 14px; margin: 8px 0 10px 24px; }
    li { margin-bottom: 4px; }
    code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: #e8edf2; padding: 1px 5px; border-radius: 3px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 13px; }
    th { background: #e8edf2; text-align: left; padding: 6px 10px; border: 1px solid #ccd6e0; font-weight: bold; color: #444; }
    td { padding: 5px 10px; border: 1px solid #dde4ec; vertical-align: top; }
    tr:nth-child(even) td { background: #f7f9fb; }
    .note { background: #fff8e6; border-left: 3px solid #f0b429; padding: 8px 12px; font-size: 13px; margin: 10px 0; border-radius: 0 4px 4px 0; }
    nav { background: #fff; border: 1px solid #dde; border-radius: 8px; padding: 16px 20px; margin-bottom: 32px; font-size: 13px; }
    nav ol { margin-left: 18px; }
    pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: #e8edf2; padding: 8px 12px; border-radius: 4px; margin: 8px 0 12px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    nav li { margin-bottom: 3px; }
    nav a { color: #1a5a8a; text-decoration: none; }
    nav a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid #dde; margin: 32px 0; }
    strong { color: #222; }
    section { margin-bottom: 8px; }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1c1f; color: #d0d4da; }
      h1 { color: #7ab8e8; }
      h2 { color: #7ab8e8; border-bottom-color: #2a4a60; }
      h3 { color: #c8cdd4; }
      h4 { color: #9aa0a8; }
      code { background: #2a2e35; color: #a8d4f0; }
      pre { background: #2a2e35; }
      table { color: #c8cdd4; }
      th { background: #252930; border-color: #3a4048; color: #9aa0a8; }
      td { border-color: #2e3440; }
      tr:nth-child(even) td { background: #1e2128; }
      .note { background: #2a2410; border-left-color: #c08820; color: #c8b880; }
      nav { background: #22262e; border-color: #333a44; }
      nav a { color: #7ab8e8; }
      hr { border-top-color: #2e3440; }
      strong { color: #e0e4ea; }
      .subtitle { color: #666e7a; }
    }
  </style>
</head>
<body>
<div class="page">

  <h1>${esc(strings.title)}</h1>
  <p class="subtitle">${esc(strings.subtitle)}</p>

${intro}

${navHtml(contentsMd)}

${body}

</div>
</body>
</html>`;
  const out = path.join(OUT_DIR, l10n.pageFile(lang));
  fs.writeFileSync(out, html, 'utf8');
  return { out, report };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv[0] === '--template') {
  const lang = argv[1];
  if (!l10n.LOCALES.includes(lang)) { console.error(`--template: unknown locale "${lang}" (${l10n.LOCALES.join(', ')})`); process.exit(2); }
  const f = l10n.manualFile(lang);
  if (fs.existsSync(f) && !argv.includes('--force')) { console.error(`${f} exists; pass --force to overwrite it`); process.exit(2); }
  fs.mkdirSync(l10n.MANUAL_DIR, { recursive: true });
  fs.writeFileSync(f, l10n.template(lang), 'utf8');
  console.log('Written template: ' + f);
  process.exit(0);
}
if (argv[0] === '--hashes') {
  for (const c of l10n.readEnglish().slice(1)) {
    console.log(`${c.hash}  ${l10n.EN_ONLY.has(c.id) ? '(English only) ' : ''}#${c.id}`);
  }
  process.exit(0);
}

for (const lang of ['en', ...l10n.LOCALES]) {
  const { out, report } = build(lang);
  const r = report;
  const note = lang === 'en' ? '' :
    `  translated ${r.translated}, stale ${r.stale.length}, missing ${r.missing.length}, English-only ${r.enOnly.length}` +
    (r.orphan.length ? `, ORPHAN ${r.orphan.join(' ')}` : '');
  console.log(`Written: ${path.relative(path.join(__dirname, '..'), out)}${note}`);
}
for (const [lang, set] of missingLabels) {
  console.log(`  diagram labels with no ${lang} translation (shown in English): ${[...set].join(' | ')}`);
}
