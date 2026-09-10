# HDR tranche — Phase 1 status

**Branch:** `feat/hdr-profiles` (off `main` @ `c37d414`). `main` deliberately left clean so
any main-facing work can happen in a separate worktree.
**Date:** 2026-09-10. **Built against:** `hdr-profiles` @ **`101fbffc`**. Library reports
`2.3.2.3`.

> **Phase 1 items 1-5 are COMPLETE as of 2026-09-10.** The WASM was rebuilt clean against
> `101fbffc` and now carries PAWG section `H`; the panel, the HAGC plot, the CICP display
> module and our own conforming fixture are all in and verified. `build-wasm.sh --verify`
> reproduces `SHA256SUMS`.
>
> **Build from a PINNED worktree, not from `~/code/iccdev-hdr` directly.** The branch head
> moved *twice during this session* (`4a761829` → `101fbffc`) — another session commits to
> that worktree, which is exactly the torn-artifact hazard noted below. The build used
> `git -C ~/code/iccdev worktree add --detach <scratch>/iccdev-hdr-build <sha>` plus a
> `third_party` symlink, the same shape as the release runbook's clean-master step.

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

### → HAND BACK to iccDEV (`~/code/iccdev-hdr`)

- **PAWG C5 false-positives on every conforming HDR Profile.**
  `C5 WARN: standard tags outside the local class rule table: 'B2A0'`. Reproduced on
  **upstream's own current fixtures** (`HagcDisplay`, `HagcCommonParams`, `HagcHexData`, each
  rebuilt from current XML) as well as ours — so this is not a profiletool artifact.
  Cause: in `Tools/CmdLine/IccPawgReport/PawgReport.cpp`, `displayRule` draws its optional
  set from `kCommonOptional` = {CalibrationDateTime, CharTarget, Cicp, ChromaticAdaptation,
  Chromaticity, HAGC}. `icSigAToB0Tag` is in `kMatrixTrcAlternative`, but `icSigBToA0Tag` is
  in **none** of the display class's required / alternative / optional sets, so it falls
  through `IsAllowedForClass()` to the warning. Clause 8.10.6 mandates the A2B0 and 8.10.3 c)
  mandates pairing it with a B2A0, so every profile that follows the clause trips this.
  **This is the same shape as the two fixes already recorded in the comment above
  `kCommonOptional`** (cicpTag via #2001, then headroomAdaptiveGainCurveTag) — a permitted
  tag missing from the class table. Likely fix: add `icSigBToA0Tag` there with the same style
  of comment.

- **Question, not a defect — HAGC vs the published ADGC.** ICC added an `ADGC` tag
  (`'ADGC'` / type `'adgc'`, `adaptiveGainCurveType`) to ICC.1 on **17 April 2025**, with
  **ISO 21496-1** as a normative reference. The branch has no reference to `ADGC` or 21496
  anywhere; it implements `headroomAdaptiveGainCurveTag` / `'hagc'` against **SMPTE
  ST 2094-50:2026** and cites the **29-08-2026 revision** of the amendment (43 occurrences).
  Both describe headroom-adaptive gain-curve tone mapping. Which signature will profiles in
  the wild carry? It decides what `TagVisuals.jsx` and the iccviz descriptor key on.

- **Minor / optional — `PawgReport.cpp` now includes `../IccCmdLineUtil.h`.** An embedder
  compiling `PawgReport.cpp` outside the `Tools/CmdLine` build needs that parent directory on
  its include path (we hit this as a hard build failure; see item 1). Worth a line in the
  file, or keeping the include self-contained, if embedding is meant to stay easy.

### → OURS, not upstream's

- **The three "metadata could not be decoded" fixtures are our STALE BINARIES.** Upstream's
  current XML for `HagcCommonParams` and `HagcHexData` rebuilds as **valid** through the same
  WASM. `HagcInvalidXOrder` is a deliberate NEGATIVE fixture and errors upstream too.
- **`HdrInvalidTransfer` is meant to be valid.** Its own XML header says so in as many words:
  *"despite the file name nothing about this profile is invalid"* — it is a CLASSIFICATION
  fixture pinning that a non-member is not reported against. Our copy showing `error` is the
  same stale-binary drift. The `hdr-corpus-manifest.tsv` records its expected class as
  `hdr-content`, and the manifest exists precisely because validation verdict and clause-8.10
  classification are different axes.
- **Corpus refresh (19 → 42, XML-only) is our task.** Upstream rewrote `Testing/HDR/`
  entirely, dropped the committed `.icc` files in favour of `mkprofiles` /
  `CreateAllProfiles.sh`, and added `hdr-corpus-manifest.tsv` enforced by CTest
  (`iccdev.hdr-corpus-manifest`). Our `test-corpus/hdr/` predates all of it.
- **Still do NOT bulk-regenerate our `.icc` from our OWN committed XML.** Measured:
  `HdrInvalidTransfer` and `HdrMissingBToA0` change verdict. The correct move is to re-copy
  from upstream's current corpus, not to re-render our stale XML.

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
