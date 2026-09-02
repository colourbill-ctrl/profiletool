# HDR Profiles — iccDEV work (pointer)

The HDR Profiles implementation (ICC v4.5 proposal set: HAGC tag, clause-8.10 HDR profile
sub-class, CICP ColourPrimaries=2, A2B0-from-HAGC baking) happens in **iccDEV**, not here.

- **Worktree:** `~/code/iccdev-hdr`, branch `hdr-profiles` (from `origin/master`).
- **Authoritative brief:** `~/code/iccdev-hdr/docs/notes/hdr-profiles-implementation-brief.md`
  (kept there so it sits beside the companion audit
  `2026-08-03-hdr-profile-proposal-gap-analysis.md` and stays out of the eventual PR diff).
  Single copy on purpose — this file is a pointer so the two can't drift.
- **Source proposals:**
  `/mnt/c/Users/colou/OneDrive/Documents/XYZ Lab Consulting/Color/HDR Profiles/`

## What profiletool needs to know

- Nothing HDR lands upstream in iccDEV until the ICC ballot passes and the owner green-lights
  it, so this is a private capability for now.
- To build profiletool's WASM against it, point `ICCDEV_ROOT` at `~/code/iccdev-hdr` instead of
  a clean-master worktree.
- profiletool's own HDR tranche — showing HDR tag info, creating HDR profiles, and applying them
  to images for display — is scoped separately and starts once the iccDEV side is usable. It
  depends on the `iccHdrFallback` WASM tool (tranche T4) and on the image-container work: 16-bit
  TIFF is `SAMPLEFORMAT_UINT`-only today and cannot express HDR values, which is called out as
  its own tranche in the iccDEV brief.
