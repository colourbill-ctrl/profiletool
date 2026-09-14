// (c) 2026 William Li
//
// HdrSurface — the ONE place pixels profiletool computed are put on screen (DL-HDRDISP1,
// job J2: OpenEXR today, profile-transformed images later). Three backends behind one
// interface, chosen by capabilities.hdrPathway() so the Environment panel and the renderer
// cannot disagree about which route is in use:
//
//   'float16-canvas'  2-D canvas { colorSpace: 'rec2100-pq', colorType: 'float16' }.
//                     Flag-gated in Chromium. Measured headless (scripts/probe-hdr-canvas.mjs):
//                     srgb-linear Float16 ImageData goes in and comes back within 1%, and
//                     1.0 = SDR white = 203 cd/m².
//   'webgpu'          rgba16float canvas with toneMapping 'extended'. The only UNFLAGGED HDR
//                     route in Chrome. NOT measurable headless (no adapter) — validated on
//                     real hardware only, so it reports what it can observe (the configured
//                     tone-mapping mode) rather than assuming.
//   'sdr'             plain 8-bit sRGB canvas. Input must already be tone-mapped to ≤ 1.0
//                     (hdrPixels.renderFloatRgba with limitStops 0); this backend only
//                     encodes.
//
// Every backend takes the SAME input: Float32Array RGBA, linear, sRGB/Rec.709 primaries,
// 1.0 = SDR reference white. Each backend owns its canvas element — a canvas that has
// handed out one context type can never give another — so callers render a fresh
// <canvas> per surface kind.
//
// FAILURE. draw() throws when it can tell synchronously that it cannot draw (an image larger
// than the GPU's texture limit). WebGPU reports most failures LATER, through error scopes and
// device loss, never by throwing — so those arrive through `onError`, and the caller steps
// down the fallback chain exactly as it would for a throw. Without that a WebGPU surface that
// failed would leave a black canvas still labelled "HDR".

import { encodeSrgb8 } from './hdrPixels.js'

/**
 * @param {HTMLCanvasElement} canvas  a canvas no context has been taken from
 * @param {'float16-canvas'|'webgpu'|'sdr'} kind
 * @param {{onError?: (message:string)=>void}} [opts]  asynchronous failures after creation
 * @returns {Promise<{kind:string, hdr:boolean, note:string|null, draw:(rgba:Float32Array,w:number,h:number)=>void, dispose:()=>void}>}
 *   `hdr` is whether this surface can carry values above 1.0 to the compositor at all.
 *   Throws when the backend cannot be created here; the caller falls back.
 */
export async function createHdrSurface(canvas, kind, opts = {}) {
  if (kind === 'float16-canvas') return createFloat16Canvas(canvas)
  if (kind === 'webgpu') return createWebGpu(canvas, opts)
  return createSdr(canvas)
}

// Fallback order when a backend throws. SDR never throws, so the chain always ends.
export const FALLBACK = { 'float16-canvas': 'webgpu', webgpu: 'sdr', sdr: null }

function createFloat16Canvas(canvas) {
  if (typeof Float16Array === 'undefined') throw new Error('Float16Array is not available')
  // Opt the element into extended-range compositing where the proposal's method exists
  // (present only with the flag). getContextAttributes() still reports toneMapping
  // 'standard' afterwards in Chromium 149 — panelapp noted the same, untested whether that
  // is a stale attribute — so this is best-effort, not asserted.
  try { canvas.configureHighDynamicRange?.({ mode: 'extended' }) } catch { /* optional */ }
  const ctx = canvas.getContext('2d', { colorSpace: 'rec2100-pq', colorType: 'float16' })
  const attrs = ctx?.getContextAttributes?.()
  if (!ctx || attrs?.colorType !== 'float16' || attrs?.colorSpace !== 'rec2100-pq') {
    throw new Error('float16 rec2100-pq canvas context not granted')
  }
  let f16 = null   // reused across frames of the same size
  return {
    kind: 'float16-canvas', hdr: true, note: null,
    draw(rgba, w, h) {
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      if (!f16 || f16.length !== rgba.length) f16 = new Float16Array(rgba.length)
      f16.set(rgba)   // values above 1.0 are preserved
      ctx.putImageData(new ImageData(f16, w, h, { pixelFormat: 'rgba-float16', colorSpace: 'srgb-linear' }), 0, 0)
    },
    dispose() { f16 = null },
  }
}

function createSdr(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2-D canvas unavailable')
  let u8 = null    // reused across frames of the same size
  return {
    kind: 'sdr', hdr: false, note: null,
    draw(rgba, w, h) {
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      u8 = encodeSrgb8(rgba, u8)
      ctx.putImageData(new ImageData(u8, w, h), 0, 0)
    },
    dispose() { u8 = null },
  }
}

// WGSL: a full-screen triangle; the fragment shader reads the texel under the pixel
// (canvas size == image size, so no filtering) and applies the sign-extended sRGB transfer
// function. A 'srgb' canvas in rgba16float expects ENCODED values; linear input written
// directly would render too dark. Values above 1.0 stay above 1.0 after encoding, which is
// what 'extended' tone mapping then passes through to an HDR display.
const WGSL = /* wgsl */ `
@group(0) @binding(0) var img: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}
fn enc(v: f32) -> f32 {
  let a = abs(v);
  let e = select(1.055 * pow(a, 1.0 / 2.4) - 0.055, 12.92 * a, a <= 0.0031308);
  return sign(v) * e;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = textureLoad(img, vec2i(pos.xy), 0);
  return vec4f(enc(c.r), enc(c.g), enc(c.b), 1.0);
}`

async function createWebGpu(canvas, { onError } = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is not available')
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('no WebGPU adapter')
  const device = await adapter.requestDevice()
  let disposed = false
  // Reported once: after the first failure the caller replaces this surface.
  let reported = false
  const report = (message) => {
    if (disposed || reported) return
    reported = true
    onError?.(message)
  }
  // Loss is asynchronous and also resolves on our own destroy(); `disposed` filters that out.
  device.lost?.then((info) => report(`the GPU device was lost${info?.message ? ` (${info.message})` : ''}`))

  // Everything after requestDevice can throw; the device must not outlive a failed setup.
  let ctx, noteCode, note, applied, extended, layout, pipeline
  try {
    ctx = canvas.getContext('webgpu')
    if (!ctx) throw new Error('webgpu canvas context not granted')
    ctx.configure({ device, format: 'rgba16float', colorSpace: 'srgb', toneMapping: { mode: 'extended' }, alphaMode: 'opaque' })
    // Report the mode the browser actually applied. A browser without extended tone
    // mapping ignores the member and clamps to SDR; saying "HDR" then would be false.
    applied = ctx.getConfiguration?.()?.toneMapping?.mode
    extended = applied === 'extended'
    // `note` is English for logs; `noteCode` (+ `noteMode`) is what the UI translates.
    noteCode = extended ? null : applied ? 'webgpu_clamped' : 'webgpu_unconfirmed'
    note = extended ? null
      : applied ? `WebGPU applied tone mapping '${applied}', so output is clamped to SDR`
      : 'this browser does not report the applied WebGPU tone mapping; HDR output is unconfirmed'

    const module = device.createShaderModule({ code: WGSL })
    layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }],
    })
    pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    })
  } catch (e) {
    disposed = true
    try { device.destroy() } catch { /* already gone */ }
    throw e
  }

  // The device's real limit (8192 unless the adapter granted more at request time).
  const maxDim = device.limits?.maxTextureDimension2D || 8192
  let texture = null
  return {
    kind: 'webgpu', hdr: extended || applied === undefined, note, noteCode, noteMode: applied ?? null,
    draw(rgba, w, h) {
      if (w > maxDim || h > maxDim) {
        throw new Error(`the image (${w}×${h}) is larger than this GPU's ${maxDim}-pixel texture limit`)
      }
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      // Validation and allocation errors surface here, asynchronously, not as throws.
      device.pushErrorScope('out-of-memory')
      device.pushErrorScope('validation')
      if (!texture || texture.width !== w || texture.height !== h) {
        texture?.destroy()
        texture = device.createTexture({ size: [w, h], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
      }
      device.queue.writeTexture({ texture }, rgba, { bytesPerRow: w * 16 }, [w, h])
      const bind = device.createBindGroup({ layout, entries: [{ binding: 0, resource: texture.createView() }] })
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      })
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end()
      device.queue.submit([enc.finish()])
      const check = (err) => { if (err) report(`WebGPU could not draw the image: ${err.message}`) }
      device.popErrorScope().then(check, () => {})
      device.popErrorScope().then(check, () => {})
    },
    dispose() {
      disposed = true
      texture?.destroy(); texture = null
      try { device.destroy() } catch { /* already gone */ }
    },
  }
}
