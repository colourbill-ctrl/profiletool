# Handback to profiletool — HDR Profiles state, and what moves here

**From:** the HDR session (`~/code/iccdev-hdr`, branch `hdr-profiles`).
**Date:** 2026-08-06. **iccDEV base:** merged up to `origin/master` = `a7abbee8`.
Companion to `hdr-profiles-iccdev-brief.md` (the original plan) — this note is the
*current state* and supersedes the brief where they disagree.

---

## 1. Headline decisions (owner-directed, 2026-08-06)

Two pieces of work were **deliberately moved out of iccDEV and into profiletool**:

1. **TIFF / image-container HDR support.** This was scoped as iccDEV tranche "T5" and has
   been **declined there**. It will be built as a module attached to profiletool instead.
2. **WASM integration of the HDR library work.** Same reasoning — do it here, against
   profiletool's own embind layer, rather than adding surface to the iccDEV branch.

The iccDEV branch is therefore **feature-complete and closed to new tranches**. It exists
to carry the ICC.1 v4.5 HDR amendment implementation until the ICC ballot passes.

## 2. What exists in iccDEV today

Branch `hdr-profiles` in the worktree `~/code/iccdev-hdr`: 9 commits, 58 files,
~13,000 lines, all signed. **Cannot land upstream until the ICC ballot passes and the
owner gives the green light** — so treat it as a private dependency, not a release.

Four new IccProfLib modules:

| module | what it gives you |
|---|---|
| `IccTagHagc.{h,cpp}` | `headroomAdaptiveGainCurveTag` ('HAGC'/'hagc') tag + type, XML/JSON shims |
| `IccHdrProfile.{h,cpp}` | clause 8.10 HDR Profile classification, `CheckHdrProfile()`, CICP=2 primaries recovery |
| `IccHdrToneMap.{h,cpp}` | analytic PQ/HLG transfer functions, `CIccHdrTransfer`, `CIccHagcEvaluator` |
| `IccHdrBake.{h,cpp}` | `CIccHdrBaker`, `icCreateHdrFallbackAtoB/BtoA`, `icAddHdrFallbackTags` |

Plus a CLI tool `Tools/CmdLine/IccHdrFallback` (bakes an HDR profile's SDR rendering into
an A2B0/B2A0 pair) and 19 XML fixtures under `Testing/HDR/`.

## 3. ⚠ The thing that will bite you first

**Pointing `ICCDEV_ROOT` at `~/code/iccdev-hdr` currently gets you NOTHING.**

`validator-wasm/CMakeLists.txt` builds from a **hand-mirrored** list, `ICCPROFLIB_SOURCES`
(line 23), of 37 specific `.cpp` files. **None of the four HDR modules are in it.** So the
build silently produces the same pre-HDR library it does today — no error, no warning, just
missing functionality.

Concretely, before anything HDR works here you must add to `ICCPROFLIB_SOURCES`:

```
IccTagHagc.cpp IccHdrProfile.cpp IccHdrToneMap.cpp IccHdrBake.cpp
```

**`IccTagHagc.cpp` is the one that matters most**, and it is not optional: it carries the
tag-factory registration. Without it a profile containing a `HAGC` tag parses as an
*unknown tag* — which will look like an iccDEV bug when it is a build-inputs omission.

This was never wired up; the brief's line about "profiletool consumes it privately by
pointing `ICCDEV_ROOT` at the worktree" quietly assumed it had been.

## 4. What NOT to reuse for the TIFF work

The obvious move — port iccDEV's `TiffImg` — **does not apply here**:

- `TiffImg.{cpp,h}` lives at `Tools/CmdLine/IccApplyProfiles/`, i.e. it is **tool** code,
  not IccProfLib. profiletool does not compile `Tools/CmdLine/*` at all.
- It is compiled into **three** iccDEV tools by relative path (`iccApplyProfiles`,
  `iccTiffDump`, `iccSpecSepToTiff`), each listing it in its own CMakeLists — part of why
  changing it in iccDEV was unattractive.
- The brief's own constraint for library code is "no filesystem in core", which TIFF I/O
  structurally violates. In a browser there is no filesystem anyway.

So the TIFF module is **new code in profiletool's embind wrapper layer**, not a port.

### The prerequisite nobody has decided yet

iccDEV's brief specifies the need but never sites the decision: **a documented 16-bit HDR
encoding convention** — scale/offset, or half-float. That decision now belongs to
profiletool. It is the same class of question as iccDEV's T0 encoding-range decision,
which got its own written decision note *before* any code; recommend doing the same.

The underlying constraint that forces the question (measured in iccDEV, do not re-derive):

- **16-bit PCS tops out at ~1 stop of headroom** — internal 1.0 = XYZ 1.99997 via the
  32768/65535 scale. No HDR chain may round-trip through `icEncode16Bit`.
- **A sampled `curveType` TRC cannot express HDR linear light at all** — it clamps its
  output to 1.0. `parametricCurveType` clamps nothing. The two are **not** interchangeable
  above 1.0.
- iccDEV's `TiffImg::Create` hard-sets `SAMPLEFORMAT_UINT` and only promotes to IEEEFP at
  >= 32 bps, so 16-bit TIFF there can express neither above-diffuse-white nor negative
  extended-range PCS. That is the gap the module has to close on its own terms.

## 5. PAWG report — what changed, since profiletool uses it

**Verified empirically today**, both binaries run on the same profiles:

`iccPawgReport` check **C5** ("free of additional tags not required for profile class")
**false-positives on any profile carrying a `cicpTag`** in current master:

```
[WARN] C5   standard tags outside the local class rule table: 'cicp'
```

The HDR branch fixes it by adding `icSigCicpTag` (and `icSigHeadroomAdaptiveGainCurveTag`)
to `kCommonOptional` in `Tools/CmdLine/IccPawgReport/PawgReport.cpp`.

**This is not an HDR-only problem.** I proved it with a plain BT.709 SDR display profile
(`TransferCharacteristics="1"`, no HDR metadata, no HAGC): master warns, the branch says
`[OK]`. `cicpTag` is a v4.4 tag that has been on master a long time. So **profiletool users
see this false warning today** for any cicp-carrying profile — and it reads as "your
validator is wrong", not "my profile is wrong".

It has been handed to the iccDEV session as an independently-upstreamable fix
(`~/code/iccdev/docs/notes/2026-08-06-handback-iccdev-cicp-defects.md`, §6-9), so it should
reach master **without** waiting for the ballot. **Do not carry a local patch for it** —
wait for the upstream fix, or you will have to unpick it later.

### What PAWG does NOT do for HDR

Ran on three HDR fixtures (`HagcDisplay`, `HdrDisplayMetadata`, `HdrCicpUnspecified`), all
exit 0 and all conformance checks pass. But the report is **HDR-unaware**: it never
identifies the HDR Profile sub-class, never mentions the HAGC tag, and adds no HDR-specific
check. The branch change only stops it *false-warning*.

The reason is structural, and worth knowing before anyone files it as a bug: PAWG's rule
tables are keyed on the profile **class signature**, and an HDR Profile's class signature is
still `mntr`/`scnr`. `GetRuleTable()` cannot distinguish an HDR Profile without being handed
the whole profile. The 8.10.1 requirements are enforced instead in
`CIccProfile::CheckHdrProfile()`, which can see it. If profiletool wants HDR-aware
reporting, that is the API to reach for — not PAWG.

## 6. Also worth knowing

- **A second, unrelated `cicp` defect is live on master**: `CIccTagCicp`'s copy constructor
  has an empty body, so every copied `cicpTag` has four **uninitialized** fields. Reachable
  from Black Point Compensation (`IccApplyBPC.cpp:567` copies the whole profile; intent
  40/41/42 from the CLI). Handed to the iccDEV session, same note, §1-4. If profiletool ever
  copies a `CIccProfile`, it is exposed too.
- **The npm `iccdev` package is irrelevant to you.** WASM work this week added an
  `iccHdrFallback` smoke case to `Build/Cmake/wasm-package/test_all.js`. That is the
  `callMain` CLI delivery path; profiletool bypasses it entirely via typed embind wrappers.
  Nothing there needs consuming — noted only so nobody goes looking.
- **`iccHdrFallback` is a CLI tool, but the bake is library API.** `icAddHdrFallbackTags()`
  and `icCreateHdrFallbackAtoB/BtoA()` live in `IccHdrBake.h`, so profiletool can expose the
  bake through a new embind function without running any CLI.
- **Fixture coverage for the three transfers**: `HagcDisplay` = PQ, `HagcCommonParams` = HLG,
  `HagcHexData` = Linear (TC=8). The `BT2100*` fixtures are MPE-based, **not** matrix/TRC, so
  the baker correctly refuses them — do not use one as a happy-path test.
- **A dark channel beside two bright ones is unrecoverable through any B2A** — assert PCS
  closure, not device closure, in any round-trip test. This is a property of matrix
  inversion, not a defect.

## 7. Open, blocked on documents

- **SMPTE ST 2094-50:2026 not in hand.** Two seam functions are implemented from the
  proposal annex alone: PCHIP slope derivation (§C.3.9, a Fritsch-Carlson reconstruction,
  reported by `UsesDerivedSlopes()`) and Reference-White tone mapping (§C.3.8, reports
  unsupported by design).
- **ICC dictType Metadata Registry not in hand.** Clauses 8.10.4/8.10.5 make it
  authoritative for the HDR Image/Display key names *and* encodings. All reconstructions are
  marked `ASSUMED` in `IccHdrProfile.cpp` and feed no diagnostic. **This directly affects the
  TIFF/display-headroom work here** — the DCV composite encoding in particular is unverified.
- **18 proposal defects** found by implementing, registered in
  `~/code/iccdev/docs/notes/hdr-proposal-defects.md` and tagged in code as greppable
  `PROPOSAL-ISSUE` markers. Nothing raised with the ICC HDR WG yet. The two highest-value
  ones both mean "correct reading of the spec produces a wrong render, and it is not
  self-detecting": **HDR-01** (8.10.2 never says where light stops being in the transfer's
  own units and becomes reference-white-relative — ~49x off for PQ) and **WP-01** (the white
  paper's A-curve normalisation is self-contradictory; peak-normalised is the only
  consistent reading). If profiletool implements any of this independently, it will hit the
  same two gaps.
