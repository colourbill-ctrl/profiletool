<!-- (c) 2026 William Li -->

# Test corpus — HDR profiles (ICC.1 v4.5 amendment)

Fixtures for profiletool's HDR tranche (Phase 1: read-only inspection of the
`headroomAdaptiveGainCurveTag` and the clause-8.10 HDR Profile sub-class).

**These require an HDR-capable WASM build.** The four IccProfLib HDR modules live
only on iccDEV's private `hdr-profiles` branch, so `frontend/public/wasm/` must
have been built with `ICCDEV_ROOT=~/code/iccdev-hdr` (see the repo README /
`validator-wasm/CMakeLists.txt`, which enables them via `PROFILETOOL_HAS_HDR`).
Against a clean-master build the HAGC tag parses as an **unknown tag** — that is
a build-inputs symptom, not a validator defect.

Like the parent corpus these are generated fixtures with **no measured data** —
do not use them for colour conversion.

## Provenance

Copied verbatim from `iccDEV:Testing/HDR/` on the `hdr-profiles` branch at
`52df7796` (merged up to `origin/master` = `a7abbee8`), 2026-08-06. Both the
`.icc` and the `.xml` they were generated from are kept: upstream builds each
`.icc` with `iccFromXml <name>.xml <name>.icc` (`Testing/HDR/mkprofiles.sh`), and
the XML carries authoring comments that document what each fixture is *for*.

Copied rather than referenced so this repo's tests run on a machine that has no
iccDEV checkout, and so the corpus is visible to reviewers. Re-copy after any
upstream fixture change; the checksums below are the drift guard.

## What each profile checks

### `HAGC` tag encoding — the three positive shapes

| Profile | Transfer | Covers |
|---|---|---|
| `HagcDisplay.icc` | PQ (TC=16) | The **full** layout: custom HDR reference white (shifts every later field by two bytes), custom chromaticities (mode 3, +16 bytes), two alternate images, component-mixing type 3 with a partly-populated coefficient array, and **both** slope forms — alternate 0 carries explicit angles, alternate 1 leaves them to be derived (PCHIP). Alternate 0 tone maps *down* from the 3.0-stop baseline so its control-point Y values are negative; alternate 1 sits above it so they are positive. That sign is not stored — it is re-derived from the headroom ordering on read. |
| `HagcCommonParams.icc` | HLG (TC=18) | The two **sharing flags** (`CommonComponentMixing`, `CommonCurveParameters`), which delete fields from every alternate after the first. |
| `HagcHexData.icc` | Linear (TC=8) | The **raw-byte** authoring path. |

`HagcDisplay` is the Phase-1 happy path — the "one HDR profile with no
deformities" the tranche is scoped around.

### Clause 8.10 HDR Profile classification

| Profile | Covers |
|---|---|
| `HdrDisplayMetadata.icc` | A conforming HDR Profile carrying HDR Image **and** HDR Display metadata (dictType, clauses 8.10.4/8.10.5) but **no** tone-mapping descriptor. The source for content-reference-white and display-headroom resolution. |
| `HdrCicpUnspecified.icc` | `ColourPrimaries = 2` (Unspecified) — primaries must be recovered from the profile's own matrix column tags rather than the H.273 table. |
| `HdrBakedLut.icc` | Only tone-mapping descriptor is a baked `AToB0`/`BToA0` pair, which is what makes the 8.10.3 descriptor **precedence** observable. |

### Deformities (negatives)

| Profile | Expected finding |
|---|---|
| `HagcInvalidXOrder.icc` | Control-point X values out of ascending order. Upstream lists it in `Testing/expected-invalid-fromxml.tsv` — i.e. it is a fixture `iccFromXml` itself rejects. |
| `HdrInvalidTransfer.icc` | `TransferCharacteristics` outside the HDR set {8, 16, 18}. |
| `HdrMissingBToA0.icc` | `AToB0` present without its paired `BToA0` — the 8.10.3 pairing rule. |

### `BT2100*` — context, not HDR Profiles

Ten BT.2100 PQ/HLG scene/display/link fixtures. They are **MPE-based**, not
matrix/TRC, so they are *not* clause-8.10 HDR Profiles and the HDR baker
correctly refuses them. Do **not** use one as a happy-path test. They are kept
because they exercise the same transfer functions through a different tag
structure, which is useful for the Tags sub-tab.

## Checksums

```
832449ff2f7c208e13b6140e868555d580378611a82b63531d03c40c9465c410  BT2100HlgFullDisplay.icc
bc6c0037daa37fb47b17b34c7cafb9ea2698a5e0a203e53270a2f7d92bf0cc92  BT2100HlgFullScene.icc
0e8c0ded9f79312ca70941294631a2c3a46c187ed962278399335db2f9ca1092  BT2100HlgNarrowDisplay.icc
bc52bcc9ad891314022c5aac8857cf552b29fd96c110e2485a268030af33f19c  BT2100HlgNarrowScene.icc
15f86f6eec69eb6048a0bc94531622ff1e657db39c686ba3fbfc8812a818538b  BT2100HlgSceneToDisplayLink.icc
a49bed02bc99a92f8d94f0539a614e3ce0db3b487a072c3e98a55719ee219076  BT2100PQFullDisplay.icc
e5598f5b57ef53ef7d56b56fe7db40d4280ed9c24a97910b352773cc7c8d7caf  BT2100PQFullScene.icc
cb4eb98b47e26a1a018a3fcda4112703ca115fb4c3b73e9a1c4d5f5ce23c3c65  BT2100PQNarrowDisplay.icc
d9e8c9c831cd36d5295583403f432de305b983918ac8b65faaef25dc1905a9c9  BT2100PQNarrowScene.icc
6fc36211f508438c6db98803430b0cf8d3f439814f9c4d2ce0c071b27a281771  BT2100PQSceneToDisplayLink.icc
860f45e894827a4177c43252b5f606ce5d09c157033dfb463d3fa7a9c49c5d51  HagcCommonParams.icc
00302d0c46d6169b6c8e6540d194ac86768f746ae3fd5946e47cf3c3bfc8e3a9  HagcDisplay.icc
7c658dccb0a7de440332e87133b198885f1465a00593d331399f67c1794ded9e  HagcHexData.icc
5663291521cd37c141ff3c5bb55ad5c249c55ee7a08d0c53d291f5231db1a1f8  HagcInvalidXOrder.icc
6ec11aa312956f92ec315d011955280f5325f93e2163b74938c8992dbfda5a26  HdrBakedLut.icc
8a6cc3666c47105c5553d3fe272906b66c7bdf2d3186d0e64c6b60f628688f4c  HdrCicpUnspecified.icc
99f7df26159991d89aa2930b195c861e886a6c769e7a6923e503e1b62e6847c2  HdrDisplayMetadata.icc
0bcad6e7c959f7750fea84d64ba14b98bafb3348c713141d0cadd0d26d5259e9  HdrInvalidTransfer.icc
d6b828d4c1ed7cb7507da76cd2e57fe8adc214fed4f84c7d5d13c3215c8149f7  HdrMissingBToA0.icc
```
