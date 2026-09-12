# HDR image capabilities by browser and platform

**Purpose.** Decide, per platform, which HDR image formats profiletool offers and which it
refuses — and make that decision visible to the user rather than silent. Written 2026-09-12
for DL-HDRENV1; the decision entry is in `parity-roadmap.md`, the tranche plan in
`hdr-phase1-status.md`.

**The decision this rests on:** *do not implement HEIC decoding ourselves.* Use the browser's
own decoder where it exists, accept that it does not exist everywhere, and say so in the UI.

---

## 1. The distinction that drives everything: inspect vs display

These are different capabilities with different dependencies, and conflating them is what makes
"can we support HEIC?" unanswerable:

| | What it needs | Where it works |
|---|---|---|
| **Inspect** — read the embedded ICC profile, validate it, show its tags | An ISOBMFF box walk. **No codec.** | **Everywhere**, all browsers, all platforms |
| **Display** — put the image's pixels on screen | A decoder for that format | Browser-dependent (this document) |
| **Render as HDR** — brighter-than-white pixels | A decoder **and** an HDR display **and** an HDR canvas path | Narrowest of the three |

Phase 2 step 1 already delivers **inspect** for HEIC and AVIF with no codec dependency. So on a
browser that cannot decode HEIC, the profile still validates, its tags still render, the gain
curve still plots — only the picture is missing. That is a materially useful state and the UI
should present it as such, not as a failure.

## 2. Capability matrix

**Legend.** ✅ works · ⚠️ works with a caveat · ❌ not available · **(ours)** = decoded by our own
WASM, so browser-independent.

### Primary targets

| Format | Chrome / Windows | Safari / iOS + macOS | Chrome / macOS |
|---|---|---|---|
| **ICC inspect** (any of the below) | ✅ | ✅ | ✅ |
| **AVIF** display | ✅ | ✅ | ✅ |
| **AVIF** HDR (PQ/HLG) | ✅ | ✅ | ✅ |
| **AVIF** gain map | ❓ unverified (see note) | ✅ | ❓ unverified (see note) |
| **HEIC** display | ❌ **no native decode** | ✅ | ❌ **no native decode** |
| **JPEG** display | ✅ | ✅ | ✅ |
| **JPEG + gain map** (Ultra HDR) | ✅ Chrome 116+ | ✅ | ✅ Chrome 116+ |
| **PNG** incl. `cICP` HDR | ✅ | ✅ | ✅ |
| **JPEG XL** | ❌ | ✅ | ❌ |
| **EXR** **(ours)** | ✅ | ✅ | ✅ |
| **TIFF** float **(ours)** | ✅ | ✅ | ✅ |

> **Correction, 2026-09-12 — AVIF gain maps in Chrome.** This row originally said AVIF gain
> maps need `chrome://flags/#avif-gainmap-hdr-images`. That flag **no longer exists** in
> current Chromium: it is absent from `about_flags.cc`, Blink's `features.cc` and
> `media_switches.cc`. Sources conflict on what replaced it — 2023 commits introduced it
> disabled by default, a 2025 write-up says gain-map AVIF is on by default — and we have not
> tested rendering ourselves. So the row says *unverified* rather than guessing, and the
> Environment panel's flag advice deliberately does not mention it: telling a user to set a
> flag that is not there sends them looking for nothing.

### Secondary target

| Format | Firefox / Windows + macOS |
|---|---|
| **ICC inspect** | ✅ |
| **AVIF** display | ✅ (SDR rendering) |
| **AVIF / JPEG HDR + gain maps** | ❌ **no HDR image support at all** |
| **HEIC**, **JPEG XL** | ❌ |
| **EXR**, **TIFF** **(ours)** | ✅ decode; ❌ HDR *rendering* |

Firefox is the outlier and it is worth stating plainly: it decodes AVIF but **does not render HDR
images**, and does not read gain maps. HDR *video* on Windows reached Nightly 148 in January 2026;
images have not followed. So Firefox is an **SDR-only** target — everything inspects, everything
SDR-displays, nothing renders as HDR.

### The headline consequences

1. **HEIC display is a Safari-only capability.** Chrome decodes HEIC on no platform, macOS
   included — it does not use the system image decoders. This is the direct cost of the
   browser-native decision, and it is the right cost to pay (see §4).
2. **Two of the three primary targets cannot display HEIC.** Since Apple devices are what produce
   HEIC, the common case — an iPhone photo opened on a desktop Chrome — inspects but does not
   display.
3. **Gain-map JPEG is the most portable HDR format we can show**, working on all three primary
   targets. AVIF HDR is equally portable for PQ/HLG; its *gain-map* variant is unverified in
   Chrome (see the note under the matrix).
4. **Safari is the only target where everything works**, JPEG XL included.

## 3. HDR *rendering*, which is a third axis

Decoding an HDR image is not the same as showing it as HDR. Three things must all hold: the
format decodes, the display is HDR-capable, and the page uses a canvas path that carries
brighter-than-white values. Per panelapp's `HDR.md`, the practical pathways are 2-D canvas
`float16` + `rec2100-pq`/`hlg` (flagged in Chrome), WebGPU `rgba16float` with extended tone
mapping (unflagged, Chrome 129+), and WebGL2. `<img>` gives no pixel control and reads back
tone-mapped SDR, so it is useless for analysis even where it displays correctly.

Detection signals, all already exercised by panelapp's `hdrProbe.tsx`:
`matchMedia('(dynamic-range: high)')`, `(video-dynamic-range: high)`, `(color-gamut: p3|rec2020)`,
canvas `float16` + `rec2100-*` support, and WebGPU `configureHighDynamicRange` / extended
`toneMapping`.

**`screen.colorInfo` is unimplemented**, so a browser cannot query actual display headroom.
H_target must be supplied or assumed, never auto-derived — a constraint already recorded in the
iccDEV HDR brief.

## 4. Licensing, segmented

This is the axis the browser-native decision was made on.

| Path | Licence | Obligation on us |
|---|---|---|
| **HEIC via the browser** | — | **None.** The platform holds the HEVC licence and runs the decoder. This is the entire point. |
| **libheif** (*not taken*) | **LGPL-3.0** | Relinking obligation on a statically linked WASM bundle: ship object files, or load it as a separate module. Avoided. |
| HEVC patents | — | Not ours if we never ship a decoder. |
| **tinyexr** (ours) | BSD-3 | Attribution only. Vendored with its LICENSE. |
| libtiff / libpng / libjpeg | permissive | Attribution only; already shipped. |
| libjxl (*if ever*) | Apache-2.0 | No relinking obligation; deferred for build complexity, not licensing. |
| IccProfLib (iccDEV) | ICC terms | Unchanged from today. |

**Not licensing, but the same shape — specification availability:**

- **ISO 21496-1** (gain-map metadata): layout is paywalled. We detect the gain map and report it
  as *present, not decoded*, rather than guess field offsets.
- **ADGC** (ICC's published gain-curve tag): its header table is self-contradictory and its only
  normative reference was unpublished at ratification, so it is defective **and**
  unreconstructable. Same answer, same reason.
- **Ultra HDR XMP**: publicly specified, therefore actually parsed.

The pattern across all three: a confident wrong number that nothing downstream can detect is
worse than no number.

**Outstanding and unrelated to HEIC:** this repository has **no `LICENSE` file**. We deploy
publicly and vendor BSD-3 source while stating no terms of our own. Worth closing regardless.

## 5. What this implies for the build

1. **An Environment cluster** — detect and *display* browser, platform and display capability, so
   a user can see why something is unavailable. Folds together with the HDR-monitor diagnostics
   taken from panelapp, since they share every detection signal.
2. **One capability table as the single source of truth**, mapping (browser, platform, display) →
   permitted operations. Both the UI gating and the Environment display read from it, so what the
   user is told and what the code allows cannot drift apart.
3. **Refusals must name the reason.** "HEIC display needs Safari; this is Chrome" is actionable.
   "Cannot open this file" is not — and is false, since inspection works.
4. **Feature-detect, do not sniff the user agent**, wherever a real probe exists: `ImageDecoder`
   type support, `matchMedia`, a canvas configure attempt. UA strings are a last resort for
   attributing a *reason* to a user, not for deciding capability.

## 6. Sources

- [Ultra HDR gain maps in Chrome 116+](https://gregbenzphotography.com/hdr-photos/jpg-hdr-gain-maps-in-adobe-camera-raw/) · [Ultra HDR format](https://developer.android.com/media/platform/hdr-image-format)
- [Which software supports HDR photo display (browser matrix)](https://gregbenzphotography.com/hdr-display-photo-software/)
- [Apple macOS/iOS ISO 21496-1 gain-map support](https://gregbenzphotography.com/hdr-photos/apple-macos-ios-hdr-iso-gain-map-21496-1/)
- [HEIF browser support (Safari only)](https://caniuse.com/heif) · [AVIF support](https://en.wikipedia.org/wiki/AVIF)
- [Firefox HDR video on Windows, Nightly 148](https://mozillagfx.wordpress.com/2026/01/16/experimental-high-dynamic-range-video-playback-on-windows-in-firefox-nightly-148/) · [Gecko HDR meta bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1539685)
- [HDR CSS media queries (`dynamic-range`)](https://chromestatus.com/feature/5680926106320896)
- [libheif (LGPL)](https://github.com/strukturag/libheif) · [WebCodecs HEVC coverage](https://webcodecsfundamentals.org/codecs/hevc.html)
- `~/code/panelapp/HDR.md` and `src/views/hdrProbe.tsx` — the display-pathway research and probe
