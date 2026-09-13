<!-- (c) 2026 William Li -->

# Decision note: how HDR images reach the screen — `DL-HDRDISP1`

**Status:** OPEN — recommendation below, awaiting approval. Written 2026-09-12 on `beta`.
**Question:** when a user drops an HDR image, by what route do its pixels reach the display in
HDR, with an SDR fallback and the SDR↔HDR A/B + analogue slider the Phase 2 plan asks for?
**Inputs:** `~/code/panelapp/HDR.md` (four pathways), `hdr-platform-capabilities.md`,
`DL-HDRENV1`, and new measurements below.

---

## 1. There are two jobs, not one

| Job | What is shown | Who does the colour maths |
|---|---|---|
| **J1 — show the file** | A browser-decodable HDR image as its own HDR rendering: AVIF, gain-map JPEG, and on Safari HEIC / JPEG XL | The browser |
| **J2 — show our pixels** | Pixels profiletool computed: **EXR** (no browser decodes it) and any image pushed through a profile — building an HDR profile from an image, Combine/pipeline image apply | profiletool |

panelapp's note already warns that *analysis paths and display paths cannot share a decode*.
The same split decides the route: J1 needs no pixel control, J2 needs nothing but.

## 2. What was measured (Chromium 149, headless, 2026-09-12)

Re-run with `node scripts/probe-hdr-canvas.mjs`.

| Probe | No flag | With `enable-experimental-web-platform-features` |
|---|---|---|
| CSS `dynamic-range-limit`: `standard`, `no-limit`, `constrained`, `dynamic-range-limit-mix()` | **all supported** | all supported |
| 2-D canvas `{ colorSpace: 'rec2100-pq', colorType: 'float16' }` | **throws** `TypeError` | works |
| PQ-tagged PNG (`cICP` 9/16/0/1, 0 → 1000 nits ramp) drawn in, read back as `srgb-linear` | — | 203 nits → **0.999**, 406 → 2.01, 1000 nits → **4.98** (expected 4.93) |
| EXR route: `srgb-linear` Float16 `ImageData` [0.5, 1, 2, 4] → PQ canvas → read back | — | **[0.496, 0.994, 1.984, 3.984]** |
| Browser-decoded 10-bit PQ **AVIF** drawn in | — | above-white values survive (top of ramp 3.35×); absolute level low because of our ffmpeg encode, not the canvas — the PNG isolates that |
| Same images into an ordinary 8-bit sRGB canvas | smooth roll-off, no hard clip | same |
| `HTMLCanvasElement.configureHighDynamicRange` (needed for WebGL2 HDR) | **absent** | present |
| WebGPU adapter (also with SwiftShader forced) | **none** | none — **not measurable headless** |

Three conclusions follow directly:
1. **`1.0 = SDR white = 203 nits`** in Chromium's HDR canvas, confirmed numerically rather than
   assumed. This is the same scale WebGPU's extended tone mapping uses (panelapp), so both J2
   backends can share one pixel convention.
2. **Browser-decoded HDR images keep their extended range when drawn into an HDR canvas.** So
   even J1 formats *could* go through a pixel path if analysis ever needs it.
3. **WebGL2 buys nothing:** its HDR switch sits behind the same flag as the float16 2-D canvas,
   and it costs a GPU context.

## 3. What is published (not measured here)

- `dynamic-range-limit`: **Chrome 136** (April 2025), **Safari 26.0** on iOS, iPadOS and macOS.
  Safari supports **only `standard` and `no-limit`**. `constrained` and `-mix()` are Chromium-only.
- WebGPU `toneMapping: { mode: 'extended' }`: **Chrome 129, no flag.**
- Safari 26 ships WebGPU and "HDR images … including images in WebGPU Canvas". Whether a
  **canvas configured `extended`** outputs HDR by default is **not documented**: a WebKit commit
  shows HDR canvas behind an "unstable" feature flag at some point. No 2-D HDR canvas is documented.
- Firefox: HDR *video* on Windows as of 153; HDR for **WebGL, WebGPU, Canvas2D and static images
  has no estimate** (Mozilla gfx blog, July 2026). Firefox remains an SDR target.

## 4. Per-target consequences

| Target | J1 HDR `<img>` | J1 A/B | J1 slider | J2 float16 canvas | J2 WebGPU extended |
|---|---|---|---|---|---|
| Chrome / Windows | ✔ | ✔ | ✔ (`-mix`) | flag | ✔ no flag, **if a real adapter** — verify on the user's laptop |
| Chrome / macOS | ✔ | ✔ | ✔ | flag | as above |
| Safari / iOS, macOS XDR | ✔ | ✔ | ✘ (no `-mix`) → A/B only | ✘ undocumented | **unverified** |
| Firefox (secondary) | SDR | ✘ | ✘ | ✘ | ✘ |

## 5. Recommendation

1. **J1 → native `<img>` plus `dynamic-range-limit`.** A/B is `standard` versus `no-limit`. The
   analogue slider is `dynamic-range-limit-mix(standard p%, no-limit (100−p)%)` where
   `CSS.supports` says so, otherwise the control degrades to the A/B toggle. This needs no pixel
   code, no flag, works on all three primary targets, and honours gain maps however the browser
   implements them, including ISO 21496-1, which we only detect. Nothing analytical ever reads
   from this decode.
2. **J2 → one `HdrSurface` interface with two backends,** selected by the existing
   `hdrPathway(env)` in `capabilities.js`, so the Environment panel and the renderer cannot disagree:
   - **(a) `float16-canvas` first.** It is `RasterCanvas` with a `Float16Array` `ImageData` in
     `srgb-linear` drawn into a `rec2100-pq` context — a small delta from code that exists, and
     **fully testable headless**, which is how every number above was obtained.
   - **(b) `webgpu` second, before beta evaluation.** Without it every Chrome user needs a flag for
     J2 HDR. It is the only unflagged route, so it cannot be skipped, but it cannot be built blind:
     its acceptance test is on the user's laptop.
   - **(c) SDR fallback:** an 8-bit canvas with **our own** tone map. We hold the floats, so we
     choose the operator, and the view says it is showing an SDR rendering.
   - Pixel convention for both backends: **1.0 = SDR white (203 nits)**, per §2.
3. **Rejected.**
   - **WebGL2:** same flag as (a), plus a GPU context.
   - **`<img>` for J2:** it cannot show computed pixels.
   - **WebGPU-only:** unmeasurable in CI, a much larger renderer, and Safari support unconfirmed.
   - **Canvas-only:** a flag on every target for J2.
4. **Do not tone-map to `hdrHeadroom`.** It is Chromium-only, flag-gated, and on Windows stale until
   Chrome re-reads the display (measured: `hdr-display-triggers-plan.md`). Show it; do not drive
   pixels from it. H_target stays user-supplied, as `DL-HDRENV1` constraint 4 says. That
   constraint's "headroom cannot be queried" is now true *except* Chromium-with-flag, and its
   conclusion stands.

## 6. Order of work if approved

1. **J1 viewer:** `<img>` with A/B, and a slider where supported, for dropped AVIF / gain-map JPEG
   (plus HEIC / JPEG XL when `capabilityFor` allows display). Refusals name the reason, per
   `DL-HDRENV1`.
2. **`HdrSurface` + float16-canvas backend,** first fed by **EXR**: `decodeExr` exists in the
   iccimage WASM but is not yet wired to any view.
3. **SDR fallback tone map** for J2 when `hdrPathway` is null.
4. **WebGPU backend**, then the user's device check below.
5. A/B and slider for J2 = SDR-fallback surface versus HDR surface, the same control as J1.

## 7. To measure on real devices (cannot be done headless)

- **Windows laptop, Chrome, no flag:**
  - WebGPU adapter present?
  - Does an `extended` canvas ramp visibly past white?
  - Does `<img>` + `dynamic-range-limit` A/B visibly change an HDR AVIF and a gain-map JPEG?
- **iPhone and Mac (Safari 26):**
  - The same `<img>` A/B.
  - WebGPU `extended` output.
  - Confirm no 2-D HDR canvas.
- **AVIF accuracy** with a clean encoder (`avifenc`). The PNG shows the canvas is accurate; the
  AVIF shortfall is attributed to our ffmpeg encode, which is **unverified**.

## Sources

- `~/code/panelapp/HDR.md`
- [Chrome 136 / Safari 26 `dynamic-range-limit` — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/dynamic-range-limit)
- [Intent to Ship: CSS dynamic-range-limit](https://groups.google.com/a/chromium.org/g/blink-dev/c/cG_ZCeQaWQs)
- [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [WebKit commit: make HDR canvas testable via Safari](https://www.mail-archive.com/webkit-changes@lists.webkit.org/msg220796.html)
- [What's New in WebGPU (Chrome 129)](https://developer.chrome.com/blog/new-in-webgpu-129)
- [Intent to Ship: WebGPU extended range (HDR)](https://groups.google.com/a/chromium.org/g/blink-dev/c/rBQIRHUEAe8)
- [MDN GPUCanvasContext.configure](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure)
- [Mozilla gfx: HDR video in Firefox for Windows (July 2026)](https://mozillagfx.wordpress.com/2026/07/14/hdr-video-in-firefox-for-windows-tech-retrospective/)
- [W3C ColorWeb-CG HDR canvas proposal](https://github.com/w3c-cg/ColorWeb-CG/blob/main/hdr_html_canvas_element.md)
