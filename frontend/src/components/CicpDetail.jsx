// (c) 2026 William Li
import { useT } from '../i18n.jsx'
import styles from './CicpDetail.module.css'

/**
 * Human-readable rendering of a cicpType tag (ICC.1 clause 10.4/10.5 — the tag
 * carries four ITU-T H.273 "code points" as bare uInt8 values).
 *
 * Presentation follows the physical-location rule: this renders IN PLACE on the
 * cicp tag row, above that tag's own Describe() dump. It maps numbers to names
 * and states nothing else — no verdict on whether a value is permitted in an
 * HDR Profile. That judgement is PAWG's (section H, items H1-H8) and reaches the
 * user there as a settled item, not as a second opinion attached to the tag.
 */

// ── ITU-T H.273 code-point names ────────────────────────────────────────────
// Names are technical identifiers from the ITU specification and stay in their
// source form for the same reason ICC tag names do — they are not UI chrome.
// Only values the spec actually assigns are listed; anything else falls through
// to `unnamed()` below, which is the honest answer for a reserved or unassigned
// point rather than inventing one.

// H.273 Table 2 — ColourPrimaries.
const PRIMARIES = {
  1:  'BT.709 / sRGB',
  2:  'Unspecified',
  4:  'BT.470 System M',
  5:  'BT.470 System B, G / BT.601 625',
  6:  'BT.601 525 / SMPTE 170M',
  7:  'SMPTE 240M',
  8:  'Generic film',
  9:  'BT.2020 / BT.2100',
  10: 'SMPTE ST 428-1 (CIE XYZ)',
  11: 'SMPTE RP 431-2 (DCI-P3)',
  12: 'SMPTE EG 432-1 (Display P3)',
  22: 'EBU Tech 3213-E',
}

// H.273 Table 3 — TransferCharacteristics.
const TRANSFER = {
  1:  'BT.709',
  2:  'Unspecified',
  4:  'Gamma 2.2 (BT.470 System M)',
  5:  'Gamma 2.8 (BT.470 System B, G)',
  6:  'BT.601',
  7:  'SMPTE 240M',
  8:  'Linear',
  9:  'Logarithmic (100:1)',
  10: 'Logarithmic (100·√10:1)',
  11: 'IEC 61966-2-4 (xvYCC)',
  12: 'BT.1361 extended gamut',
  13: 'sRGB / sYCC (IEC 61966-2-1)',
  14: 'BT.2020 (10-bit)',
  15: 'BT.2020 (12-bit)',
  16: 'SMPTE ST 2084 (PQ) / BT.2100 PQ',
  17: 'SMPTE ST 428-1',
  18: 'ARIB STD-B67 (HLG) / BT.2100 HLG',
}

// H.273 Table 4 — MatrixCoefficients.
const MATRIX = {
  0:  'Identity (GBR / sRGB / XYZ)',
  1:  'BT.709',
  2:  'Unspecified',
  4:  'US FCC 73.628',
  5:  'BT.470 System B, G / BT.601 625',
  6:  'BT.601 525 / SMPTE 170M',
  7:  'SMPTE 240M',
  8:  'YCgCo',
  9:  'BT.2020 non-constant luminance',
  10: 'BT.2020 constant luminance',
  11: 'SMPTE ST 2085',
  12: 'Chromaticity-derived non-constant luminance',
  13: 'Chromaticity-derived constant luminance',
  14: 'BT.2100 ICtCp',
}

// Values 0 and 3 are explicitly Reserved across all three tables; everything
// else unlisted is simply not assigned by the edition we are naming from. Say
// which of the two it is rather than printing a bare number.
const unnamed = (n) => (n === 0 || n === 3 ? 'Reserved' : null)

/**
 * cicpType is a fixed 12-byte tag: 4-byte type signature, 4 reserved bytes that
 * shall be zero, then the four code points as single bytes. Read straight from
 * the profile rather than scraped out of Describe() text, so the values shown
 * are the file's bytes and cannot drift with an upstream wording change.
 */
export function readCicp(bytes, offset, size) {
  if (!bytes || size < 12 || offset + 12 > bytes.length) return null
  const sig = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
  if (sig !== 'cicp') return null
  return {
    colourPrimaries:        bytes[offset + 8],
    transferCharacteristics: bytes[offset + 9],
    matrixCoefficients:     bytes[offset + 10],
    videoFullRangeFlag:     bytes[offset + 11],
    // The 4 reserved bytes shall be zero. Surface a non-zero value as data —
    // it is the kind of thing a profile author wants to see, and the tag row is
    // the only place it is visible at all.
    reservedNonZero: !!(bytes[offset + 4] | bytes[offset + 5] | bytes[offset + 6] | bytes[offset + 7]),
  }
}

export default function CicpDetail({ cicp }) {
  const t = useT()
  if (!cicp) return null

  const rows = [
    { label: t('cicp_primaries') || 'Colour primaries',
      value: cicp.colourPrimaries, name: PRIMARIES[cicp.colourPrimaries] || unnamed(cicp.colourPrimaries) },
    { label: t('cicp_transfer') || 'Transfer characteristics',
      value: cicp.transferCharacteristics, name: TRANSFER[cicp.transferCharacteristics] || unnamed(cicp.transferCharacteristics) },
    { label: t('cicp_matrix') || 'Matrix coefficients',
      value: cicp.matrixCoefficients, name: MATRIX[cicp.matrixCoefficients] || unnamed(cicp.matrixCoefficients) },
    { label: t('cicp_range') || 'Video full-range flag',
      value: cicp.videoFullRangeFlag,
      name: cicp.videoFullRangeFlag === 1 ? (t('cicp_range_full') || 'Full range')
          : cicp.videoFullRangeFlag === 0 ? (t('cicp_range_narrow') || 'Narrow range')
          : null },
  ]

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className={styles.key}>{r.label}</td>
              <td className={styles.num}>{r.value}</td>
              <td className={styles.name}>
                {r.name || <span className={styles.unnamed}>{t('cicp_unassigned') || 'not assigned by ITU-T H.273'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cicp.colourPrimaries === 2 && (
        <p className={styles.note}>
          {t('cicp_primaries_unspecified')
            || 'Colour primaries 2 (Unspecified) defers the primaries to the profile itself — they are taken from the colorant tags rather than from this tag.'}
        </p>
      )}
      {cicp.reservedNonZero && (
        <p className={styles.note}>
          {t('cicp_reserved_nonzero') || 'The four reserved bytes of this tag are not all zero.'}
        </p>
      )}
    </div>
  )
}
