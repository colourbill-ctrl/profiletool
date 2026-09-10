# HDR tranche — Phase 1 status

**Branch:** `feat/hdr-profiles` (off `main` @ `c37d414`). `main` deliberately left clean so
any main-facing work can happen in a separate worktree.
**Date:** 2026-09-10 (integrated `86c691a9` same day). **Built against:** `hdr-profiles` @
**`86c691a9`**. Library reports `2.3.2.3`.

> **Phase 1 items 1-5 COMPLETE, and iccDEV's C5 fix is integrated.** The handback below was
> actioned upstream; we rebuilt on `86c691a9`, refreshed `test-corpus/hdr` from upstream's
> rewritten corpus, and added `scripts/check-hdr-corpus.mjs`. `build-wasm.sh --verify`
> reproduces `SHA256SUMS`.
>
> **Build from a PINNED worktree, not from `~/code/iccdev-hdr` directly.** The head moved
> twice during the first build (`4a761829` -> `101fbffc`) and **five more times** before this
> one (`659bbae7`, `36991ca7`, `c49b3b93`, `9451bf36`, `86c691a9`), three of which change PAWG
> output. Pin an explicit SHA:
> `git -C ~/code/iccdev worktree add --detach <path> <sha>` plus a `third_party` symlink.

Companion docs: `hdr-profiles-handback.md` (inbound state from the iccDEV session),
`hdr-profiles-iccdev-brief.md` (pointer to the original plan).

---

## Owner rulings that constrain this work

1. **Presentation is by PHYSICAL location, not function.** Header and Tags sub-tabs
   correspond to the physical parts of the ICC file. No HDR sub-tab, no HDR badge, no
   feature panel. New tag types get **new display modules** that render them *in place* and
   map values to human-readable strings. Derived values reach the user only through the tag
   or header field they came from.
2. **PAWG and IccProfLib validation stay separate.** Different intent — IccProfLib =
   "can a CMM use this?", PAWG = "general health/usability". HDR conformance items go into
   **PAWG, in iccDEV**, and PAWG does its own filtering. profiletool never receives a raw
   message stream and triages it in the UI.

## Done

- **CMakeLists HDR wiring** (`validator-wasm/CMakeLists.txt`). The four HDR modules
  (`IccTagHagc`, `IccHdrProfile`, `IccHdrToneMap`, `IccHdrBake`) added to
  `ICCPROFLIB_SOURCES`, which is a **hand-mirrored list** — so `ICCDEV_ROOT` alone had been
  silently building the pre-HDR library. Added **conditionally**, keyed on `IccTagHagc.cpp`
  existing, with `PROFILETOOL_HAS_HDR=1` propagated to the six IccProfLib-linked targets.
  Unconditional would break every clean-master build, including the release runbook's
  `/tmp/iccdev-clean` step. A partial module set is a hard error, not a silent half-build.
- **`pawg-wrapper.cpp` signature fix.** Upstream retired `DumpPawgReport`'s `bUseRead`
  parameter (iccDEV #1977 / PR #1978); our call no longer compiled. **Not HDR-specific** —
  this is on master, so the next release rebuild would have failed identically. The fix is
  behaviour-neutral: the fallback that flag gated was dead code (could only ever hold a NULL
  profile), and raw-byte assessment now runs unconditionally first.
- **WASM rebuilt clean** — all 7 modules, artifacts copied to `frontend/public/wasm/`,
  `SHA256SUMS` refreshed.
- **`test-corpus/hdr/`** — 19 fixtures + their source XML copied from
  `iccDEV:Testing/HDR/`, with a README covering what each proves, the deformity cases, why
  the `BT2100*` set is **not** a happy path (MPE-based, not clause-8.10 HDR Profiles), and
  checksums.
- **`test-corpus/README.md`** — recorded that `version-unknown.icc` gained two messages at
  this bump (IccProfLib now names offending v2 tag types individually; level unchanged).

## Verified working

- HAGC parses as a **named** tag: `HAGC / headroomAdaptiveGainCurveTag /
  headroomAdaptiveGainCurveType`, with a full `Describe()` dump (ST 2094-50 metadata size,
  reference white, baseline headroom, chromaticities mode, per-alternate mixing
  type/coefficients/control points, and whether slopes are carried or PCHIP-derived).
  `TagTable` already renders that, so the profile is inspectable with no UI work.
- Clause-8.10 findings correct on all three deformity fixtures (`HdrInvalidTransfer`,
  `HdrMissingBToA0`, `HagcInvalidXOrder`).
- PAWG **C5 cicp false positive is fixed** through our WASM (`OK` on the HDR profile).
  32 items, 1 non-pass: S3 flags creator `'ICCD'` as unregistered — a synthetic-fixture
  artifact, not a defect.
- HDR profile round-trips **byte-identically through both XML and JSON** (856→856, same
  profileId, 11 tags), so the HAGC shims work in our modules.
- Regression sweep clean: main corpus, plot corpus (8/8 graceful), qc, gamutmesh, iccimage.

## Known gaps / open items

- **Clause-8.10 findings invisible in the UI — NOW ADDRESSED UPSTREAM.** The handback at
  `~/code/iccdev-hdr/docs/notes/2026-08-06-handback-pawg-hdr-items.md` was actioned the same
  day: commit `0cd4e9f6` "hdr: give PAWG a first-class HDR section for clause 8.10" adds
  section `H` with all eight H1–H8 items, in both the text report and `--json`
  (`"section":"hdr"`). See §9 of that handback for what was built and where it departed from
  the suggestion. Key departures worth knowing:
  - **Absent, not `NotRun`**, for non-HDR profiles — an SDR report is byte-for-byte
    unchanged, and its 32-item count is pinned by CTest so regressing to placeholders is loud.
  - `AddHdrItems()` calls `icGetHdrProfileInfo()` itself and decides its own verdicts; it
    does **not** consume or re-print `CheckHdrProfile()`'s message stream. Ruling 2 is honoured
    — profiletool receives eight settled items, not a message stream to triage.
  - H7 gained a check `icHdrProfileInfo` alone cannot make: HAGC tag vs `CRWL` entry
    *disagreeing*. H8 reports `NotApplicable` (not a warning) when the profile carries no HDR
    Display entries, and a distinct `Gap` verdict for "entry present but unparsed".
  - Every H7/H8 detail sourced from the `metadataTag` reconstruction carries a bracketed
    caveat naming the unpublished ICC dictType Metadata Registry.
  - **The §6 mislabelling hazard was live and is fixed**: `HdrInvalidTransfer.icc` had been
    printing clause-8.10.1 text as the detail of **C3 "tag types allowed"**.
    `FirstNonHdrReportLine()` now skips whole `CheckHdrProfile()` messages including indented
    continuation lines. C3's *verdict* is deliberately unchanged — the over-attribution
    predates HDR and was not that tranche's to re-cut.
- **The `validation.messages[]` rendering gap itself is still open** and is still
  profiletool's call. Section `H` reduces the HDR urgency but does not close it: IccProfLib's
  validation output remains invisible for *every* profile.
- **`buildlink` RGB→CMYK smoketest fails — PRE-EXISTING**, verified by running the identical
  case against `main`'s committed WASM. `~/code/iccdev/Testing/CMYK-3DLUTs/CMYK-3DLUTs.icc`
  is rewritten by iccDEV ctest runs and that smoketest hardcodes `~/code/iccdev`.
- **Parallel-session hazard:** anything building from `~/code/iccdev-hdr` while another
  session edits it gives a torn artifact. Recommended decoupling:
  `git -C ~/code/iccdev worktree add ~/code/iccdev-hdr-pawg -b hdr-pawg hdr-profiles`
  plus `ln -s ~/code/iccdev/third_party ~/code/iccdev-hdr-pawg/third_party`.

## Phase 1 items 1-5 — DONE 2026-09-10

1. **WASM rebuilt clean against `101fbffc`** — all 7 modules, artifacts copied,
   `SHA256SUMS` refreshed, `--verify` green. **Required one build fix:** upstream #2454 moved
   the JSON escaping into `Tools/CmdLine/IccCmdLineUtil.h`, and `PawgReport.cpp` now includes
   it, so `iccpawg` failed with `'IccCmdLineUtil.h' file not found`. Fixed by adding
   `${ICCDEV_ROOT}/Tools/CmdLine` to that target's include dirs (header-only; every symbol is
   `inline`, so no extra source file). `iccpawg` is the only target compiling a
   `Tools/CmdLine` source, so no other target needed it.
2. **PAWG section `H` surfaced in `PawgPanel`.** It did *not* flow through unchanged —
   `SECTIONS` is an explicit ordered list and the `grouped` seed named only three sections, so
   `hdr` items were parsed and then silently dropped. Added as the last section (matching
   `AddHdrItems()` being appended last upstream) with a new `pawg_hdr` key in all 12 locales.
   Verified: an HDR profile reports `[security,conformance,quality,hdr]`, and an SDR profile
   still reports exactly 32 items with no `hdr` section, as upstream intends.
3. **HAGC gain-curve plot** — `Kind::HagcGainCurve = 9` in `iccviz/IccVizModel.hpp`,
   `buildHagcGraph()` in `IccVizModel.cpp`, enumerated as `hagc:HAGC` bound to
   `icSigHeadroomAdaptiveGainCurveTag`, one `Series` per alternate image, plus a `No gain`
   hint line at y=0. `TagVisuals.jsx` renders it inline on the HAGC tag row via `byTag`
   (ruling 1). All of it is behind `#ifdef PROFILETOOL_HAS_HDR` and **both variants were
   syntax-checked** so a clean-master build still compiles with the engine absent.
   - The curve is drawn **through the authored control points as straight segments**, not
     resampled through the PCHIP interpolant. The control points are the authored data;
     alternates with `PchipSlope="true"` carry no slopes at all in the file, so a spline would
     be this engine's reconstruction shown as if it were the tag's contents.
   - Y is **signed** and routinely negative (an alternate tone-mapping down from the baseline
     has negative gain throughout), so the y-range comes from the data, never 0..1.
   - Verified on both `ProfiletoolHdrDisplay.icc` (1 alternate) and `HagcDisplay.icc`
     (2 alternates, one PCHIP-derived): correct signs, correct per-alternate headroom labels.
4. **CICP display module** — `components/CicpDetail.jsx`. Reads the four ITU-T H.273 code
   points **straight from the profile bytes** at `tag.offset + 8` rather than scraping
   `Describe()` text, so the values cannot drift with an upstream wording change; the reader
   was cross-checked against `Describe()` on two fixtures and matches on all four fields.
   Names H.273 Tables 2/3/4 and the full-range flag, distinguishes `Reserved` from
   `not assigned`, and flags non-zero reserved bytes. It states **no verdict** on whether a
   value is permitted in an HDR Profile — that is PAWG section H's job (ruling 2).
5. **Our own conforming fixture** — `test-corpus/hdr/ProfiletoolHdrDisplay.{xml,icc}`,
   authored through the iccxml `xmlToIcc` path. **This turned out to be load-bearing for
   item 2:** every upstream fixture carries the TRC trio that 8.10.1 prohibits, so all of them
   classify as `icHdrProfileHdrContent`, and `AddHdrItems()` deliberately emits H1 as N/A and
   suppresses H2..H8 for a non-member. Nothing in the corpus could exercise the HDR section
   past its first item. Ours validates clean and scores **H1..H8 all OK**.
   - First cut was missing the `AToB0Tag`; 8.10.6 requires one in *every* RGB HDR Profile as
     the no-HDR-processing fallback, and 8.10.3 c) requires it paired with a `BToA0Tag`.
     Adding the pair took the profile from `Critical tag(s) missing` to valid.

## Findings — triaged 2026-09-10 (upstream's current corpus checked)

**One item genuinely belongs to iccDEV; everything else is ours.** The triage was done by
rebuilding upstream's *current* `Testing/HDR/*.xml` through our iccxml and re-running both
the validator and PAWG on the result.

### → HANDED BACK, and RESOLVED upstream (integrated at `86c691a9`)

- **PAWG C5 false-positive on every conforming HDR Profile — FIXED.** iccDEV's fix put
  `icSigBToA0Tag` in **`kMatrixTrcAlternative`**, beside the `icSigAToB0Tag` it pairs with —
  neither of the two scopes we suggested, and rightly so. Their reasoning: this was never an
  HDR defect. ICC.1:2022 8.3.3/8.4.3 permit a LUT-based Input or Display profile (which is why
  `AToB0Tag` was already in that array), and for a Display profile ICC.1 then *requires* the
  paired `BToA0Tag` — so **any** LUT-based Display profile was being reported for doing what
  the specification demands; 8.10.6 merely made the whole HDR corpus hit it at once. Scoping
  to the HDR sub-class would have left the general case broken, and `kCommonOptional` was wrong
  in the other direction because the output and link rules read it too, where `BToA0Tag` is
  *required* rather than optional.
  **Verified here both ways:** C5 is now `OK` on `HagcDisplay`, `HdrDisplayMetadata`,
  `HagcCommonParams`, `HagcHexData` and our own fixture; and still `WARN`s
  `'c2sp','s2cp','svcn'` on `Testing/Display/LaserProjector.icc`, so the check narrowed rather
  than being disabled. An ordinary non-HDR Display profile carrying a B2A0 now reports OK,
  which is intended.

- **ADGC vs HAGC — NOT settled; do not re-cut.** iccDEV's position: ADGC is real, published
  (17 Apr 2025) and **live in ICC.1 today**; the HAGC proposal's covering argument says it
  replaces ADGC, but the **votable text does not remove it**, so on the operative text both are
  live (their ADGC-05). The container difference is structural, not a rename — ADGC carries
  curve data inline with positionNumbers, HAGC wraps a whole ST 2094-50 block supporting
  multiple alternates — so no straight signature swap should be expected. Their advice: keep
  keying on `'hagc'`, but key on the tag actually found rather than assuming one, since a
  profile may legally carry ADGC today.
  **We already satisfy that.** `TagVisuals.jsx` keys on the *descriptor*
  (`d.kind === KIND.HagcGainCurve`), never on a signature; the only place `'hagc'` is named is
  iccviz's `Enumerate`. Supporting ADGC later is one change there plus an upstream tag-factory
  entry, with no UI churn.
  Also noted upstream: ADGC-01 (its header table's byte ranges collide three times, and one
  range is unassigned — in *passed* text) and ADGC-03 (HAGC dropped the target-headroom field
  ADGC carried, making 8.10.6's "target headroom shall be equal to 1.0" uncheckable by any
  reader of a file).

- **`IccCmdLineUtil.h` include — acknowledged, not patched.** It arrived with #2454's
  `icJsonEscape` move, not from HDR work. iccDEV would raise it as an iccDEV-core item rather
  than patch it on the ballot-gated branch; our CMakeLists fix stands and costs nothing.

### Upstream changes since `101fbffc` that affect us

- **`9451bf36` — H6 gained a Display-class guard.** It previously FAILed every Input-class HDR
  Profile carrying an `AToB0Tag` without a `BToA0Tag`, including `HdrInputDisplayMeta`, which
  the manifest classes `conforming`. 8.10.6 scopes that rule to Display profiles. Verified:
  H6 on `HdrInputDisplayMeta` is now `OK`.
- **`c49b3b93` — amendment revision 2026-09-06 supersedes 29-08-2026.** Every rule we implement
  is unchanged, but a new 8.10.2 NOTE 7 shifts every later NOTE by one. **H8's detail text now
  says "(NOTE 13)" where it said "(NOTE 12)"** — verified. Do not assert on that string.
- **`36991ca7` / `659bbae7` — two rendering edge cases.** A profile whose forward matrix cannot
  be built now returns status 3 instead of rendering pure black; a gain curve whose control
  points all sit at X=0 now clips instead of collapsing to black.
- **`86c691a9` also** makes absent-fixture HDR regression tests report Skipped (exit 77) rather
  than PASS, and ships `iccHdrFallback` in iccDEV's own WASM npm package. That package is not
  what we build — we build `validator-wasm/` from source — so it does not affect us.

### → OURS — corpus refresh, now DONE

`test-corpus/hdr` has been refreshed from upstream's rewritten corpus: **42 fixtures
(19 before), generated from upstream's XML through our own `xmlToIcc`** since upstream no
longer commits `.icc` files, plus `hdr-corpus-manifest.tsv` copied verbatim. All 42 reproduce
their manifest classification exactly, which is what establishes that generating via iccxml is
equivalent to upstream's `mkprofiles`.

This retires the three earlier findings about stale binaries — those fixtures are gone,
replaced by ones that decode. It also removes the trap that our old XML could not express two
fixtures' defects, since we no longer re-render our own XML.

**New: `scripts/check-hdr-corpus.mjs`** asserts the corpus against the manifest and is the
profiletool-side equivalent of upstream's `iccdev.hdr-corpus-manifest` CTest. It exists because
our expectations broke twice in two rebuilds — once on the corpus rewrite, once on the H6
verdict correction. Classification is the axis that survives amendment revisions; remembered
verdicts are not. It also lists any `.icc` present but absent from the manifest, so nothing
sits in the corpus unchecked.

**Assertion corrected:** "H1..H8 all OK on a conforming profile" was never safe. `HagcDisplay`
is conforming but reports **H8 = N/A** — correctly, since it carries no 8.10.5 HDR Display
entries, so rule d) applies. Use `HdrDisplayMetadata` or our own `ProfiletoolHdrDisplay` as the
all-OK case. The "32 items, no HDR section" assertion for an SDR profile still holds.

### Note on our own fixture

`ProfiletoolHdrDisplay.xml` was authored here independently and **converged on exactly the
shape upstream adopted** — TRC tags removed, `AToB0Tag`/`BToA0Tag` pair added — which their
current `HagcDisplay.xml` comment attributes to the 29-08-2026 revision of 8.10.1. Upstream's
refreshed fixtures now score H1..H8 too, so ours is no longer the *only* way to exercise the
HDR section; it remains the one we may freely mutate.

## Phases 2 and 3 (not started)

- **Phase 2** — separate "HDR" top-level tab, peer to Profile/Compare/Link/SpecSep, with
  Profile-tab-style drag-and-drop (one image at a time): load an HDR image for display,
  create HDR profiles interactively from it, A/B compare UX ported from `~/code/tiffview`
  (A/B = SDR vs HDR) plus an analogue slider between the two ends, and HDR-capability
  diagnostics from `~/code/panelapp` ("is the browser on an HDR-capable monitor?").
  **Container scope RESOLVED 2026-09-09 — `DL-HDRIMG1` in `parity-roadmap.md`: HEIC first,
  EXR alongside it, TIFF demoted.** The format-by-format ICC-embedding matrix and its sources
  are in `hdr-image-formats-survey.md`. Implementation order:
  1. **ISOBMFF `colr` walker — no new dependency.** HEIC and AVIF both put the profile in a
     `colr` box (`prof` full / `rICC` restricted), so extraction is a **box walk, not an HEVC
     decode**: profile inspection works on 100% of browsers with zero codec cost. Extends
     `iccimage`'s existing `findProfileStream` scanner model, and picks up WebP `ICCP` and
     JP2/JPX colour boxes almost free.
  2. **EXR decode** — pixel source for the display half; no ICC in the format, so profiletool
     authors the profile and pairs it. `tinyexr` vs full OpenEXR+Imath is **open**: tinyexr
     omits DWAA/DWAB on patent grounds and DWA is common in production EXRs, so check the
     codec matrix against tinyexr's README before choosing.
  3. **HEIC pixel decode** via libheif's **`webcodecs` backend, which exists only in
     emscripten builds** because it calls the browser's WebCodecs API — no libde265 linked,
     and the HEVC patent question sits with the platform that already holds the licence.
     Coverage is platform-gated (Safari ~universal; Chrome ~96.7% macOS / ~86% Win / ~54.6%
     Linux; Firefox and Edge near-absent), so feature-detect: **pixels degrade, profiles
     never do.** ⚠ libheif is **LGPL** and we ship a statically linked WASM bundle publicly —
     the relinking obligation needs a deliberate answer before this step ships. Step 1 is
     unaffected (no libheif).
  4. **Gain-map awareness** — ISO 21496-1:2025 metadata (and Ultra HDR's MPF variant) shown
     next to the profile's own adaptive gain curve. HEIC being first makes test material
     free: any recent iPhone produces exactly this file.
  **⚠ Naming discrepancy to resolve before a HAGC display module is designed:** ICC added
  **`ADGC` / `adaptiveGainCurveType` (`'adgc'`)** to ICC.1 on **17 April 2025**, normatively
  referencing ISO 21496-1. Our branch implements the same functional object as
  `headroomAdaptiveGainCurveTag` / `'hagc'`, and `~/code/iccdev-hdr/IccProfLib/` contains no
  reference to ADGC or 21496 at all. Field lists and the Input/Display-class restriction line
  up, so it looks like draft-vs-published naming — **verify against the ballot documents**,
  because it decides which signature `TagTable` and any new display module key on.
  **No longer blocked.** The 16-bit TIFF HDR encoding decision — scale/offset vs half-float —
  is **demoted from Phase-2 gate to backlog item** (DL-HDRIMG1): it is one container's
  problem, not the entry condition for the phase, since AVIF/HEIC/EXR all express HDR
  natively. It keeps its own written decision note for when it is reached (same pattern as
  iccDEV's T0). Constraints already measured upstream, do not re-derive: 16-bit PCS tops out
  at ~1 stop of headroom; a sampled `curveType` TRC cannot express HDR linear light at all
  (clamps at 1.0) while `parametricCurveType` does not clamp.
- **Also deferred:** libjxl / JPEG XL — highest complexity for both pixels *and* profile,
  since JXL's ICC is Brotli-deconstructed and cannot be scanned out (`libjxl#4158`;
  `@jsquash/jxl` is prior art). Radiance RGBE (~200 lines, no dependency) is cheap enough to
  fold in opportunistically.
- **Phase 3** — enable HDR for Compare and Combine. Until then show "HDR profiles not
  supported".
