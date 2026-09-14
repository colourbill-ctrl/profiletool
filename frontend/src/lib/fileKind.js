// (c) 2026 William Li
//
// Surface classification of a loaded file by content sniffing, so every load
// path (pool pane, canvas drop, launch protocols) can reject things that aren't
// what we accept BEFORE they land in the pool — and report them together.
//
// Design note: this is deliberately a *classifier that returns a kind*, not a
// bare "is-it-an-ICC" boolean. Today we accept ICC profiles only, but the pool
// will later accept image files (TIFF/PNG/JPEG) whose EMBEDDED profile we extract
// (the Add-from-image step). When that lands, `isImage()` starts returning true
// and the loader routes IMAGE kinds to extraction instead of rejecting them — no
// change to the accept/reject *plumbing*, only to what each kind does. Keep new
// magic-number sniffing here so there's one home for "what is this file?".

export const FileKind = {
  ICC: 'icc',
  IMAGE: 'image',     // reserved — routed to embedded-profile extraction later
  UNKNOWN: 'unknown',
}

// ICC/iccMAX profiles carry the ASCII signature 'acsp' at header offset 36
// (bytes 36..39). This is the cheapest reliable "is this even a profile?" check;
// full structural validation happens downstream in validateBytes().
function isIcc(bytes) {
  return bytes.length >= 40 &&
    bytes[36] === 0x61 /* a */ && bytes[37] === 0x63 /* c */ &&
    bytes[38] === 0x73 /* s */ && bytes[39] === 0x70 /* p */
}

// Image formats, identified individually rather than lumped together, because what we
// can DO with one now depends on which it is (see lib/capabilities.js):
//
//   tiff/png/jpeg  decoded by our own WASM — browser-independent
//   exr            likewise (tinyexr), and carries no ICC profile at all
//   hdr            Radiance RGBE, decoded in JS (lib/radianceHdr.js); no ICC profile either
//   heic/avif      ICC profile extracted by walking ISOBMFF boxes with NO codec, so
//                  inspection works everywhere; DISPLAY needs the browser's decoder,
//                  which for HEIC means Safari only
//
// Content sniffing only; the filename is never authoritative.
export const ImageFormat = {
  TIFF: 'tiff', PNG: 'png', JPEG: 'jpeg', EXR: 'exr', HDR: 'hdr', HEIC: 'heic', AVIF: 'avif',
}

// "#?RADIANCE" (Radiance itself) or "#?RGBE" (HDRShop and others) at the very start.
const RADIANCE_MAGICS = ['#?RADIANCE', '#?RGBE'].map((s) => Array.from(s, (ch) => ch.charCodeAt(0)))
const startsWith = (bytes, magic) => bytes.length >= magic.length && magic.every((v, i) => bytes[i] === v)

function imageFormat(bytes) {
  if (bytes.length < 4) return null
  const [b0, b1, b2, b3] = bytes
  if (b0 === 0x49 && b1 === 0x49 && b2 === 0x2a && b3 === 0x00) return ImageFormat.TIFF
  if (b0 === 0x4d && b1 === 0x4d && b2 === 0x00 && b3 === 0x2a) return ImageFormat.TIFF
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return ImageFormat.PNG
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return ImageFormat.JPEG
  // OpenEXR: 0x76 0x2f 0x31 0x01, little-endian.
  if (b0 === 0x76 && b1 === 0x2f && b2 === 0x31 && b3 === 0x01) return ImageFormat.EXR
  if (RADIANCE_MAGICS.some((m) => startsWith(bytes, m))) return ImageFormat.HDR
  // ISOBMFF: the first box is 'ftyp', so bytes 4..7 are its type. The BRAND that follows
  // separates HEIC from AVIF — but only for naming and for which decoder we would ask
  // for; the ICC extraction is identical for both, because `colr` is defined for the
  // whole ISO base media family rather than per brand.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 &&
      bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (/^avi[fs]$/.test(brand)) return ImageFormat.AVIF
    // heic, heix, heim, heis, hevc, mif1, msf1 … everything else in the family is
    // treated as HEIF-like. A container we cannot decode still inspects.
    return ImageFormat.HEIC
  }
  return null
}

// Classify by content. `filename` is accepted for future extension-based hints
// but content sniffing is authoritative.
export function classifyFile(bytes /*, filename */) {
  if (isIcc(bytes)) return { kind: FileKind.ICC }
  const format = imageFormat(bytes)
  if (format) return { kind: FileKind.IMAGE, format }
  return { kind: FileKind.UNKNOWN }
}

// Kinds the loader admits into the pool. IMAGE is accepted because the loader's
// IMAGE arm extracts the embedded profile (or reports "no embedded profile" if
// there isn't one) — see App.jsx::ingestOne.
export const ACCEPTED_KINDS = new Set([FileKind.ICC, FileKind.IMAGE])

// Human-readable rejection reason for a kind we can't turn into a pool entry.
export function rejectReason(kind, format) {
  if (kind === FileKind.IMAGE) {
    // EXR is the one format where "no embedded profile" is not a defect but the norm:
    // the format has no ICC slot at all, stating colour through a chromaticities
    // attribute instead. Saying "no embedded ICC profile" would read as a fault in the
    // file rather than a property of the format.
    if (format === ImageFormat.EXR) {
      return 'OpenEXR carries no ICC profile — it states colour through chromaticities'
    }
    // Radiance HDR likewise: its only colour statement is an optional PRIMARIES header line.
    if (format === ImageFormat.HDR) {
      return 'Radiance HDR carries no ICC profile — it states colour through its PRIMARIES header'
    }
    return 'image has no embedded ICC profile'
  }
  return 'not an ICC profile'
}
