# HDR tranche — Phase 1 status

**Branch:** `feat/hdr-profiles` (off `main` @ `c37d414`). `main` deliberately left clean so
any main-facing work can happen in a separate worktree.
**Date:** 2026-08-06. **Built against:** `~/code/iccdev-hdr` @ `52df7796` (branch
`hdr-profiles`, merged up to `origin/master` = `a7abbee8`). Library reports `2.3.2.2`.

> **STALE AS OF 2026-08-06 (later same day).** `hdr-profiles` has moved to `07808dd6`,
> ~20+ commits ahead of our artifacts, and now includes the PAWG HDR section (see below).
> Our committed WASM predates all of it. **Rebuilding is the current blocker.**

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

## Remaining Phase 1

1. **Rebuild the WASM against `07808dd6`.** Current blocker for everything else. Picks up
   PAWG section `H` plus ~20 upstream fixes. Note `5a3eedd5` (#2001/#2004) landed the C5
   `cicp` fix on its own path as the original handback predicted, so the local branch is no
   longer the only source of it.
2. **Surface PAWG section `H` in `PawgPanel`.** `PawgPanel.jsx` groups on `it.section`, so an
   `hdr` section may flow through unchanged — but the section ordering/label handling needs
   checking, and this is **untested** because the section does not exist in our current build.
   Expect an i18n label key for the new section heading.
3. **HAGC gain-curve plot.** Route through `iccviz`'s existing per-tag inline graph path —
   add a `Kind` to `iccviz/IccVizModel.hpp` (append-only enum; next free value is 9),
   enumerate it when a HAGC tag is present, bind `Descriptor::tag =
   icSigHeadroomAdaptiveGainCurveTag`, emit one `Series` per alternate image. `TagTable`
   then renders it inline automatically via `enumerateVisualizations` → `byTag`. This keeps
   the plot attached to its own tag row, satisfying ruling 1.
4. **CICP human-readable display module** — map `cicpTag` numerics to names
   (`TransferCharacteristics=16` → PQ, `18` → HLG, `8` → Linear; `ColourPrimaries=9` →
   BT.2020, `2` → Unspecified/recover-from-profile). `icGetHdrTransferName()` and
   `icGetCicpPrimaries()` in `IccHdrProfile.h` already do this in C++.
5. **Author our own HDR profile** through the iccxml path (owner chose "copy upstream
   fixtures **and** author our own", so we have a fixture we can freely mutate for new
   deformity cases).

## Phases 2 and 3 (not started)

- **Phase 2** — separate "HDR" top-level tab, peer to Profile/Compare/Link/SpecSep, with
  Profile-tab-style drag-and-drop (one profile at a time): load a TIFF for display, create
  HDR profiles interactively from it, A/B compare UX ported from `~/code/tiffview` (A/B =
  SDR vs HDR) plus an analogue slider between the two ends, and HDR-capability diagnostics
  from `~/code/panelapp` ("is the browser on an HDR-capable monitor?").
  **Blocked** on the 16-bit TIFF HDR encoding decision — scale/offset vs half-float. That
  decision belongs to profiletool now and wants a written decision note *before* code (same
  pattern as iccDEV's T0). Constraints already measured upstream, do not re-derive: 16-bit
  PCS tops out at ~1 stop of headroom; a sampled `curveType` TRC cannot express HDR linear
  light at all (clamps at 1.0) while `parametricCurveType` does not clamp.
- **Phase 3** — enable HDR for Compare and Combine. Until then show "HDR profiles not
  supported".
