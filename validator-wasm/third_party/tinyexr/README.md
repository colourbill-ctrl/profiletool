# tinyexr (vendored)

`tinyexr.h`, `exr_reader.hh`, `streamreader.hh` and `LICENSE` copied verbatim from
<https://github.com/syoyo/tinyexr> at release **v3.2.0**
(`6f470c9ab24bf3992bc512ce07e8ecb00d9bf105`, fetched 2026-09-12). BSD 3-Clause.

Pinned to a RELEASE TAG rather than master. Master was tried first and is no longer
single-header — it includes `exr_reader.hh`, which a "just copy tinyexr.h" vendoring
misses, and the build fails on a missing include rather than on anything meaningful.
v3.2.0 needs the same companions, so the full closure is vendored — computed by
following quoted includes transitively rather than by adding one file per failed
build, which is how the first two attempts went. The difference from master is that
a tag does not move underneath us. (`nanozlib.h` and `zfp.h` also appear in includes
but only under `TINYEXR_USE_NANOZLIB` / `TINYEXR_USE_ZFP`, which we leave off.)

**Why vendored rather than fetched at build time.** The release runbook builds from a
clean worktree with no network assumption, and libtiff/libxml2 are likewise vendored
sources under iccDEV's `third_party/`. A single header with no build system is the
cheapest possible dependency to pin this way.

**Why tinyexr and not OpenEXR.** EXR is a *pixel source* here — the format carries no
ICC profile at all (it signals colour through a `chromaticities` attribute), so what
we need from it is samples, not metadata. tinyexr is one header plus zlib, which we
already link; OpenEXR would bring Imath and a full CMake project for the same result.

**The trade-off, stated because it is a real gap:** tinyexr does not implement
**DWAA/DWAB** — the constants exist in the header marked "Not yet supported",
re-checked against v3.2.0 itself rather than assumed from master. It does
handle NONE, RLE, ZIP, ZIPS, PIZ, PXR24, B44 and B44A. A DWA-compressed EXR therefore
cannot be decoded by this build, and `decodeImage` reports that by name rather than
failing vaguely. If DWA files turn up in practice, OpenEXR replaces tinyexr behind the
same entry points.

Build config: `TINYEXR_USE_MINIZ=0` (we use the zlib already linked for libpng and
libtiff) and `TINYEXR_USE_THREAD=0` (no pthreads in this WASM build).
