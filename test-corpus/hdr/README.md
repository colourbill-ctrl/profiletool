# HDR test corpus

**42 fixtures mirrored from iccDEV `Testing/HDR/` @ `86c691a9` (branch `hdr-profiles`),
plus 1 of our own.** Refreshed 2026-09-10.

## How this directory relates to upstream

Upstream is **XML-only**: it stopped committing `.icc` files and builds them with
`Testing/HDR/mkprofiles.sh` / `.bat`, which is the single source of its build list. We cannot
run that here, so the `.icc` files in this directory are **generated from the committed XML
through our own iccxml WASM** (`xmlToIcc`) — the same IccLibXML code path, so the results are
equivalent. All 42 reproduce their manifest classification exactly, which is the check that
they are.

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

The check maps the PAWG report back to a classification with no extra API — `AddHdrItems()`
returns early for class `none` so the report has no HDR section at all; `H1 == OK` means
`conforming`; `H1 == N/A` means `hdr-content`. It also lists any `.icc` present but *not* in
the manifest, so a fixture can never sit here silently unchecked.

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
| `HdrLinearHagcWhite` | HDR-10 ruling: the HAGC tag's reference white wins over a CRWL entry |
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

## `ProfiletoolHdrDisplay` — ours, not upstream's

Authored here through the same `xmlToIcc` path, and deliberately **not** in the manifest so
that file stays a verbatim copy. It is a conforming HDR Profile (RGB Display, version 4.50,
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
  `9451bf36`, which flipped `HdrInputDisplayMeta` from FAIL to OK. The classification axis is
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
e74c38f1ca3d9c9d494062984d4ee5727692982b0a3e26fc85bf13aa93407d54  ProfiletoolHdrDisplay.icc
```
