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
  TIFF: 'tiff', PNG: 'png', JPEG: 'jpeg', EXR: 'exr', HDR: 'hdr', HEIC: 'heic', AVIF: 'avif', JXL: 'jxl',
}

// "#?RADIANCE" (Radiance itself) or "#?RGBE" (HDRShop and others) at the very start.
const RADIANCE_MAGICS = ['#?RADIANCE', '#?RGBE'].map((s) => Array.from(s, (ch) => ch.charCodeAt(0)))
const startsWith = (bytes, magic) => bytes.length >= magic.length && magic.every((v, i) => bytes[i] === v)

// JPEG XL: a bare codestream starts FF 0A; the ISOBMFF-style container starts with a 12-byte
// 'JXL ' signature box (ISO/IEC 18181-2).
const JXL_CODESTREAM = [0xff, 0x0a]
const JXL_CONTAINER = [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]

// ftyp brands that make an ISOBMFF file an IMAGE. MP4, QuickTime and Canon CR3 share the
// 'ftyp' box, so "any ftyp is HEIC" would route videos and raw files to the image paths.
// HEIF (ISO/IEC 23008-12) and MIAF brands, then AVIF's.
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'mif2', 'msf1', 'miaf', 'MiHE', 'MiHA', 'MiHB'])
const AVIF_BRANDS = new Set(['avif', 'avis', 'avio'])

// The major brand, then the compatible brands, as far as the ftyp box and the bytes we were
// given reach (callers sniff from a short head, so a long brand list may be cut off).
function ftypBrands(bytes) {
  const fourcc = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  const size = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]
  const end = Math.min(bytes.length, size >= 16 ? size : 16)
  const brands = [fourcc(8)]
  for (let o = 16; o + 4 <= end; o += 4) brands.push(fourcc(o))   // 12..15 is minor_version
  return brands
}

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
  if (startsWith(bytes, JXL_CONTAINER) || startsWith(bytes, JXL_CODESTREAM)) return ImageFormat.JXL
  // ISOBMFF: the first box is 'ftyp', so bytes 4..7 are its type. The BRANDS separate HEIC
  // from AVIF — for naming and for which decoder we would ask; the ICC extraction is the
  // same for both, because `colr` is defined for the whole ISO base media family — and
  // separate either from video and raw files, which are not images here at all.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 &&
      bytes[6] === 0x79 && bytes[7] === 0x70) {
    const [major, ...compatible] = ftypBrands(bytes)
    if (AVIF_BRANDS.has(major)) return ImageFormat.AVIF
    if (HEIF_BRANDS.has(major)) return ImageFormat.HEIC
    // A generic major brand (e.g. 'isom') can still declare an image brand as compatible.
    if (compatible.some((b) => AVIF_BRANDS.has(b))) return ImageFormat.AVIF
    if (compatible.some((b) => HEIF_BRANDS.has(b))) return ImageFormat.HEIC
    return null
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
    // JPEG XL can carry a profile, but compressed inside the codestream; saying "none" would
    // be a claim about the file that was never checked.
    if (format === ImageFormat.JXL) {
      return 'JPEG XL profile extraction is not supported yet — its ICC profile is compressed inside the codestream'
    }
    return 'image has no embedded ICC profile'
  }
  return 'not an ICC profile'
}
