// (c) 2026 William Li
//
// Radiance HDR (.hdr / .pic, "RGBE") decoder — pure JS, no DOM, so it runs in Node tests.
//
// Why here and not in the iccimage WASM: the format is a text header plus a simple
// run-length scheme, and no browser decodes it. Keeping it in JS avoids a WASM rebuild
// (which must come from a published iccDEV SHA) for a codec that has nothing to do with
// IccProfLib. The output has the SAME SHAPE as iccimage's decodeImage() for OpenEXR —
// 3-channel float samples as little-endian Float32 bytes — so the HDR tab's pixel route
// treats the two identically.
//
// Format reference: Greg Ward, "Real Pixels" (Graphics Gems II) and Radiance's
// src/common/color.c (freadcolrs / colr_color) and header.c.
//
//   #?RADIANCE                 magic ("#?RGBE" from some writers)
//   FORMAT=32-bit_rle_rgbe     or 32-bit_rle_xyze (refused, see below)
//   EXPOSURE=…  PRIMARIES=…    optional; other lines ignored
//   (blank line)
//   -Y 512 +X 1024             resolution string: scanline axis first
//   scanlines…                 new-style RLE, old-style RLE, or flat 4-byte pixels
//
// A pixel is (R, G, B, E): value = (byte + 0.5) · 2^(E − 136), and E = 0 means black.

/** Largest image accepted: 3 × Float32 per pixel, so this bounds the samples at ~480 MB. */
export const MAX_RADIANCE_PIXELS = 40_000_000
/**
 * Most pixels one file byte may stand for. New-style RLE — what every current writer emits —
 * reaches ~16 pixels per byte on a flat scanline (8 bytes per 127-pixel run across the four
 * channels). Old-style repeat markers could legally describe a 40 MP image in ~75 KB, a
 * decompression bomb worth ~2 GB of buffers downstream, so the ratio is capped at 4× the best
 * new-style case.
 */
export const MAX_PIXELS_PER_BYTE = 64
/** The header is a few lines of text; anything longer is not a Radiance file. */
const MAX_HEADER_BYTES = 64 * 1024
/** Radiance's scanline encoder only uses new-style RLE for widths in this range. */
const RLE_MIN_WIDTH = 8
const RLE_MAX_WIDTH = 0x7fff

/** True when the bytes start with a Radiance magic line. Sniffed from the first bytes only. */
export function isRadianceHdr(bytes) {
  if (!bytes || bytes.length < 6) return false
  const s = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 11)))
  return s.startsWith('#?RADIANCE') || s.startsWith('#?RGBE')
}

/**
 * Decode a Radiance HDR file.
 * @param {Uint8Array} bytes whole file
 * @returns {{ok:true, width:number, height:number, channels:3, sampleFormat:'float',
 *   bitDepth:32, samples:Uint8Array, compression:string, exposure:number,
 *   chromaticities?:number[]}} samples are little-endian Float32 R,G,B, top row first
 */
export function decodeRadiance(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('Radiance HDR: expected a byte array')
  if (!isRadianceHdr(bytes)) throw new Error('Radiance HDR: missing the #?RADIANCE signature')

  // ── header: text lines up to the first empty line ───────────────────────────
  let pos = 0
  const readLine = () => {
    const start = pos
    while (pos < bytes.length && bytes[pos] !== 0x0a) {
      if (pos - start > MAX_HEADER_BYTES) throw new Error('Radiance HDR: header line too long')
      pos++
    }
    if (pos >= bytes.length) throw new Error('Radiance HDR: file ends inside the header')
    const line = String.fromCharCode(...bytes.subarray(start, Math.min(pos, start + 4096)))
    pos++                                   // past '\n'
    return line.replace(/\r$/, '')
  }

  let format = null
  let exposure = 1
  let primaries = null
  readLine()                                // magic, already checked
  for (;;) {
    if (pos > MAX_HEADER_BYTES) throw new Error('Radiance HDR: header too long')
    const line = readLine()
    if (line === '') break
    const m = /^\s*([A-Za-z]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue                        // comments ("# Made with …") and commands
    const key = m[1].toUpperCase()
    if (key === 'FORMAT') format = m[2].trim()
    else if (key === 'EXPOSURE') {
      // Cumulative by definition: every EXPOSURE line multiplies. Reported, not applied —
      // viewers show the stored values, which already include the adjustment.
      const e = Number(m[2])
      if (Number.isFinite(e) && e > 0) exposure *= e
    } else if (key === 'PRIMARIES') {
      const v = m[2].trim().split(/\s+/).map(Number)
      if (v.length === 8 && v.every(Number.isFinite)) primaries = v
    }
  }
  if (format && format !== '32-bit_rle_rgbe') {
    // XYZE stores CIE XYZ with an equal-energy white; rendering it needs a different
    // matrix than the RGB path, and no file in the wild we need uses it.
    throw new Error(`Radiance HDR: pixel format "${format}" is not supported (only 32-bit_rle_rgbe)`)
  }

  // ── resolution string ───────────────────────────────────────────────────────
  const res = /^([-+])([XY])\s+(\d+)\s+([-+])([XY])\s+(\d+)\s*$/.exec(readLine())
  if (!res || res[2] === res[5]) throw new Error('Radiance HDR: unreadable resolution line')
  const [, s1, a1, n1s, s2, , n2s] = res
  const n1 = Number(n1s), n2 = Number(n2s)   // scanline count, pixels per scanline
  if (!(n1 > 0) || !(n2 > 0)) throw new Error('Radiance HDR: zero-sized image')
  const yFirst = a1 === 'Y'
  const width = yFirst ? n2 : n1
  const height = yFirst ? n1 : n2
  if (width * height > MAX_RADIANCE_PIXELS) {
    throw new Error(`Radiance HDR: ${width}×${height} is larger than the ${MAX_RADIANCE_PIXELS / 1e6} MP limit`)
  }
  // Checked BEFORE the output buffer is allocated, so a header-only file cannot make the tab
  // allocate hundreds of MB just to report "truncated". Every scanline takes at least 4 bytes.
  const remaining = bytes.length - pos
  if (remaining < n1 * 4) throw new Error('Radiance HDR: file is truncated')
  if (width * height > remaining * MAX_PIXELS_PER_BYTE) {
    throw new Error(`Radiance HDR: ${width}×${height} from ${remaining} bytes of pixel data is more compression than a Radiance writer produces`)
  }

  // Where file position (scanline i, pixel j) lands in a top-row-first, left-to-right
  // buffer. Radiance's Y axis points UP, so "-Y" (decreasing Y) runs top to bottom.
  const sY = yFirst ? s1 : s2, sX = yFirst ? s2 : s1
  const dest = (i, j) => {
    const fy = yFirst ? i : j, fx = yFirst ? j : i
    const y = sY === '-' ? fy : height - 1 - fy
    const x = sX === '+' ? fx : width - 1 - fx
    return y * width + x
  }

  // ── scanlines ───────────────────────────────────────────────────────────────
  const out = new Float32Array(width * height * 3)
  const line = new Uint8Array(n2 * 4)       // one scanline of RGBE
  let sawRle = false, sawFlat = false
  const need = (k) => { if (pos + k > bytes.length) throw new Error('Radiance HDR: file is truncated') }

  // Old-style (flat, optionally with 1,1,1,n repeat markers). Resumes mid-scanline, since
  // the run from a previous scanline does not carry over in Radiance's reader either.
  const readFlat = (from) => {
    let j = from, shift = 0
    while (j < n2) {
      need(4)
      const r = bytes[pos], g = bytes[pos + 1], b = bytes[pos + 2], e = bytes[pos + 3]
      pos += 4
      if (r === 1 && g === 1 && b === 1) {
        if (j === 0) throw new Error('Radiance HDR: repeat marker with no pixel to repeat')
        // Consecutive markers are successive base-256 digits (Radiance oldreadcolrs), so the
        // 4th sits at shift 24. Checked BEFORE applying, and multiplied rather than shifted:
        // `e << 24` goes negative for e ≥ 128.
        if (shift > 24) throw new Error('Radiance HDR: repeat count too large')
        const count = e * 2 ** shift
        if (count > n2 - j) throw new Error('Radiance HDR: run overflows the scanline')
        for (let k = 0; k < count; k++, j++) line.copyWithin(j * 4, (j - 1) * 4, j * 4)
        shift += 8
      } else {
        line[j * 4] = r; line[j * 4 + 1] = g; line[j * 4 + 2] = b; line[j * 4 + 3] = e
        j++; shift = 0
      }
    }
  }

  for (let i = 0; i < n1; i++) {
    const rleWidth = n2 >= RLE_MIN_WIDTH && n2 <= RLE_MAX_WIDTH
    need(4)
    if (rleWidth && bytes[pos] === 2 && bytes[pos + 1] === 2 && (bytes[pos + 2] & 0x80) === 0) {
      // New-style: 2, 2, width (big-endian), then each of the 4 channels run-length coded.
      const w = (bytes[pos + 2] << 8) | bytes[pos + 3]
      if (w !== n2) throw new Error('Radiance HDR: scanline width does not match the header')
      pos += 4
      sawRle = true
      for (let c = 0; c < 4; c++) {
        let j = 0
        while (j < n2) {
          need(1)
          let count = bytes[pos++]
          if (count > 128) {
            count -= 128
            if (count > n2 - j) throw new Error('Radiance HDR: run overflows the scanline')
            need(1)
            const v = bytes[pos++]
            for (let k = 0; k < count; k++) line[(j++) * 4 + c] = v
          } else {
            if (count === 0 || count > n2 - j) throw new Error('Radiance HDR: bad literal count in scanline')
            need(count)
            for (let k = 0; k < count; k++) line[(j++) * 4 + c] = bytes[pos++]
          }
        }
      }
    } else {
      sawFlat = true
      readFlat(0)
    }

    // RGBE → float, into the oriented position.
    for (let j = 0; j < n2; j++) {
      const e = line[j * 4 + 3]
      const o = dest(i, j) * 3
      if (e === 0) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; continue }
      const f = 2 ** (e - 136)
      out[o] = (line[j * 4] + 0.5) * f
      out[o + 1] = (line[j * 4 + 1] + 0.5) * f
      out[o + 2] = (line[j * 4 + 2] + 0.5) * f
    }
  }

  const result = {
    ok: true, width, height, channels: 3, bitDepth: 32, sampleFormat: 'float',
    // Float32Array's own bytes are little-endian on every platform browsers run on.
    samples: new Uint8Array(out.buffer),
    // The same pixels as a float view — aligned and JS-owned — so callers need not copy them
    // out of `samples` (a 40 MP image is 480 MB per copy).
    rgb: out,
    compression: sawRle && sawFlat ? 'RLE + flat' : sawRle ? 'RLE' : 'none',
    exposure,
  }
  // A PRIMARIES line of zeros (Photoshop writes one) states nothing; the caller's
  // normalizeChromaticities() rejects it the same way and falls back to Rec. 709.
  if (primaries) result.chromaticities = primaries
  return result
}
