// (c) 2026 William Li
//
// Recognise a clause-8.10 HDR Profile from an already-validated profile JSON, and say
// what that means for the views that render it.
//
// WHY CLIENT-SIDE RATHER THAN FROM PAWG. The PAWG report answers this authoritatively
// (section H, item H1, via icGetHdrProfileInfo) — but it is a separate lazy-loaded WASM
// module fetched only when the Validation tab is opened. Compare and Link need the answer
// before that, from data they already hold. So this re-derives 8.10.1's membership test
// from the parsed header and tag list.
//
// THE DUPLICATION IS DELIBERATE AND BOUNDED: this decides only whether to EXPLAIN
// something in the UI. It never contradicts PAWG, because a disagreement can only make a
// caveat appear or not appear — never change a reported verdict. If that ever stops being
// true, this should be replaced by the real classifier rather than extended.
//
// 8.10.1 membership, all five required:
//   RGB data colour space; Display or Input class; version 4.5.0.0 or later;
//   a cicpTag whose TransferCharacteristics is 8 (Linear), 16 (PQ) or 18 (HLG);
//   and NO redTRCTag/greenTRCTag/blueTRCTag — their absence is the distinguishing mark.

const TRC_TAGS = ['rTRC', 'gTRC', 'bTRC']

/** ICC.1 permits only these three transfer characteristics in an HDR Profile. */
export const HDR_TRANSFERS = { 8: 'Linear', 16: 'PQ', 18: 'HLG' }

// 8.10.1's version condition is a BAND, not a floor: `version >= 4.5.0.0 AND < 5.0.0.0`
// in IccHdrProfile.cpp. An HDR Profile is an ICC.1 v4.5 profile; an iccMAX (v5) profile
// is not one however HDR its content is.
//
// This had no upper bound in its first version, which made the eight BT2100 fixtures —
// v5.10 iccMAX, RGB, Display, with a PQ/HLG cicpTag — look like members. The
// cross-check against PAWG caught all eight; nothing in the UI would have.
function isVersion45Band(v) {
  // The header renders as e.g. "4.50". The minor field is a single nibble shown as two
  // digits, so "4.50" means 4.5 — take the first digit, do not read it as fifty.
  const m = /^(\d+)\.(\d+)/.exec(String(v || ''))
  if (!m) return false
  const major = Number(m[1])
  const minor = Number(m[2][0])
  return major === 4 && minor >= 5
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
  const cls = header['Profile Class'] || ''
  const displayOrInput = /display|input/i.test(cls)
  const v45 = isVersion45Band(header['Version'])
  const hasCicp = tags.includes('cicp')
  const trcPresent = TRC_TAGS.some((t) => tags.includes(t))

  // Read the transfer characteristic from the cicp tag's bytes — the same four code
  // points CicpDetail shows. Without it we cannot tell an HDR Profile from an SDR one
  // that merely carries a cicpTag.
  let transferCode = null
  if (hasCicp && bytes) {
    const tag = (data.tags || []).find((t) => t.id === 'cicp')
    if (tag && tag.offset + 12 <= bytes.length) {
      const sig = String.fromCharCode(bytes[tag.offset], bytes[tag.offset + 1],
                                      bytes[tag.offset + 2], bytes[tag.offset + 3])
      if (sig === 'cicp') transferCode = bytes[tag.offset + 9]
    }
  }
  const transferIsHdr = transferCode !== null && transferCode in HDR_TRANSFERS

  if (!rgb) reasons.push('not an RGB profile')
  if (!displayOrInput) reasons.push('not a Display or Input class profile')
  if (!v45) reasons.push('profile version is outside the 4.5–4.x band (an iccMAX v5 profile is not an HDR Profile)')
  if (!hasCicp) reasons.push('no cicpTag')
  else if (!transferIsHdr) reasons.push('cicp transfer characteristic is not 8, 16 or 18')
  if (trcPresent) reasons.push('carries TRC tags, which clause 8.10.1 prohibits')

  const isHdr = rgb && displayOrInput && v45 && hasCicp && transferIsHdr && !trcPresent
  return {
    isHdr,
    transfer: transferIsHdr ? HDR_TRANSFERS[transferCode] : null,
    hasBakedLut: tags.includes('A2B0'),
    hasGainCurve: tags.includes('HAGC'),
    reasons,
  }
}

/**
 * What a gamut/colour view is ACTUALLY showing for an HDR profile, and why it is not the
 * HDR gamut.
 *
 * This is the substance of Phase 3. An HDR Profile has no TRC tags, so a CMM building a
 * transform from it must use the AToB0Tag — which clause 8.10.6 defines as the fallback
 * for consumers that implement no HDR processing, i.e. a BAKED SDR RENDERING. The mesh
 * therefore renders without error and looks entirely plausible, while describing the
 * SDR fallback rather than the profile's HDR behaviour.
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
