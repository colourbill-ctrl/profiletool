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

Two more images carry **no** ICC profile. They exercise the **HDR tab**'s two display routes:

| File | What | Route in the HDR tab |
|---|---|---|
| `hdr-ramp-linear.exr` | OpenEXR, uncompressed FLOAT R/G/B, Rec.709/D65 `chromaticities`. 256×96. The top half is a grey ramp 0 → **4.926** (1000/203, the same luminances, with 1.0 = SDR white); the bottom half is pure R, G and B ramps | **profiletool** renders it: float16 canvas, WebGPU, or SDR fallback |
| `pq-ramp-cicp-16bit.png` | 16-bit PNG, the PQ ramp, tagged **`cICP`** (BT.2020 / PQ / RGB / full) and nothing else | **the browser** shows it; Chromium honours cICP |

## Real photographs — `polyhaven/`

Real captured scenes, **CC0** (public domain) from [Poly Haven](https://polyhaven.com/license),
downloaded 2026-09-13 at 1k (1024×512, equirectangular). Three are published as **both** a
Radiance `.hdr` and an OpenEXR `.exr` of the same capture, so `scripts/check-radiance-hdr.mjs`
checks profiletool's JS Radiance decoder against the iccimage WASM (tinyexr) decode of the EXR:
every pixel must agree to RGBE quantisation.

| File | Scene (author) | Peak × SDR white | Why |
|---|---|---|---|
| `christmas_photo_studio_01_1k.{hdr,exr}` | indoor studio lights (Sergej Majboroda) | ~3 700 | bright point sources in a dark room |
| `venice_sunset_1k.{hdr,exr}` | sunset over a city (Greg Zaal) | ~6 500 | sun disc, wide sky gradient |
| `moonless_golf_1k.{hdr,exr}` | night, artificial light (Greg Zaal) | ~10 900 | Photoshop-written `.hdr` with an all-zero `PRIMARIES` line |
| `rural_asphalt_road_1k.hdr` | midday sun, unclipped (Alexander Scholten) | — | `.hdr` only; the 1k EXR is 5.5 MB |

Their peaks are far beyond any display, so the HDR tab's clip note and **Fit to display** apply.
Use **Exposure** to bring the scene down. The EXRs use PIZ compression.

Source: `https://dl.polyhaven.org/file/ph-assets/HDRIs/{hdr,exr}/1k/<name>_1k.{hdr,exr}`.

SHA-256:
```
82950e69e235894bfa6bd8a62837b5f12993f51f67913b1ddf7d58290b546b13  christmas_photo_studio_01_1k.hdr
1837325154276986c4504152162985eb2f6e7f6eafcdbf07539699a3cc8e1a2f  christmas_photo_studio_01_1k.exr
92fe2b29b1957828fb8925a57633540bbba5bf380d9285ed553443e834249352  venice_sunset_1k.hdr
f4024910d8e03115ab26a3f620384f481073fc66300cdef8b85a72d9147129d3  venice_sunset_1k.exr
4f597078024bd81429431e872d466d8808653ad62a8bc8c61d8052af7466c3aa  moonless_golf_1k.hdr
452072b8b262bff5fb4799d3cecb85abb186ce9b658b25f328a1d66da6b18954  moonless_golf_1k.exr
fe0d56709df60ac5c6bda1b5dac35ec0a381060b49d38b82e3ac8802609d1afd  rural_asphalt_road_1k.hdr
```

## The HAGC ramp

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
