# HDR image formats vs ICC profile embedding — survey

**Purpose:** scope input for Phase 2 of the HDR tranche, which was originally written as
"load a TIFF for display". This widens the container question to the formats that actually
carry HDR today, and records which of them the ICC specifies (or is discussing) as a home
for an embedded profile.

**Researched:** 2026-09-09. **Primary source:** ICC Technical Note "Embedding ICC profiles"
(v6, Oct 2021) Table 1 — the authoritative per-format matrix. Everything post-2021 (PNG
Third Edition, ISO 21496-1, ADGC) post-dates that technote and is cited separately.

---

## 1. Formats that both carry HDR and have a specified ICC slot

| Format | HDR mechanism | ICC embedding slot | ICC versions | Decode cost for profile extraction |
|---|---|---|---|---|
| **AVIF** (ISO/IEC 23008-12 + AV1) | 10/12-bit PQ/HLG via CICP; ISO 21496-1 gain map as a `tmap` derived item | `colr` box, type `prof` (full) or `rICC` (restricted: mono or 3-ch matrix/TRC) | v2 + v4 (technote: v4.3) | **Box parse only** — no AV1 decoder needed |
| **HEIF / HEIC** (ISO/IEC 23008-12, ISO/IEC 14496-12) | 10-bit PQ/HLG; Apple ships ISO-21496-1 gain maps since iOS 18 | same `colr` / `prof` / `rICC` | v2 + v4 (v4.3) | **Box parse only** — no HEVC decoder needed |
| **JPEG XL** (ISO/IEC 18181) | native float/HDR, PQ/HLG, CICP enums, gain maps | ICC in the codestream, **Brotli-deconstructed with tag-aware special handling — not a byte-stream copy** | v2 + v4 | **Needs libjxl** — the profile must be reconstructed, cannot be scanned out |
| **TIFF** (6.0) | float samples (`SAMPLEFORMAT_IEEEFP`), 32-bit | private tag **34675** (`ICC Profile`), type UNDEFINED | unrestricted — a v5 profile is technically embeddable | already have it (libtiff) |
| **PNG** (Third Edition, W3C) | `cICP` (BT.2100 PQ/HLG, BT.2020, Display P3) + `mDCv` / `cLLi` mastering + content light level; 16-bit int ceiling, no float | `iCCP` chunk (name + zlib-compressed profile) | technote says v2, **but that restriction was an erratum** (w3c/png#22); Third Edition clarifies v4 is current practice | already have it (libpng) |
| **JPEG / JFIF** (ISO/IEC 10918-1) | no native HDR; HDR via gain map (Ultra HDR / ISO 21496-1) over an SDR base | `APP2` marker, `ICC_PROFILE\0` + chunk index/count; **16 707 345-byte ceiling** from the 1-byte chunk counter | v2 + v4 | already have it (libjpeg) |
| **DNG** | Adobe "enhanced DNG" carries gain maps | `AsShotICCProfile` (50831) + `CurrentICCProfile` (50833); TIFF-based so tag 34675 also works | v2 + v4 | TIFF IFD parse |
| **JPEG 2000** | high bit depth (to 38-bit), archival/DCI rather than consumer HDR | JP2: Colorspace box, **Restricted ICC only, ICC.1:1998-09 (v2, matrix/TRC)**. JPX: Colour Specification box, "Any ICC" — Input/Display class, v2+v4, **LUT-based profiles excluded** | see left | box parse |
| **WebP** | none — 8-bit only. Listed because the ICC slot exists | RIFF `ICCP` chunk | unrestricted | already close |

**The extraction asymmetry that matters most here:** for AVIF and HEIC, pulling the ICC
profile out is an **ISOBMFF box walk** — no AV1/HEVC decoder, no dav1d/libde265, no
multi-megabyte WASM. Only *displaying the pixels* costs a codec. JPEG XL is the exception
that inverts this: its profile is Brotli-deconstructed, so even reading the profile requires
libjxl.

## 2. HDR-native formats with NO specified ICC slot

| Format | HDR mechanism | Colour signalling instead of ICC |
|---|---|---|
| **OpenEXR** | half/float, unbounded | `chromaticities` attribute (+ `whiteLuminance`, `adoptedNeutral`). ASWF has declined ICC embedding since at least 2005; current direction is OCIO colorspace/config-name attributes. An ICC profile can only ride as a private attribute (OpenImageIO's generic `ICCProfile` attr), which no EXR spec blesses. |
| **Radiance HDR** (`.hdr` / `.pic`, RGBE) | shared-exponent 32-bit RGBE | header lines: `PRIMARIES=`, `EXPOSURE=`, `COLORCORR=`. No ICC. |
| **DPX / Cineon** | 10/12-bit log | colorimetric code in the fixed header. No ICC. |
| **Camera raw** (CR3, NEF, ARW…) | sensor-linear | vendor colour matrices. No ICC — DNG is the exception, above. |
| **JPEG XT** (ISO/IEC 18477) | HDR extension layers over a JFIF base | base layer is a JFIF, so `APP2` ICC applies to the **SDR base only**. |

Practical consequence: for these, profiletool is a **profile author and pairer**, not a
profile extractor. They are pixel sources for the display/creation half of Phase 2, and any
ICC we associate with them is sidecar, not embedded.

## 3. The gain-map axis — and an ICC naming discrepancy to resolve

**ISO 21496-1:2025** ("Digital photography — Gain map metadata for image conversion — Part 1:
Dynamic range conversion") is published and is now the dominant consumer HDR mechanism. It
unified the Apple and Adobe proposals, and its containers are **JPEG, HEIF, AVIF and JPEG XL**
(plus Adobe enhanced DNG). Shipping since macOS 15 / iOS 18 / Android 15, and gain-map AVIF
was on by default in Chrome, Edge, Brave, Opera and Safari from June 2025. Google's Ultra HDR
(Android) is the JPEG flavour: SDR base + gain map, located via an MPF record in `APP2`, and
**the base image's ICC profile defines the colour space of the HDR result** — a Display-P3
base means the HDR rendition has P3 primaries.

That is the same territory as the HDR tranche's HAGC tag, and it raises a discrepancy worth
checking before Phase 2 design hardens:

> **ICC added an `ADGC` tag to ICC.1 on 17 April 2025** — tag signature `'ADGC'` (41444743h),
> type `adaptiveGainCurveType` / `'adgc'` (61646763h), with **ISO 21496-1 as a normative
> reference**. It is permitted only when the data colour space is RGB and the profile class is
> Input or Display; when image-specific, header flags bit 0 and bit 1 must both be set. Its
> header carries baseline headroom, alternate headroom, per-channel gain min/max and weight
> coefficients, MAX/MIN/colour-component weights, pre- and post-gain-curve CICP, backward-
> compatible A2B0/A2B1/A2B2 target headrooms, and three positionNumbers to `{x, y, slope}`
> triplet tables.
> Source: <https://archive.color.org/specification/ICC.1_Adaptive_Gain_Curve.pdf>
>
> Our iccDEV `hdr-profiles` branch implements the same functional object as
> **`headroomAdaptiveGainCurveTag` / `'hagc'` (HAGC)**, and `grep -ri "adgc\|21496"` over
> `~/code/iccdev-hdr/IccProfLib/` returns **nothing**. The field lists and the "Input or
> Display class only" restriction line up closely, so this reads as the same feature under a
> draft-vs-published name — but that is an assumption, not a verified fact. **Confirm against
> the ballot documents which signature profiletool should expect to see in the wild**, because
> it decides what `TagTable` matches and what a HAGC/ADGC display module keys on.

Related and already published: **ICC White Paper 61**, "Representation of HDR-to-SDR Tone
Mapping from a Headroom Adaptive Gain Curve in a v4 A2B0 Tag" — the HAGC-to-`mAB`-A2B0 baking
our branch's `IccHdrBake` implements.

## 4. Phase 2 container scope — RESOLVED 2026-09-09 (DL-HDRIMG1)

**Call: HEIC first, EXR alongside it. The 16-bit TIFF HDR encoding question is demoted from
Phase-2 gate to backlog item.** Rationale and the full decision text are in
`parity-roadmap.md` → **DL-HDRIMG1**. Summary of the implementation order:

**1. ISOBMFF `colr` walker — no new dependency, no WASM size cost.**
Extend `iccimage`'s `findProfileStream` scanner to walk `meta`/`iprp`/`ipco` for `colr`
boxes and accept `prof` and `rICC`. Gives **HEIC and AVIF** profile extraction on 100% of
browsers with no codec at all, and picks up WebP `ICCP` and JP2/JPX colour boxes almost free.
This is the half that must never depend on decode availability.

**2. EXR decode — pixel source for the display / A-B half.**
No ICC in the format, so this is purely pixels; profiletool authors the profile and pairs it.
Library choice deliberately open:

| | `tinyexr` | OpenEXR + Imath |
|---|---|---|
| Licence | BSD-3 | BSD-3 |
| Size / deps | single-header C11, reuses our zlib | full library + Imath |
| WASM prior art | known builds | `disneyresearch/openexr-wrap-em`, `paxsonsa/openexr-header-wasm` |
| **DWAA/DWAB** | **omitted on patent grounds** | supported |

DWA is common in production EXRs. **Verify the codec matrix against tinyexr's own README
before choosing** — if real-world DWA files must open, that settles it for OpenEXR.

**3. HEIC pixel decode — borrow the browser's HEVC.**
libheif ships a **`webcodecs` decoder backend that exists only in emscripten builds**,
because it calls the browser's WebCodecs API. That avoids statically linking libde265 *and*
sidesteps the HEVC patent question — the platform already holds the licence. Coverage is
platform-gated: Safari effectively universal, Chrome ~96.7% macOS / ~86% Windows / ~54.6%
Linux, Firefox and Edge close to absent. So feature-detect and give an explicit "this browser
cannot decode HEVC" state — **pixels degrade, profiles never do.**

> **Licence obligation:** libheif is **LGPL**, and profiletool ships as a statically linked
> WASM bundle from a public host, so the relinking obligation applies and wants a deliberate
> answer before HEIC pixel decode ships. It does **not** touch step 1, which uses no libheif.
> OpenEXR / Imath / tinyexr are BSD-3 with no such obligation.

**4. Gain-map awareness.**
ISO 21496-1 metadata (and Ultra HDR's MPF variant) shown **beside** the profile's own
adaptive gain curve — the tool that shows whether the file's gain map and the profile's
HAGC/ADGC agree. HEIC being first makes this nearly free to source test material for: any
recent iPhone produces exactly this file.

**Deferred:** libjxl (JPEG XL — highest complexity for both pixels *and* profile, since the
profile is Brotli-deconstructed; `libjxl#4158`, `@jsquash/jxl` as prior art), and 16-bit TIFF
HDR encoding, which keeps its own decision note for when it is reached. Widening the
container list weakened that decision's premise anyway: AVIF, HEIC and EXR all express HDR
natively, so TIFF was never the necessary vehicle.

---

### Sources

- ICC Technical Note, *Embedding ICC profiles* (v6, Oct 2021) — <https://archive.color.org/files/technotes/ICC-Technote-ProfileEmbedding.pdf>
- ICC, *Adaptive Gain Curve Tag (ADGC) and adaptiveGainCurveType*, added to ICC.1 17 Apr 2025 — <https://archive.color.org/specification/ICC.1_Adaptive_Gain_Curve.pdf>
- ICC, *Embedding ICC profiles in image file formats* — <https://www.color.org/profile_embedding.xalter>
- ICC HDR Working Group + White Papers (WP36 embedding/referencing, WP61 HAGC→A2B0) — <https://www.color.org/whitepapers/>, <https://www.color.org/groups/hdr/index.xalter>
- ICC HDR Stills Expert Day, Tokyo 2024 — <https://www.color.org/events/hdr/tokyo2024_expert_day/tokyo2024_hdr_stills_expert_day.xalter>
- ISO 21496-1:2025, *Gain map metadata for image conversion* — <https://www.iso.org/standard/86775.html>
- Ultra HDR Image Format v1.1 (Android) — <https://developer.android.com/media/platform/hdr-image-format>
- PNG Third Edition explainer + ICC-v2 erratum — <https://github.com/w3c/png/blob/main/Third_Edition_Explainer.md>, <https://github.com/w3c/png/issues/22>
- HEIF technical information (Nokia) — <https://nokiatech.github.io/heif/technical.html>
- AVIF ICC-vs-CICP precedence discussion — <https://github.com/AOMediaCodec/av1-avif/issues/84>
- JPEG XL format overview (ICC handling) — <https://github.com/libjxl/libjxl/blob/main/doc/format_overview.md>
- OpenEXR colorspace-attribute proposal (ASWF) — <https://lists.aswf.io/g/openexr-dev/topic/proposal_colorspace/90448287>
- libheif — <https://github.com/strukturag/libheif>; WASM ports: <https://www.npmjs.com/package/libheif-js>, <https://github.com/discere-os/libheif.wasm>
- libjxl WASM build issue — <https://github.com/libjxl/libjxl/issues/4158>
- libheif decoder plugins incl. the emscripten-only `webcodecs` backend, and LGPL licence — <https://github.com/strukturag/libheif/blob/master/README.md>
- libheif / x265 licence + HEVC patent discussion — <https://github.com/strukturag/libheif/issues/591>
- WebCodecs HEVC browser coverage — <https://webcodecsfundamentals.org/codecs/hevc.html>, <https://caniuse.com/hevc>
- tinyexr — <https://github.com/syoyo/tinyexr>; OpenEXR vs tinyexr comparison — <https://aras-p.info/blog/2025/11/22/OpenEXR-vs-tinyexr/>
- OpenEXR Emscripten wrappers — <https://github.com/disneyresearch/openexr-wrap-em>, <https://github.com/paxsonsa/openexr-header-wasm>
