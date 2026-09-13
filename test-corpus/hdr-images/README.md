<!-- (c) 2026 William Li -->

# HDR test images — an HDR Profile embedded in ordinary image files

Three copies of one picture, each with **`test-corpus/hdr/HagcDisplay.icc` embedded**. That
profile is an ICC.1 clause 8.10 conforming HDR Display profile: PQ transfer via `cicpTag`, no
TRC tags, an `AToB0Tag`/`BToA0Tag` pair, and a `headroomAdaptiveGainCurveTag` (HAGC) with two
alternate images.

| File | Container | Samples | Codec path exercised |
|---|---|---|---|
| `hagc-pq-ramp-16bit.tif` | TIFF, ZIP | 16-bit RGB | libtiff |
| `hagc-pq-ramp-16bit.png` | PNG, `iCCP` | 16-bit RGB | libpng |
| `hagc-pq-ramp-8bit.jpg` | JPEG, APP2 `ICC_PROFILE` | 8-bit RGB | libjpeg |

**Pixels:** a 512×128 grey ramp of PQ code values — 0 cd/m² at the left, **203 cd/m² (SDR
reference white) at the centre**, 1000 cd/m² at the right.

## What to do with them

Drop one on the **Profile** tab (or pick it with the file dialog). profiletool extracts the
embedded profile without decoding the pixels and loads it as `…(embedded)`:
- **PAWG report** — section H present; H1 reports a conforming HDR Profile.
- **Tags → `headroomAdaptiveGainCurveTag`** — the gain curve graph.
- **Compare / Combine** — the "showing the SDR fallback" note.

profiletool does **not** yet display HDR pixels (`DL-HDRDISP1` in `parity-roadmap.md`), and no
browser renders these as HDR either: here HDR is signalled by the ICC profile, not by cICP or a
gain map, and browsers do not honour ICC-signalled PQ. On screen they would look like a dim,
flat grey ramp — that is expected.

## Regenerating

```bash
node test-corpus/hdr-images/make-hdr-images.mjs
```

The generator encodes with profiletool's own iccimage WASM, then checks every file before
passing: `findProfile` must return exactly the 956 bytes of `HagcDisplay.icc` (SHA-256 prefix
`59adffe166990370`), and the ramp must decode back exactly (TIFF, PNG) or within ±4 code values
(JPEG). A refreshed `HagcDisplay.icc` changes the embedded bytes, so re-run it after a corpus
refresh.
