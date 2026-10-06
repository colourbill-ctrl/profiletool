# HDR test corpus

**42 fixtures mirrored from iccDEV `Testing/HDR/` @ `b2188dbc6` (branch `hdr-profiles`),
plus 5 of our own (`Profiletool*`) = 47.** Refreshed 2026-09-26 at `7150a6e79`; re-pinned
2026-10-04 to `356fddd77` (a comment-only HDR change plus a 21-commit merge of iccDEV master),
where `Testing/HDR` and both manifests are unchanged and every binary regenerates identically;
then to `81d80b806` (same corpus), whose TEMPORARY CMM change makes an HDR request on a
ColourPrimaries 2 member fall back to its `AToB0Tag` instead of failing — asserted in
`scripts/check-hdr-apply.mjs`; then to `99e099935` (PAWG Q4 fixes and an iccDEV master merge
that removes a 256-byte text truncation in the XML converters), same corpus, every binary
regenerating identically; then to `b2188dbc6` (master merge with #2784: Q4/Q1/Q3 evaluate
DToBx-only profiles; stricter XML/JSON readers), again with every binary identical.

**The corpus models ColorSpace-class usage only.** ICC.1 clause 8.7.1 defines the HDR
sub-class on the **ColorSpace profile (8.7)**, and the owner has ruled there is *zero* need to
keep the earlier Input/Display-class shape (clause 8.10) working. So every positive is
`'spac'`, no fixture carries the matrix column tags a ColorSpace profile does not have, and no
fixture carries the deleted HDR Display metadata (`DERH`/`DRWL`/`DCV`). Nothing here exists to
keep the old format passing.

The only non-`'spac'` fixtures are negatives and the iccMAX set:

- **Two class negatives**, `HdrClassDisplayNegative` (`'mntr'`) and `HdrClassInputNegative`
  (`'scnr'`). A class negative is not compatibility — it is the test that Display and Input are
  *rejected*. Each is `HdrColorSpaceClass` with the class changed and nothing else.
- **The `BT2100*` iccMAX v5 set** (8 `'mntr'`, 2 `'link'`). Their "Display"/"Scene" names are
  BT.2100's display-referred / scene-referred terms, not the ICC class. They fail membership on
  version *and* class, so they are confounded; `HdrVersion5` is what isolates the version bound.

**Every membership condition has a negative that fails on it alone** — each is
`HdrColorSpaceClass` (the conforming base) with one attribute changed, so a classifier that
stopped testing any single condition fails exactly the row(s) below and nothing else:

| Condition (`icGetHdrProfileInfo` `bMembership`) | Isolating negative(s) |
|---|---|
| RGB data colour space (`bRgbColorSpace`) | `HdrNonRgbSpace` (`3CLR`) |
| ColorSpace class (`bRgbColorSpace`) | `HdrClassDisplayNegative` (`'mntr'`), `HdrClassInputNegative` (`'scnr'`) |
| version below 5.0.0.0 (`bVersion4`, an iccDEV ruling) | `HdrVersion5` |
| PCSXYZ (`bPcsXyz`) | `HdrPcsLab` |
| a cicpTag (`bHasCicp`) | `HdrNoCicpTag` |
| TransferCharacteristics in {8, 16, 18} (`bTransferIsHdr`) | `HdrTransferSdr` (1), `HdrInvalidTransfer` (13) |

Three fixtures are worth knowing because they were written as negatives under 8.10 and are
**members** now: `HdrColorSpaceClass` (the conforming base), `HdrVersion44` (8.7.1 has no
version floor) and `HdrTrcTagsPresent` (TRC tags do not cost membership; it is a member that
warns).

## How this directory relates to upstream

Upstream is **XML-only**: it stopped committing `.icc` files and builds them with
`Testing/HDR/mkprofiles.sh` / `.bat`, which is the single source of its build list. We cannot
run that here, so the `.icc` files in this directory are **generated from the committed XML
through our own iccxml WASM** (`xmlToIcc`). All 47 reproduce their manifest classification.

**What that agreement does and does not prove.** It is a **cross-build check, not an
independent one.** `xmlToIcc` links the same IccXML library that `mkprofiles.sh` drives as
`iccFromXml`, and the classification is read back through `icGetHdrProfileInfo()` — the very
function upstream's `iccdev.hdr-corpus-manifest` CTest asserts against, and the function the
manifest's own numbers came from. A bug in either the XML parse or the 8.7.1.1 classification
would reproduce identically on both sides and still read 47/47.

What it *does* establish is worth having and nothing upstream covers it: the **Emscripten
build** of IccProfLib + IccXML classifies all 47 fixtures identically to the native build.
That is a cross-toolchain, cross-ABI agreement — the shape that catches float-width,
struct-packing and endianness assumptions — and it confirms PAWG's three-way H1 mapping agrees
with the manifest on every row across a second ABI.

Genuine independence would need a classifier written from clause 8.7.1 by someone else, or a
corpus of third-party HDR profiles. Neither exists yet. Write "cross-build agreement", not
"independent confirmation".

`hdr-corpus-manifest.tsv` is copied **verbatim** from upstream so it can be re-copied on the
next refresh without a merge. It records each fixture's clause-8.7.1 **classification**, which
is deliberately a different axis from the validation verdict: failing 8.7.1.1's membership
conditions does not make a profile invalid, so the membership negatives all validate `valid`
and are indistinguishable there.

### Refreshing

The WASM must be rebuilt against the new iccDEV **first** — the regeneration links whatever is
in `frontend/public/wasm/`, so running it before the rebuild produces the corpus with the old
library, and every check afterwards compares old binaries against the new classifier.

```bash
# 1. copy the XML + manifest from a PINNED iccDEV worktree (never from a moving branch)
cp <pinned-iccdev>/Testing/HDR/*.xml <pinned-iccdev>/Testing/HDR/hdr-corpus-manifest.tsv test-corpus/hdr/
#    ...and delete by hand any fixture upstream deleted (its .xml AND .icc)

# 2. regenerate the binaries through our own iccxml WASM
node scripts/regen-hdr-corpus.mjs         # reports unchanged / kept / CHANGED / NEW / ORPHAN

# 3. verify
node scripts/check-hdr-corpus.mjs         # classification: 47 rows against the two manifests
node scripts/check-hdr-profile-class.mjs  # the JS classifier (lib/hdrProfile.js) vs PAWG H1
node scripts/check-hdr-headroom.mjs       # content headroom, recomputed from the XML
```

`regen-hdr-corpus.mjs` names every binary that changed rather than reporting a count, and lists
any `.icc` left without an `.xml` beside it (a fixture upstream deleted). **A `CHANGED` line is
worth reading**: after an iccDEV rebuild it means the library now writes that profile
differently.

**The ten `BT2100*` fixtures are kept, not rewritten, unless their content changes.** Their XML
carries `<CreationDateTime>now</CreationDateTime>`, so IccXML stamps the conversion time into the
header and the profile ID — an MD5 over the profile — changes with it: 19 bytes (the header's
date-time and all 16 ID bytes) differ on every run while nothing else does. The script compares
with exactly those two ranges masked and leaves such a binary untouched, so a refresh's diff
holds only real changes; `--force` writes them anyway. The other fixtures pin an explicit date
and regenerate byte-identically. So after a refresh, a checksum change
confined to `BT2100*` is expected; one anywhere else is real and worth reading.

The check maps the PAWG report back to a classification with no extra API — `AddHdrItems()`
returns early for class `none` so the report has no HDR section at all; `H1 == OK` means
`conforming`; `H1 == N/A` means `hdr-content`. It also lists any `.icc` present but *not* in
the manifest, so a fixture can never sit here silently unchecked.

Note its ceiling: **it can only ever be as right as `icGetHdrProfileInfo()`**, because that is
what it reads. It catches corpus drift and cross-build divergence; it cannot catch a
classifier that is wrong in the same way on both sides.

```bash
node scripts/check-hdr-headroom.mjs    # the axis that is NOT downstream of that classifier
```

`check-hdr-headroom.mjs` recomputes the manifest's **content_headroom** column **from the XML,
with no ICC code linked at all** — its only imports are `node:fs`, `node:path` and `node:url`.
Clause 8.7.1.4 is arithmetic over the `dictType` metadata entries, so the values can be derived
here: every rule divides a luminance (`CLL` max, else `MDCV` max, else the 1000 cd/m² default)
by the content reference white — the HAGC tag's `HDRReferenceWhite`, else `CRWL`, else the
203 cd/m² default, in that order (see the precedence section below for why HAGC comes first).
Headroom is a **ratio**, not log2 stops. All 47 values across the 47 rows agree.

It checks the content axis only. The display axis (clause 8.10.5: `derh`, `dcv-drwl`,
`dcv-crwl`) was deleted by the 23-09-2026 revision, and with it the manifest's
`display_headroom` and `headroom_source` columns. The script now **fails** on any fixture still
carrying a `DERH`, `DRWL` or `DCV` entry: nothing reads them any more, so a fixture copied from
a pre-retarget source would otherwise pass every other check silently. It also refuses a
seven-column (pre-retarget) manifest outright, rather than read `display_headroom` as
`content_headroom`.

It also runs an **entry-arity audit**. Every reader of these `dictType` entries reads them
*positionally*, so a key appearing with two different value shapes across the corpus is a
silent misparse waiting to happen — taking `[0]` from a ten-value `DCV` (chromaticities first,
luminance at index 8) yields **0.708 as a peak luminance** rather than failing. We shipped
exactly that twice, both times in a fixture whose display rule was `derh` and therefore
consulted no `DCV` at all. Auditing shapes across the whole corpus catches it *even when no
rule currently reads the entry*, which is the only way to catch it early: the bug is invisible
precisely while nothing exercises it. Upstream's 42 are consistent, and match the registry
shapes — both offenders were ours. The shapes, per the registry (every one leads with the
**maximum**, which is all anything here reads):

| Entry | Values |
|---|---|
| `CLL` | max, **average**, primaries (MaxCLL / MaxFALL) |
| `MDCV` | max, min, primaries |
| `CCV` | max, average, min, primaries — **four** values |
| `DCV` | max, min, primaries (HDR Display registration) |

An earlier version of this README called all of them "maxLum minLum n". That was wrong for
`CLL`, whose second field is an average, and would have been wrong for `CCV`; iccDEV corrected
their own shorthand against the registry pages. The audit checks each key against these
registry shapes, not only for consistency — a corpus can be uniformly wrong.

**A maximum of `0.0` means "unknown"**, per the `CLL`, `MDCV` and `CCV` registry entries and the
`DCV` registration. It supplies no peak, so resolution falls through to the next rule; the
checker reports such a row UNCHECKED rather than computing `0 / white`. iccDEV previously
treated `0.0` as a real peak (giving a content headroom of 0, which also disabled the
target-volume clamp); fixed in `88672a2e`.

Its own limit, stated so it is not overread: it verifies the manifest's **numbers** given the
rule its `source` column names; it does not independently decide **which** rule applies. So it
catches a wrong value or a fixture whose metadata drifted — not a wrong rule selection, which
would need the unpublished clause text.

## Why the corpus was replaced wholesale (2026-09-13, historical)

The 19 fixtures previously mirrored here were copied before upstream rewrote this directory
for the **29-08-2026** revision of clause 8.7.1 (since superseded by **2026-09-06**, which
renumbers the clause-8.7.1.2 NOTEs — H8's detail now cites NOTE 13 where it cited NOTE 12).

The consequential change: 8.7.1.1 states that `redTRCTag`/`greenTRCTag`/`blueTRCTag`
**shall not be present** in an HDR ColorSpace Profile, and 8.7.1.5 requires an `AToB0Tag` in every RGB
HDR ColorSpace Profile with 8.7.1.3 c) requiring it paired with a `BToA0Tag`. Every old fixture carried
the TRC trio and no LUT pair, so **all 19 classified as non-members** — which meant PAWG
emitted H1 as N/A and suppressed H2..H8, and nothing in the corpus could exercise the HDR
section past its first item. Three of the old binaries had also drifted far enough that their
HAGC metadata no longer decoded at all.

## Classification breakdown

Generated from `hdr-corpus-manifest.tsv` + `profiletool-fixtures.tsv`, which are the
authoritative record. 29 + 16 + 2 = 47 fixtures.

**29 `conforming`** — members of the clause-8.7.1 HDR ColorSpace Profile sub-class.

| Fixture | Purpose |
|---|---|
| `HagcColorSpace` | HAGC full layout; PQ |
| `HagcCommonParams` | HAGC common-parameter sharing flags; HLG. Also pins HDR-22: a HAGC tag on 'spac' draws no tag-exclusion warning |
| `HagcHexData` | HAGC raw-byte authoring path; Linear, so 8.7.1.4 rule c) also fires |
| `HagcInvalidXOrder` | NEGATIVE: control-point X values decrease, or repeat with a differing Y |
| `HagcMixingTypes` | HAGC component mixing types 1 and 3 |
| `HagcRefWhiteToneMap` | ST 2094-50 C.3.8 reference-white tone map |
| `HdrBakedLut` | baked AToB0/BToA0 pair; makes 8.7.1.3's precedence observable |
| `HdrCicpUnspecified` | ColourPrimaries 2. MEMBER but NON-CONFORMING: 8.7.1.1 requires the cicpType custom chromaticity extension of 10.3, which this build cannot read, so it validates NonCompliant and will not render. Membership is unaffected - the amendment calls such a profile non-conforming, not a non-member |
| `HdrColorSpaceClass` | THE CLASS POSITIVE, and the base fixture. Was the 8.10.1 class NEGATIVE before the 23-09-2026 revision moved the sub-class onto the ColorSpace profile; the file is unchanged in intent and inverted in verdict, which is exactly the discriminator the revision needs |
| `HdrFullRangeFlag` | IMPL-02 pair, full-range half; control for the narrow half |
| `HdrHlgBt2020Primaries` | IMPL-04 control: HLG at ColourPrimaries 9, whose Y row IS the old constants |
| `HdrHlgBt709Primaries` | IMPL-04: the first HLG fixture not in BT.2020 primaries |
| `HdrLinearCll` | 8.7.1.4 rule a): CLL / CRWL |
| `HdrLinearHagcCrwlDisagree` | HDR-10 precedence: HAGC white 300 and CRWL 203 disagree, and the content axis divides by the HAGC value (CRWL first would give 2,956) |
| `HdrLinearHagcWhite` | HDR-10: the HAGC tag's reference white governs, over 8.7.1.4's 203 default (no CRWL entry here) |
| `HdrLinearMdcv` | 8.7.1.4 rule b): MDCV / CRWL |
| `HdrLinearNoMetadata` | 8.7.1.4 rule c): the 1000 cd/m2 default |
| `HdrMissingBToA0` | NEGATIVE: no BToA0Tag. The requirement MOVED - 8.7.1.5 defers it to 8.7, so CheckRequiredTags() now raises a CRITICAL error where CheckHdrProfile() used to raise NonCompliant. Membership is unaffected |
| `HdrMissingBToA1` | NEGATIVE: 8.7.1.5 pairing at x=1, which x=0 cannot reach, and which the revision no longer scopes to the Display class |
| `HdrMissingLutPair` | NEGATIVE: both halves of the x=0 pair absent; CRITICAL from 8.7, as for HdrMissingBToA0 |
| `HdrNarrowRangeFlag` | IMPL-02: VideoFullRangeFlag 0; warns that this build does not expand it |
| `HdrTrcTagsPresent` | INVERTED BY THE REVISION: TRC tags cost membership under 8.10.1 and do not under 8.7.1, which prohibits nothing because 8.7 defines nothing to prohibit. Still draws a tag-exclusion WARNING - a TRC tag has no interpretation on 'spac' - which is the point: not a member-or-not question |
| `HdrVersion44` | INVERTED BY THE REVISION: 4.4 was below the old 4.5.0.0 window and there is no lower bound now (4.7). The cicpTag's own >= 4.4 tag-type gate is what still applies |
| `HdrVersion46` | 4.6; with HdrVersion44 it brackets the withdrawn lower bound from both sides |
| `ProfiletoolHagcBaked` | HAGC BAKED FALLBACK: ProfiletoolHagcFamily with its identity AToB0/BToA0 replaced by iccHdrFallback's White Paper #62 bake (iccDEV 649fc750, 33^3 CLUT, headroom 1.0); every other tag copied, so classification, headroom and the gain curve are the family's. The only corpus profile whose baked-LUT policy and pre-amendment path render a real SDR image rather than PQ code values; scripts/check-hagc-baked.mjs pins grey agreement with the gain curve at headroom 1.0 and the per-channel clip of saturated highlights. PQ, so 8.7.1.4 does not resolve a content headroom |
| `ProfiletoolHagcClamp` | HAGC CLAMP: Headroom Adaptive Tone Map flag SET with ZERO alternate images - proposal 1.2.2.6 no tone mapping, baseline clamped to the target colour volume (CIccHagcEvaluator ClampsToTargetVolume). The flag-set twin of HagcHexData, whose flag is clear so the evaluator declines before reading the count. HAGC reference white 203 = CRWL. PQ, so 8.7.1.4 does not resolve a content headroom |
| `ProfiletoolHagcFamily` | HAGC FAMILY: four alternates (the encoding maximum) across 0-6 stops on both sides of a 3-stop baseline (0, 1.5 compress; 4.5, 6 expand), one mixing type, PCHIP slopes. Pins headroom blending and drives the HAGC evaluated view's heatmap, curve family and preview strip. HAGC reference white 203 = CRWL. PQ, so 8.7.1.4 does not resolve a content headroom |
| `ProfiletoolHdrColorSpace` | Happy path: conforming HDR ColorSpace Profile, H1..H7 all OK; CRWL agrees with the HAGC reference white so H7 reaches its AGREE branch. PQ, so 8.7.1.4 does not resolve a content headroom |
| `ProfiletoolHdrRefWhiteConflict` | 8.7.1.4 resolution: HAGC reference white 300 vs CRWL 203, so the two 8.7.1.4 carriers DISAGREE. Linear, so the division actually happens: HAGC-first gives 600/300=2, CRWL-first would give 600/203=2.9557. The only fixture in either corpus that distinguishes the two orders, and the only one reaching H7's DISAGREE branch |

**16 `hdr-content`** — carry HDR content but are **not** members. Missing a membership
condition is *not* a defect: 8.7.1.1's conditions are definitional, so these are valid profiles
and neither `Validate()` nor the PAWG report may report anything against them.

| Fixture | Purpose |
|---|---|
| `BT2100HlgFullDisplay` | v5 BT.2100 HLG display; a v5 profile is outside an ICC.1 clause (icHdrIsVersion4) and 'mntr' is not the ColorSpace class |
| `BT2100HlgFullScene` | v5 BT.2100 HLG scene; outside on both counts, as above |
| `BT2100HlgNarrowDisplay` | v5 narrow-range HLG display; range expansion is an explicit MPE curve |
| `BT2100HlgNarrowScene` | v5 narrow-range HLG scene; range expansion is an explicit MPE curve |
| `BT2100PQFullDisplay` | v5 BT.2100 PQ display; outside the version bound and the class |
| `BT2100PQFullScene` | v5 BT.2100 PQ scene; outside the version bound and the class |
| `BT2100PQNarrowDisplay` | v5 narrow-range PQ display; range expansion is an explicit MPE curve |
| `BT2100PQNarrowScene` | v5 narrow-range PQ scene; range expansion is an explicit MPE curve |
| `HdrClassDisplayNegative` | CLASS NEGATIVE: 'mntr', a single-attribute delta of HdrColorSpaceClass. Replaces HdrDisplayMetadata, which modelled the retired Display-class format; the class test itself is not compatibility, it is the proof that Display is rejected |
| `HdrClassInputNegative` | CLASS NEGATIVE: 'scnr', a single-attribute delta of HdrColorSpaceClass. The Input half of the pair, so a classifier testing only one of the two non-ColorSpace classes still fails a row |
| `HdrInvalidTransfer` | NEGATIVE: TransferCharacteristics outside {8, 16, 18}. De-confounded by the revision - it used to also carry TRC tags, which were a second disqualifier and are no longer one |
| `HdrNoCicpTag` | MEMBERSHIP NEGATIVE: no cicpTag; HDR Image metadata RETAINED so a metadata-keyed classifier fails |
| `HdrNonRgbSpace` | MEMBERSHIP NEGATIVE: data colour space 3CLR, not RGB |
| `HdrPcsLab` | PCS NEGATIVE, the only one that isolates bPcsXyz: HdrColorSpaceClass with PCS Lab. Without it the manifest could not fail a row on the one membership term that did not go away with the old parent |
| `HdrTransferSdr` | MEMBERSHIP NEGATIVE: TransferCharacteristics 1; no other disqualifier, so isolated |
| `HdrVersion5` | VERSION NEGATIVE, the only one that isolates the v5 ceiling: HdrColorSpaceClass at 5.0. The BT2100 set fails on class too, so dropping icHdrIsVersion4() left every other row passing. The ceiling is a ruling; see icHdrIsVersion4() |

**2 `none`** — not HDR-related at all as far as the classifier is concerned. These get **no
PAWG HDR section whatsoever**.

| Fixture | Purpose |
|---|---|
| `BT2100HlgSceneToDisplayLink` | v5 DeviceLink; no cicpTag and no HDR metadata, so not even HDR content |
| `BT2100PQSceneToDisplayLink` | v5 DeviceLink; no cicpTag and no HDR metadata |

### Two traps worth knowing

- **`HdrInvalidTransfer` is supposed to be VALID.** Its XML header says so outright: *"despite
  the file name nothing about this profile is invalid"*. It declares
  TransferCharacteristics 13 (sRGB), which 8.7.1.1 does not admit, so it is not a member — and
  that is the whole point of the fixture. (It gained an `AToB0Tag`/`BToA0Tag` pair in the
  8.7.1 retarget: without one, 8.7 would make it critically invalid for a reason that has
  nothing to do with its transfer characteristic.)
- **Names beginning `HdrMissing…` are not all invalid either.** `HdrMissingBToA0` is a
  `conforming` NEGATIVE — it is a member of the sub-class that breaches the `AToB0Tag`/
  `BToA0Tag` pairing rule, which is a different thing from failing to be a member. That rule
  is now clause **8.7**'s, owned by every ColorSpace profile, and it is raised *critically*.

## The reference-white precedence gap — found by an inverted rule passing

Worth reading before trusting any green run here.

Clause 8.7.1.4 states **no precedence** between the two carriers of the content HDR reference
white — the HAGC tag's `HDRReferenceWhite` and the `metadataTag` `CRWL` entry — and states its
203 cd/m² default twice with conditions that disagree exactly where a HAGC tag is present.
The resolution is **HAGC first, then CRWL, then 203**, and for the content axis that is what the
clause says rather than a house rule: 8.7.1.4's default paragraph fires only when there is **no
HAGC tag and no CRWL entry** — coherent only if the HAGC tag supplies the white when present —
and 8.7.1.4 a) then divides `CLL.max` by "the value derived above", i.e. by that derivation.
8.7.1.3 ranks the HAGC tag highest and has it applied as its own Annex 1 defines, which agrees,
but it is explicitly *informative* and ranks descriptors rather than metadata values, so it
supports the reading without carrying it.

This README previously called the ordering iccDEV's **ruling**. That was accurate when written:
iccDEV has since re-examined 8.7.1.3/8.7.1.4 and reclassified it, narrowing the open register item
to 8.10.5 c)'s wording alone.

`check-hdr-headroom.mjs` first shipped with that order **inverted** and scored a clean 84/84,
because **no fixture in upstream's 42 could tell the two apart** at the time: only `HagcDisplay` (now `HagcColorSpace`) and
`HdrLinearHagcWhite` carry a HAGC reference white, neither carries a `CRWL` entry, and our own
`ProfiletoolHdrColorSpace` carries both but sets them *equal*. iccDEV found it by noticing the two
implementations disagreed on precedence yet agreed on every value.

Two things came out of that:

- **`ProfiletoolHdrRefWhiteConflict`** now makes the orders disagree (HAGC 300 vs CRWL 203,
  CLL 600, Linear transfer so the division actually happens: 600/300 = 2 under the clause,
  600/203 = 2.9557 under the inverted rule). Re-introducing the original bug now fails on
  exactly that row. It is also the only fixture in either corpus that reaches PAWG **H7's
  DISAGREE branch**, and it gives HDR-10 its first executable case.
- **`check-hdr-headroom.mjs` reports coverage**, not just agreement — it names whether the
  precedence was exercised at all, so an untested axis can never again read as a tested one.

## The two headroom axes divided by different reference whites — FIXED upstream, then MOOT

> **HISTORICAL as of the 23-09-2026 revision.** The 8.10 &rarr; 8.7.1 retarget deleted clause
> 8.10.5 outright — physical display characterization is out of scope for an HDR ColorSpace
> Profile — so there is no display headroom axis left to cross, PAWG section H is now H1&ndash;H7
> with no H8, `ProfiletoolHdrCrossAxisWhite` was retired, and `scripts/check-hdr-headroom.mjs`
> lost its display half (the content half stays). Kept because it records how the divergence was found, and
> because the *content*-axis half of the question is still live: see the section above, which
> `ProfiletoolHdrRefWhiteConflict` still exercises.

Found while verifying the precedence fixture; pinned by `ProfiletoolHdrCrossAxisWhite`; fixed in
iccDEV `hdr-profiles` **`88672a2e`**. That fixture is now a regression guard.

When a profile carried both carriers of the content HDR reference white, the two headroom axes
divided by **different values of the same quantity**: 8.7.1.4's content headroom used the
HAGC-first white (300 here), while 8.10.5 c)'s display headroom used the `CRWL` entry alone (203),
because `CIccHdrMetadataReader::ResolveDisplayHeadroom()` had only a form that called
`GetResolvedContentReferenceWhite()` = `m_bHasCrwl ? m_crwl : 203`, and the metadata reader cannot
see the HAGC tag at all.

**PAWG's own report contradicted itself** on the fixture: H7 said "content HDR reference white =
300 cd/m²", and H8 said "... / content HDR reference white = 600 cd/m² / **203** cd/m² = 2.956".

The API shape was the clearest sign it was an oversight: `ResolveContentHeadroom()` already had a
two-argument form taking the white as a parameter; `ResolveDisplayHeadroom()` did not. The fix
mirrored it. Since `88672a2e` both axes divide by one resolved white, and H8 prints the divisor it
actually used: `600 cd/m² / 300 cd/m² = 2`.

**Correction to what we wrote here before.** This README previously called the divergence a
question for the maintainer "and possibly the WG", on the reasoning that 8.10.5 c) names the CRWL
*entry*. iccDEV withdrew that framing, and they were right to: the only genuine gap is which of
the two carriers governs when both are present, and 8.7.1.4 answers that for the content axis.
The divergence was that resolution reaching one axis and not the other — iccDEV's to fix, not
the WG's.

**What the fix does and does not settle.** 8.10.5 c) still literally names the *entry*: CRWL
"taken from the HDR Image metadata of 8.7.1.4", defaulting "when no CRWL entry is present" — a
condition that never mentions the HAGC tag. So dividing the display axis by the HAGC-first value
is a decision that one named quantity has one value, taken **against that clause's literal
words**, not a correction of an unambiguous error. `ProfiletoolHdrCrossAxisWhite` therefore pins
a *choice*; if 8.10.5 c)'s wording is ever aligned the other way, that fixture is what changes. iccDEV reports that re-checking their whole defect register against the documents
the amendment delegates to (the metadata registry, ICC.1, SMPTE ST 2094-50) found four items that
were the same mistake: calling something undefined because the amendment was silent when a
delegated document states it.

**How it is checked now.** `check-hdr-corpus.mjs` reads H7's resolved white and H8's rule-c divisor
out of the **real PAWG report** and fails if they differ — and names which rows reached rule c) at
all, so "no divergence" can never mean "not exercised". It was red-tested against the pre-fix
build (it flags `300` vs `203`) before being run green against the fix.

An earlier `check-hdr-headroom.mjs` reported this divergence from **XML shape alone** — it saw
both carriers and asserted what IccProfLib would do, without being able to observe it. After the
fix it would have kept reporting a bug that no longer existed. That check was removed: a file that
links no ICC code can only establish what the XML says, not what the library does.

## `Profiletool*` — ours, not upstream's

Authored here through the same `xmlToIcc` path. Their expectations live in
**`profiletool-fixtures.tsv`**, a separate file with the same columns, so
`hdr-corpus-manifest.tsv` stays a verbatim copy that can be re-copied on the next refresh
without a merge. Both check scripts read the two files together.

**`ProfiletoolHagcFamily`** (added 2026-09-14) exists to exercise what a
`headroomAdaptiveGainCurveTag` is *for*: a family of tone curves that a CMM blends between as the
display headroom changes. Every other HAGC fixture pins the tag's layout with one to three curves,
and only `HagcColorSpace` has an alternate above its baseline. This one carries **four alternates,
the most IccLibXML accepts** (a fifth is refused: "more alternate images than the maximum of 4"),
two on each side of a 3-stop baseline: 0 and 1.5 stops compress, 4.5 and 6 expand. It uses one
mixing type (2) with PCHIP slopes throughout, so the pictures read cleanly. Each compressing curve
ends exactly at its own display peak (1× and 2.828×), and grey output never decreases at any
headroom. `scripts/check-hagc-family.mjs` pins all of that through IccProfLib's evaluator: every
control point, the hold above the last point, blends lying between their neighbours, and gain
signs either side of the baseline. It also checks that iccconstruct's HDR CMM applies the same
grey outputs. It is the fixture the Tags view's preview strip, heatmap and curve family are built
around. Otherwise it is the `ProfiletoolHdrColorSpace` shell: conforming, PQ, HDR reference white
203 = CRWL, against a baseline headroom of 3.0.

**`ProfiletoolHagcClamp`** (added 2026-09-14) sets the Headroom Adaptive Tone Map flag and lists
**zero** alternate images. Proposal 1.2.2.6 gives that a defined meaning: no tone mapping, with the
baseline clamped to the target colour volume. No fixture reached that branch before.
`HagcHexData` also has zero alternates, but its flag is *clear*, so IccProfLib declines it first
(proposal 1.2.2.2: *"Headroom Adaptive Tone Map flag is not set"*). The two work as a pair.
`scripts/check-hagc-clamp.mjs` pins the division of labour:
- **Evaluator:** accepts the tag, reports `ClampsToTargetVolume`, builds no curves and applies no
  gain. The grey output is the identity at every headroom.
- **CMM:** does the clamp. Grey output is `min(input, target headroom)` relative to reference
  white, with no gain curve engaged. The baked-table policy takes the AToB0 path instead.

Otherwise the `ProfiletoolHdrColorSpace` shell: baseline 2 stops, reference white
203 = CRWL.

**`ProfiletoolHagcBaked`** (added 2026-09-14) is `ProfiletoolHagcFamily` with a **real SDR
fallback**. Every other HDR ColorSpace Profile here carries an identity `AToB0`/`BToA0` pair: valid, but it
passes raw PQ code values through, so the HDR tab's *Baked SDR fallback* policy, and any CMM that
does not implement clause 8.7.1, showed nothing meaningful. This pair was produced by iccDEV's own
baker, not by hand: `iccHdrFallback -grid 33` at hdr-profiles `649fc750` (a native build of the
pinned worktree), following ICC White Paper #62 at a target headroom of 1.0. The result went
through `iccToXml`; only the XML comment and the description were changed before the `.icc` was
regenerated with our iccxml WASM. The baked tables and the HAGC tag are byte-identical to the tool
output, and every other tag is the family's, so classification, headroom and the gain curve are
unchanged. The 33³ grid is the tool default. At 17³ the grey error against the gain curve reaches
11.5%; at 33³ it is 3.5%, though accuracy is not monotone in grid size.
`scripts/check-hagc-baked.mjs` pins:
- **Both builds agree:** the baked path matches native `iccApplyNamedCmm` (`-HDR 1 -HDRMAP lut`,
  and with no `-HDR` at all) in the WASM CMM.
- **Grey:** the baked `AToB0` follows the gain curve at headroom 1.0 to within a few percent, and
  the family's identity pair does not.
- **Saturated highlights:** these differ by design. The gain-curve path can leave a channel above
  1.0, which a `lutAToBType` table cannot, so the table clips each channel at the peak (green at
  1000 cd/m²: Y 0.92 on the curve, 0.67 baked).

`ProfiletoolHdrRefWhiteConflict` is described above. `ProfiletoolHdrColorSpace` is the happy path: It is a conforming HDR ColorSpace Profile (RGB, ColorSpace class, version 4.50,
cicp PQ, no TRC tags, A2B0/B2A0 pair) with `CRWL` set to agree with the HAGC tag's
`HDRReferenceWhite` so H7 reports a genuine agreement. It scores **H1..H8 all OK**.

It predates this refresh and was written to plug exactly the gap described above. Upstream's
refreshed corpus now covers that too, so it is no longer the only conforming fixture — it
remains the one we may freely mutate for new deformity cases, which nothing copied from
upstream should be.

## Assertions that are NOT safe

- **Do not assume "every H item OK on any conforming profile".** Section H is **H1&ndash;H7**
  since the 8.7.1 retarget (H8 went with clause 8.10.5), and individual items are still
  legitimately N/A per profile. Use `HdrColorSpaceClass` (or `ProfiletoolHdrColorSpace`) when an
  all-OK case is wanted.
- **Assert against the manifest, not against remembered verdicts.** Item verdicts legitimately
  change when the amendment revision moves — the 8.10 &rarr; 8.7.1 retarget alone inverted three
  fixtures' membership and removed an H item. The classification axis is the stable one.

## Checksums

```
e9e9f5acfbb3dc044da3de97388a53000f56a45e6d65a3f64976913a5a1a074d  BT2100HlgFullDisplay.icc
37a443e87d1b07091d8a87ef1320a2f51f84ef4f439d2017442cdcb47abae2ba  BT2100HlgFullScene.icc
ee4b80b5b9284f396bede2cd6a88eabcfb19053962a05fed0b47b0f5844ca6e1  BT2100HlgNarrowDisplay.icc
0209b6de3fede2237f600016693cc403370011181c4250553afadcd18ccc3767  BT2100HlgNarrowScene.icc
4bd5123dfbb91a09e3e9176d438152badc94380b73de72c8b0bd5c647dc2832c  BT2100HlgSceneToDisplayLink.icc
59be8e4297dbe083d2475ce6e25240319e2183dd215275b41e66634e18b34ff2  BT2100PQFullDisplay.icc
33f1eaf326ea944cff6801e0315bef712940f539dfca0b1b946759a3408c8cc2  BT2100PQFullScene.icc
d0e5d132c0d426fa55fe135322dd11331a37f3d16ce1081742e0d183fab8f871  BT2100PQNarrowDisplay.icc
3f96385785b19958e08cd12ecac5f4405b6ca766979e9cf4cd81b8680c6befb4  BT2100PQNarrowScene.icc
aec190cf8ecca10a9b67d8d85ea1d7715431db33b670b4fcaf050d66a89f10e8  BT2100PQSceneToDisplayLink.icc
9186e794774bf7b1417a21b215aa5ecb2eef3c39fd82fb63f2385e3548d40d28  HagcColorSpace.icc
cbb8b9a3f886f141d3a41729143a737e9b63a873db2cde97dd1ebbe22d9094f5  HagcCommonParams.icc
6e4afba46671a679af827805b29970107889a1879cccc106deaf7271af78c11f  HagcHexData.icc
4ba01f0b38bb6eebb7f026a46d5edecc93e3b211550b765c3d1c29be49e71b35  HagcInvalidXOrder.icc
9cc669cff6e8aa63b5ee43cbb92a7a55ebe697c6142fb6bdddb9510bdd6aa38c  HagcMixingTypes.icc
ffe205d0af0fea93aa642a7dcaad6a48ae0d1151cadbf1ada325ec19fd093c1a  HagcRefWhiteToneMap.icc
3f5bebf111aa8228495abca415028ba248e456f23eb5f19c266976c48c201956  HdrBakedLut.icc
3001733a507f7a4f19f59fca353713ca2ecbff06f5229597951d13c4ab72303f  HdrCicpUnspecified.icc
9a6129295ba2f76da91bb512e7b93c849dfaf4943e0d7aa3d044e16f66cead28  HdrClassDisplayNegative.icc
a2c842e48c8187fb79f274db541fbfcc40679e1bd356068798b3d36b123e6703  HdrClassInputNegative.icc
81429c19a79e5a90580e08eba14eccc0494b262ea19ed37c402e511b84eef86d  HdrColorSpaceClass.icc
ad119309c40dda869a35b60f4ec111de44143fc77423c6ee4fa3fbdd7e38ef3d  HdrFullRangeFlag.icc
9036fa5e325b5d08f294a130e1eb666b2d55b4bcd5e222e3a72b0877504a7975  HdrHlgBt2020Primaries.icc
34ed8869d0c6912c773a1e3e1c8e6e84037d70122dfc7be5da1ca856ec16a211  HdrHlgBt709Primaries.icc
441348e8b904763456bb63a9f3a24ef521df60a00a1811ae32d5a4b9c61e7a81  HdrInvalidTransfer.icc
cc4babee7e5737798503c1bfcc32e4b37fdbe767239af7f8517976484272a4d8  HdrLinearCll.icc
e1f85174b29d08c60c103d810dfd1be3620dd11bb2cc241ecdc9cd596b6a9510  HdrLinearHagcCrwlDisagree.icc
ea4d434f309cfca18e4c53da6c5d30e105055e32ed1bf7649c92b3b352046612  HdrLinearHagcWhite.icc
3a8ae658eef9d524dd7837b6ab40291d65f4555b57f80e076045ae7f31659ef8  HdrLinearMdcv.icc
bbe8f41a30d2b1d68028abfe890ba2669ea6319647698f187301c41f7316a480  HdrLinearNoMetadata.icc
1383d604fd5d9237fc6d4db9ee9404b6e0937273143c1f90418b2e51046edf6a  HdrMissingBToA0.icc
8f7f93d8e9d8e832d09f440bf61cb65c6ffc5d786ba0d2dc623fd59af01ec1b8  HdrMissingBToA1.icc
ce139071394d5c5be275e8430402a3c581a8175eeac0b632a75c431eff6fab5c  HdrMissingLutPair.icc
6db314ba51552652bc3f56052065972c881097002b4d597fa977019ec29812f6  HdrNarrowRangeFlag.icc
8d4b6d7c354ad1598db1987938ceb17e549ec084407c0f76478a091197f0e776  HdrNoCicpTag.icc
bac9416a52ca5ba487fa3a6db9eb2632b386ba8e997b69bc0cc9004b1eaed985  HdrNonRgbSpace.icc
8abb267285efdd996169d21ce13320c7cb01e8032a592d3fb55a10a5e3b620da  HdrPcsLab.icc
84f31c21b034559a7404186e08ee780e07017fbde6872abe505472816c514989  HdrTransferSdr.icc
e9e10107d4ae090e12b003974ad2c5563208bb6d7d50ecce5a9f1330a3c2e025  HdrTrcTagsPresent.icc
ec6fd475cfd4aed88f0a1f8aabe4d8489c4a6b0b9ace1e3ba33f27c956deae84  HdrVersion44.icc
fe46efabb4e7543107629ae476f1260b716b72da8802eece980124b528366a62  HdrVersion46.icc
b2fb2c9a482a8f9479c027505e6bc03313116e771ac1f9d8615fefe574f24584  HdrVersion5.icc
529b8237875aaff5806b1e0845b1e56dfec05c9af9438e125877af669866c966  ProfiletoolHagcBaked.icc
b277011b0085919b8a18ad9e7df83b9df78e6cd4900bdfb57ab99c571844ea76  ProfiletoolHagcClamp.icc
31dc3640e5692672d9fd70bfe1f18634583e9c5e4d78b581b2ddb31f586e0af6  ProfiletoolHagcFamily.icc
fcf4a20434c76249e4cbd2d8ee4e0c53200be49dfdc4928d0be8987da899e64f  ProfiletoolHdrColorSpace.icc
e201d9ac19a540df81e79d95bb73d051f9719ff0e6b4cd20213a41dcac5b3ec1  ProfiletoolHdrRefWhiteConflict.icc
```
