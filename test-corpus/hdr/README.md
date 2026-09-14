# HDR test corpus

**43 fixtures mirrored from iccDEV `Testing/HDR/` @ `ac264764` (branch `hdr-profiles`),
plus 3 of our own (`Profiletool*`).** Refreshed 2026-09-13. The `BT2100*` binaries are kept
from the previous refresh: their XML carries no creation date, so regenerating them changes
only the header timestamp and profile ID.

## How this directory relates to upstream

Upstream is **XML-only**: it stopped committing `.icc` files and builds them with
`Testing/HDR/mkprofiles.sh` / `.bat`, which is the single source of its build list. We cannot
run that here, so the `.icc` files in this directory are **generated from the committed XML
through our own iccxml WASM** (`xmlToIcc`). All 43 reproduce their manifest classification.

**What that agreement does and does not prove.** It is a **cross-build check, not an
independent one.** `xmlToIcc` links the same IccXML library that `mkprofiles.sh` drives as
`iccFromXml`, and the classification is read back through `icGetHdrProfileInfo()` — the very
function upstream's `iccdev.hdr-corpus-manifest` CTest asserts against, and the function the
manifest's own numbers came from. A bug in either the XML parse or the 8.10.1 classification
would reproduce identically on both sides and still read 43/43.

What it *does* establish is worth having and nothing upstream covers it: the **Emscripten
build** of IccProfLib + IccXML classifies all 43 fixtures identically to the native build.
That is a cross-toolchain, cross-ABI agreement — the shape that catches float-width,
struct-packing and endianness assumptions — and it confirms PAWG's three-way H1 mapping agrees
with the manifest on every row across a second ABI.

Genuine independence would need a classifier written from clause 8.10 by someone else, or a
corpus of third-party HDR profiles. Neither exists yet. Write "cross-build agreement", not
"independent confirmation".

`hdr-corpus-manifest.tsv` is copied **verbatim** from upstream so it can be re-copied on the
next refresh without a merge. It records each fixture's clause-8.10 **classification**, which
is deliberately a different axis from the validation verdict: failing 8.10.1's membership
conditions does not make a profile invalid, so the membership negatives all validate `valid`
and are indistinguishable there.

### Refreshing

Regenerate the `.icc` files from a pinned iccDEV worktree, then verify:

```bash
node scripts/check-hdr-corpus.mjs      # asserts all 42 against the manifest
```

**Ten checksums will change on every refresh, and that is not drift.** The ten `BT2100*`
fixtures carry `<CreationDateTime>now</CreationDateTime>`, so IccXML stamps the conversion time
into the header and the profile ID — an MD5 over the profile — changes with it. Regenerating them
alters 19 bytes (the header's hh:mm:ss and all 16 ID bytes) and nothing else. The other 35
fixtures pin an explicit date and regenerate byte-identically. So after a refresh, a checksum change
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

`check-hdr-headroom.mjs` recomputes the manifest's four headroom columns **from the XML, with
no ICC code linked at all** — its only imports are `node:fs`, `node:path` and `node:url`.
Clause 8.10.4 and 8.10.5 are arithmetic over the `dictType` metadata entries, so the values
can be derived here: `derh` is taken directly, and every other rule divides a luminance by a
reference white (`CRWL`, else the HAGC tag's `HDRReferenceWhite`, else the 203 cd/m² default).
Headroom is a **ratio**, not log2 stops. All 84 values across the 42 rows agree.

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

## Why the corpus was replaced wholesale

The 19 fixtures previously mirrored here were copied before upstream rewrote this directory
for the **29-08-2026** revision of clause 8.10 (since superseded by **2026-09-06**, which
renumbers the clause-8.10.2 NOTEs — H8's detail now cites NOTE 13 where it cited NOTE 12).

The consequential change: 8.10.1 states that `redTRCTag`/`greenTRCTag`/`blueTRCTag`
**shall not be present** in an HDR Profile, and 8.10.6 requires an `AToB0Tag` in every RGB
HDR Profile with 8.10.3 c) requiring it paired with a `BToA0Tag`. Every old fixture carried
the TRC trio and no LUT pair, so **all 19 classified as non-members** — which meant PAWG
emitted H1 as N/A and suppressed H2..H8, and nothing in the corpus could exercise the HDR
section past its first item. Three of the old binaries had also drifted far enough that their
HAGC metadata no longer decoded at all.

## Classification breakdown

**25 `conforming`** — members of the clause-8.10 HDR Profile sub-class.

| Fixture | Purpose |
|---|---|
| `HagcCommonParams` | HAGC common-parameter sharing flags; HLG |
| `HagcDisplay` | HAGC full layout; PQ |
| `HagcHexData` | HAGC raw-byte authoring path; Linear, so 8.10.4 rule c) also fires |
| `HagcInvalidXOrder` | NEGATIVE: control-point X values not strictly increasing |
| `HagcMixingTypes` | HAGC component mixing types 1 and 3 |
| `HagcRefWhiteToneMap` | ST 2094-50 C.3.8 reference-white tone map |
| `HdrBakedLut` | baked AToB0/BToA0 pair; makes 8.10.3's precedence observable |
| `HdrCicp2NoColumns` | NEGATIVE: ColourPrimaries 2 without the matrix column tags |
| `HdrCicpUnspecified` | ColourPrimaries 2 WITH the columns; the positive of that pair |
| `HdrDisplayMetadata` | the conforming base fixture; 8.10.5 rule a), all three entries disagreeing |
| `HdrFullRangeFlag` | IMPL-02 pair, full-range half; control for the narrow half |
| `HdrHeadroomDcvCrwl` | 8.10.5 rule c): DCV / CRWL, CRWL deliberately 250 not 203 |
| `HdrHeadroomDcvDrwl` | 8.10.5 rule b): DCV / DRWL, chosen so rule c) would give a different number |
| `HdrHlgBt2020Primaries` | IMPL-04 control: HLG at ColourPrimaries 9, whose Y row IS the old constants |
| `HdrHlgBt709Primaries` | IMPL-04: the first HLG fixture not in BT.2020 primaries |
| `HdrInputDisplayMeta` | HDR Display metadata on an Input-class profile; draws an Information note |
| `HdrLinearCll` | 8.10.4 rule a): CLL / CRWL |
| `HdrLinearHagcWhite` | HDR-10: the HAGC tag's reference white governs, over 8.10.4's 203 default (no CRWL entry here) |
| `HdrLinearMdcv` | 8.10.4 rule b): MDCV / CRWL |
| `HdrLinearNoMetadata` | 8.10.4 rule c): the 1000 cd/m2 default |
| `HdrMissingBToA0` | NEGATIVE: 8.10.6 mandatory BToA0 absent |
| `HdrMissingBToA1` | NEGATIVE: 8.10.6 pairing at x=1, which x=0 cannot reach |
| `HdrMissingLutPair` | NEGATIVE: both halves of the x=0 pair absent |
| `HdrNarrowRangeFlag` | IMPL-02: VideoFullRangeFlag 0; warns that this build does not expand it |
| `HdrVersion46` | 8.10.1 POSITIVE: version 4.6; the only fixture separating >=4.5 from ==4.5 |

**15 `hdr-content`** — carry HDR content but are **not** members. Missing a membership
condition is *not* a defect: 8.10.1's conditions are definitional, so these are valid profiles
and neither `Validate()` nor the PAWG report may report anything against them.

| Fixture | Purpose |
|---|---|
| `BT2100HlgFullDisplay` | v5 BT.2100 HLG display; outside 8.10.1's version window |
| `BT2100HlgFullScene` | v5 BT.2100 HLG scene; outside the version window |
| `BT2100HlgNarrowDisplay` | v5 narrow-range HLG display; range expansion is an explicit MPE curve |
| `BT2100HlgNarrowScene` | v5 narrow-range HLG scene; range expansion is an explicit MPE curve |
| `BT2100PQFullDisplay` | v5 BT.2100 PQ display; outside the version window |
| `BT2100PQFullScene` | v5 BT.2100 PQ scene; outside the version window |
| `BT2100PQNarrowDisplay` | v5 narrow-range PQ display; range expansion is an explicit MPE curve |
| `BT2100PQNarrowScene` | v5 narrow-range PQ scene; range expansion is an explicit MPE curve |
| `HdrColorSpaceClass` | 8.10.1 MEMBERSHIP NEGATIVE: device class not Input/Display |
| `HdrInvalidTransfer` | NEGATIVE, CONFOUNDED: non-HDR transfer AND TRC tags; kept as-is, de-confounded by the two fixtures below |
| `HdrNoCicpTag` | 8.10.1 MEMBERSHIP NEGATIVE: no cicpTag; metadata RETAINED so a metadata-keyed classifier fails |
| `HdrNonRgbSpace` | 8.10.1 MEMBERSHIP NEGATIVE: data colour space 3CLR, not RGB |
| `HdrTransferSdr` | 8.10.1 MEMBERSHIP NEGATIVE: TransferCharacteristics 1; no TRC tags, so isolated |
| `HdrTrcTagsPresent` | 8.10.1 MEMBERSHIP NEGATIVE: TRC tags present; PQ retained, so isolated |
| `HdrVersion44` | 8.10.1 MEMBERSHIP NEGATIVE: version 4.4, below the window |

**2 `none`** — not HDR-related at all as far as the classifier is concerned. These get **no
PAWG HDR section whatsoever**.

| Fixture | Purpose |
|---|---|
| `BT2100HlgSceneToDisplayLink` | v5 DeviceLink; no cicpTag and no HDR metadata, so not even HDR content |
| `BT2100PQSceneToDisplayLink` | v5 DeviceLink; no cicpTag and no HDR metadata |

### Two traps worth knowing

- **`HdrInvalidTransfer` is supposed to be VALID.** Its XML header says so outright: *"despite
  the file name nothing about this profile is invalid"*. It declares
  TransferCharacteristics 13 (sRGB), which 8.10.1 does not admit, so it is not a member — and
  that is the whole point of the fixture.
- **Names beginning `HdrMissing…` are not all invalid either.** `HdrMissingBToA0` is a
  `conforming` NEGATIVE — it is a member of the sub-class that breaches 8.10.6, which is a
  different thing from failing to be a member.

## The reference-white precedence gap — found by an inverted rule passing

Worth reading before trusting any green run here.

Clause 8.10.4 states **no precedence** between the two carriers of the content HDR reference
white — the HAGC tag's `HDRReferenceWhite` and the `metadataTag` `CRWL` entry — and states its
203 cd/m² default twice with conditions that disagree exactly where a HAGC tag is present.
The resolution is **HAGC first, then CRWL, then 203**, and for the content axis that is what the
clause says rather than a house rule: 8.10.4's default paragraph fires only when there is **no
HAGC tag and no CRWL entry** — coherent only if the HAGC tag supplies the white when present —
and 8.10.4 a) then divides `CLL.max` by "the value derived above", i.e. by that derivation.
8.10.3 ranks the HAGC tag highest and has it applied as its own Annex 1 defines, which agrees,
but it is explicitly *informative* and ranks descriptors rather than metadata values, so it
supports the reading without carrying it.

This README previously called the ordering iccDEV's **ruling**. That was accurate when written:
iccDEV has since re-examined 8.10.3/8.10.4 and reclassified it, narrowing the open register item
to 8.10.5 c)'s wording alone.

`check-hdr-headroom.mjs` first shipped with that order **inverted** and scored a clean 84/84,
because **no fixture in upstream's 42 can tell the two apart**: only `HagcDisplay` and
`HdrLinearHagcWhite` carry a HAGC reference white, neither carries a `CRWL` entry, and our own
`ProfiletoolHdrDisplay` carries both but sets them *equal*. iccDEV found it by noticing the two
implementations disagreed on precedence yet agreed on every value.

Two things came out of that:

- **`ProfiletoolHdrRefWhiteConflict`** now makes the orders disagree (HAGC 300 vs CRWL 203,
  CLL 600, Linear transfer so the division actually happens: 600/300 = 2 under the clause,
  600/203 = 2.9557 under the inverted rule). Re-introducing the original bug now fails on
  exactly that row. It is also the only fixture in either corpus that reaches PAWG **H7's
  DISAGREE branch**, and it gives HDR-10 its first executable case.
- **`check-hdr-headroom.mjs` reports coverage**, not just agreement — it names whether the
  precedence was exercised at all, so an untested axis can never again read as a tested one.

## The two headroom axes divided by different reference whites — FIXED upstream

Found while verifying the precedence fixture; pinned by `ProfiletoolHdrCrossAxisWhite`; fixed in
iccDEV `hdr-profiles` **`88672a2e`**. That fixture is now a regression guard.

When a profile carried both carriers of the content HDR reference white, the two headroom axes
divided by **different values of the same quantity**: 8.10.4's content headroom used the
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
the two carriers governs when both are present, and 8.10.4 answers that for the content axis.
The divergence was that resolution reaching one axis and not the other — iccDEV's to fix, not
the WG's.

**What the fix does and does not settle.** 8.10.5 c) still literally names the *entry*: CRWL
"taken from the HDR Image metadata of 8.10.4", defaulting "when no CRWL entry is present" — a
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

`ProfiletoolHdrRefWhiteConflict` is described above. `ProfiletoolHdrDisplay` is the happy path: It is a conforming HDR Profile (RGB Display, version 4.50,
cicp PQ, no TRC tags, A2B0/B2A0 pair) with `CRWL` set to agree with the HAGC tag's
`HDRReferenceWhite` so H7 reports a genuine agreement. It scores **H1..H8 all OK**.

It predates this refresh and was written to plug exactly the gap described above. Upstream's
refreshed corpus now covers that too, so it is no longer the only conforming fixture — it
remains the one we may freely mutate for new deformity cases, which nothing copied from
upstream should be.

## Assertions that are NOT safe

- **"H1..H8 all OK on any conforming profile" is wrong.** `HagcDisplay` is conforming but
  reports **H8 = N/A**, correctly: it carries no 8.10.5 HDR Display entries, so rule d) applies
  and the headroom comes from the destination device. Use `HdrDisplayMetadata` (or
  `ProfiletoolHdrDisplay`) when an all-OK case is wanted.
- **Assert against the manifest, not against remembered verdicts.** Item verdicts legitimately
  change when the amendment revision moves — H6 gained a Display-class guard in iccDEV
  `7ea04aa3`, which flipped `HdrInputDisplayMeta` from FAIL to OK. The classification axis is
  the stable one.

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
667e9e958608863b6b217ff9551e753577b3eb29f12b434c1822c7b0f6a1286a  HagcCommonParams.icc
59adffe1669903700448cf9f4ac077cf28fcf71d33ccf2334a4aa98e739ec468  HagcDisplay.icc
6399c59ac2cb69fc78c5b95a01a779a2892dcdc2e2d0f79a8b8a2258fe1b92d9  HagcHexData.icc
b300c655c82b1b526e34596c22f9e0ecbbe09317a24b50aca0f621e9c7716365  HagcInvalidXOrder.icc
e99d07cb86a8d9b15f701ee5ab5e89c641489d2bbbbfea82fdfe88eb12274ea6  HagcMixingTypes.icc
29e5f24f25a7f34515a4e1d1dc77800edb462ad1fb67a9a54dd6565b21971f71  HagcRefWhiteToneMap.icc
de41cea9a160ba52b2f27a4afadc2465029cc04712f260b72954662cf49a6110  HdrBakedLut.icc
95831a2444d0354560000918ab0826b68aaa714bcaa3f463082ac8d11e45f42e  HdrCicp2NoColumns.icc
fe5916f19bef13135741bc713a4e776d4f88dd8528ad2e9e3ce4f644d092b0b4  HdrCicpUnspecified.icc
610176bfbf4e01ac12c68ead11fdc3f9063804062a6c8035fd43ee0d1608d304  HdrColorSpaceClass.icc
9ed1531e4320c4c76fe77f0ae95c4f9c72482e39430b092a5c83a4b470b01295  HdrDisplayMetadata.icc
096a3373b04db6e0d478d8ec1d05b87a4396a73820ebd189c2484a24bd6a2ac2  HdrFullRangeFlag.icc
7b03de1411ba450e4fe09fa5f968921917240c45473e9db5520556e2024affc7  HdrHeadroomDcvCrwl.icc
994c142e7ca7fa8b9f53ff41e74ff7b1caf666a7881b66e1301e8ae9ddb56eaa  HdrHeadroomDcvDrwl.icc
1b37fc676a3448e36e9cb2c8d5a96e1224cf964d57b785a1848f87dd65097745  HdrHlgBt2020Primaries.icc
85c341a36ad5a91bc5df1ea6eff50b4230c9db59c618280a1e9b7dada0a86bc0  HdrHlgBt709Primaries.icc
18bd02f77366f79bec3707ee00e09d4049bf25383383e47577a5191d06484b4b  HdrInputDisplayMeta.icc
3cf575b7b81bdd8032a9ec6deff69c54ad6bdf626467d4454f4e1d0ca3c8d3f3  HdrInvalidTransfer.icc
ffd220c80da89e0762ccdb0f3e01d69430565dd139ade52d1ae5787b63dbd690  HdrLinearCll.icc
7617d4be5102cf18da77d3cecfb626a5268cde223ba8438ba5ddc9e25dfa63b3  HdrLinearHagcWhite.icc
79b050ced6083ce0cd55910587ce7d96f4ac4429dd63f263b775da9cb862bb10  HdrLinearMdcv.icc
47b3258ad4b6b73e2053812bbf0a930e9da29fad8930b32b85fd7d07ab1ebc44  HdrLinearNoMetadata.icc
ac5ba0104a6a11cfd63081422cc76fbdb697e5c8f1089a32beba31682bb638a6  HdrMissingBToA0.icc
737d96158fdbc467a154d87fa66cb1982c79e3f5b5e76cb2fa8ba8d65132a928  HdrMissingBToA1.icc
c3e841d778bd4fd6276f1f4c49aba9531ce9a02dac1cd56d2083ca2da952c911  HdrMissingLutPair.icc
9cd0caeec23932e7867d644d74837f22f3d0a0e36769ff30b10c1be5812c1f7e  HdrNarrowRangeFlag.icc
59d58b81654473b51112a92d22354075feb4290419ef44bd6ae3c5d56914f956  HdrNoCicpTag.icc
79c2a3a46d9bf550d9123c9158b34e67e78020f254ed49e7e92f4af9de65feaf  HdrNonRgbSpace.icc
de00a41cea669f09142fe37f832a3f306df176d97fb1faca9f0ad5166175bf50  HdrTransferSdr.icc
c310045aa2eeca12c4d0dd87cf4dd916b8f62e64155039a4febb769adf3dd52d  HdrTrcTagsPresent.icc
37ba391ce781581ca4663b12f32eef2c8aa87e8302f3fdea6703ea7486d33c71  HdrVersion44.icc
c93706a78c25c822bca2d66ee9c0952d875b380c8069afb73f9a4b3bb23e1dff  HdrVersion46.icc
0578eb94d5f15cb26d3be8c4a6f1541bcd81b948832bd8a49008ff043acc7ac6  ProfiletoolHdrCrossAxisWhite.icc
b9933202e0ff4a95299d4a6f342e97851270e9506ccf72325e670d1c9f4dca7f  ProfiletoolHdrDisplay.icc
53997216ad1db9415dbba5f4a65930526d0b6257fcaee28a56c4cbe45e3eaa81  ProfiletoolHdrRefWhiteConflict.icc
```
