// (c) 2026 William Li
//
// Recognise a clause-8.7.1 HDR ColorSpace Profile from an already-validated profile
// JSON, and say what that means for the views that render it.
//
// WHY CLIENT-SIDE RATHER THAN FROM PAWG. The PAWG report answers this authoritatively
// (section H, item H1, via icGetHdrProfileInfo) — but it is a separate lazy-loaded WASM
// module fetched only when the Validation tab is opened. Compare and Link need the answer
// before that, from data they already hold. So this re-derives 8.7.1.1's membership test
// from the parsed header and tag list.
//
// THE DUPLICATION IS DELIBERATE AND BOUNDED: this decides only whether to EXPLAIN
// something in the UI. It never contradicts PAWG, because a disagreement can only make a
// caveat appear or not appear — never change a reported verdict. If that ever stops being
// true, this should be replaced by the real classifier rather than extended.
// scripts/check-hdr-profile-class.mjs runs both over the whole corpus and requires exact
// agreement, which is what keeps the duplicate honest.
//
// 8.7.1.1 membership, all five required — icGetHdrProfileInfo's own `bMembership`:
//   RGB data colour space; ColorSpace ('spac') class; profileVersionField below 5.0.0.0;
//   PCSXYZ; and a cicpTag whose TransferCharacteristics is 8 (Linear), 16 (PQ) or 18 (HLG).
//
// WHAT THE 23-09-2026 REVISION REMOVED FROM THIS TEST, and why none of it comes back:
//   - Input and Display class. The sub-class moved from the three-component matrix-based
//     Input/Display profile (8.3.3/8.4.3) to the ColorSpace profile (8.7). A Display
//     profile carrying cicpTag + HAGC is explicitly NOT a member — it stays hdr-content.
//   - The 4.5.0.0 floor, withdrawn by the amendment's 4.7 (no profileVersionField change).
//     The v5 CEILING is not the amendment's and stays: it keeps an ICC.1 clause off an
//     ICC.2 profile. Upstream calls that a ruling (icHdrIsVersion4), not a reading.
//   - The TRC-trio prohibition. A ColorSpace profile defines no redTRCTag/greenTRCTag/
//     blueTRCTag and no matrix column tag to begin with, so there is nothing to prohibit;
//     a profile carrying them anyway is a member that merely warns.
//   - ColourPrimaries. A value of 2 (Unspecified) does NOT cost membership: 8.7.1.1 calls
//     such a profile non-conforming — a broken member, not a non-member — so H1 stays OK
//     while H5 fails. isHdr must not test it. It IS reported, as primariesNeedExtension,
//     because it decides what the HDR tab can DO with the profile — see below.

const TRC_TAGS = ['rTRC', 'gTRC', 'bTRC']

/** ICC.1 permits only these three transfer characteristics in an HDR ColorSpace Profile. */
export const HDR_TRANSFERS = { 8: 'Linear', 16: 'PQ', 18: 'HLG' }

// H.273 ColourPrimaries 2, "Unspecified". In an HDR ColorSpace Profile, 8.7.1.1 then takes the
// primaries from the cicpType custom chromaticity extension of 10.3 — a ColorSpace profile has
// no matrix column tag to fall back on. That extension's wire format is in a document (CICP
// Unspecified Primaries v2) no build here has, so IccProfLib cannot resolve the primaries and
// the HDR path refuses. Mirrors icCicpPrimariesUnspecified.
const CICP_PRIMARIES_UNSPECIFIED = 2

// profileVersionField below 5.0.0.0 (icHdrIsVersion4). The header renders as e.g. "4.50",
// so only the major field is read — there is no minor condition left to misread.
function isVersion4(v) {
  const m = /^(\d+)\./.exec(String(v || ''))
  return !!m && Number(m[1]) < 5
}

/**
 * @param {object} data validated profile JSON (validateProfile output)
 * @param {Uint8Array} [bytes] the profile, so the cicp transfer can be read exactly
 * @returns {{isHdr:boolean, transfer:string|null, reasons:string[]}}
 */
export function classifyHdrProfile(data, bytes) {
  const header = data?.header || {}
  const tags = (data?.tags || []).map((t) => t.id)
  const reasons = []

  const rgb = /rgb/i.test(header['Data Color Space'] || '')
  // GetProfileClassSigName returns the bare spec word — "ColorSpace", not "ColorSpace Class".
  const colorSpaceClass = /^colorspace$/i.test((header['Profile Class'] || '').trim())
  // GetColorSpaceSigName returns "XYZData" for icSigXYZData.
  const pcsXyz = /^xyz/i.test((header['PCS Color Space'] || '').trim())
  const v4 = isVersion4(header['Version'])
  const hasCicp = tags.includes('cicp')
  // Not a membership condition any more — reported so the UI can say the profile warns.
  const trcPresent = TRC_TAGS.some((t) => tags.includes(t))

  // Read the transfer characteristic from the cicp tag's bytes — the same four code
  // points CicpDetail shows. Without it we cannot tell an HDR ColorSpace Profile from an
  // ordinary ColorSpace profile that merely carries a cicpTag.
  // cicpType layout: 'cicp' signature (0..3), reserved (4..7), then four uInt8 code points —
  // ColourPrimaries (8), TransferCharacteristics (9), MatrixCoefficients (10),
  // VideoFullRangeFlag (11).
  let transferCode = null, primariesCode = null
  if (hasCicp && bytes) {
    const tag = (data.tags || []).find((t) => t.id === 'cicp')
    if (tag && tag.offset + 12 <= bytes.length) {
      const sig = String.fromCharCode(bytes[tag.offset], bytes[tag.offset + 1],
                                      bytes[tag.offset + 2], bytes[tag.offset + 3])
      if (sig === 'cicp') {
        primariesCode = bytes[tag.offset + 8]
        transferCode = bytes[tag.offset + 9]
      }
    }
  }
  const transferIsHdr = transferCode !== null && transferCode in HDR_TRANSFERS

  if (!rgb) reasons.push('not an RGB profile')
  if (!colorSpaceClass) reasons.push('not a ColorSpace class profile')
  if (!v4) reasons.push('profile version is 5.0.0.0 or later (an ICC.2 profile is not an HDR ColorSpace Profile)')
  if (!pcsXyz) reasons.push('PCS is not PCSXYZ')
  if (!hasCicp) reasons.push('no cicpTag')
  else if (!transferIsHdr) reasons.push('cicp transfer characteristic is not 8, 16 or 18')

  const isHdr = rgb && colorSpaceClass && v4 && pcsXyz && hasCicp && transferIsHdr
  return {
    isHdr,
    transfer: transferIsHdr ? HDR_TRANSFERS[transferCode] : null,
    // A member whose HDR path is blocked on the 10.3 extension (PAWG H5 fails on exactly
    // these). Only the HDR path: the baked SDR fallback and Off still render it through the
    // AToB0Tag, so the HDR tab marks such a profile rather than hiding it.
    primariesNeedExtension: isHdr && primariesCode === CICP_PRIMARIES_UNSPECIFIED,
    hasBakedLut: tags.includes('A2B0'),
    hasGainCurve: tags.includes('HAGC'),
    hasTrcTags: trcPresent,
    reasons,
  }
}

/**
 * What a gamut/colour view is ACTUALLY showing for an HDR ColorSpace Profile, and why it
 * is not the HDR gamut.
 *
 * An HDR ColorSpace Profile conveys its transfer function and primaries only through the
 * cicpTag, so a CMM building a transform from it without HDR support uses the AToB0Tag —
 * which clause 8.7.1.5 requires to carry an HDR→SDR rendering (target headroom 1.0) for
 * exactly those consumers. The mesh therefore renders without error and looks entirely
 * plausible, while describing the SDR fallback rather than the profile's HDR behaviour.
 *
 * That is the failure mode this whole tranche keeps meeting: not an error, but a
 * confident wrong answer nothing downstream can detect. So the view says what it is.
 *
 * The deeper reason an HDR gamut cannot simply be plotted instead: ICC's v4 PCS is
 * bounded, and a 16-bit PCS encoding tops out around one stop of headroom — measured
 * upstream, recorded in hdr-phase1-status.md. There is no unbounded PCS to draw in.
 */
export function hdrViewCaveat(info) {
  if (!info?.isHdr) return null
  return {
    kind: 'hdr-baked-fallback',
    transfer: info.transfer,
    // Kept as data rather than a sentence so the UI can translate it.
    hasBakedLut: info.hasBakedLut,
  }
}
