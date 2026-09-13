#!/usr/bin/env node
// (c) 2026 William Li
//
// Re-runs the measurements behind DL-HDRDISP1 (hdr-display-pathway-decision.md §2) in real
// headless Chromium, with and without --enable-experimental-web-platform-features:
//   - CSS dynamic-range-limit keywords and -mix() support;
//   - whether the float16 rec2100-pq 2-D canvas exists;
//   - SCALE: a PQ-tagged (cICP) 16-bit PNG ramp, browser-decoded and drawn in, read back as
//     srgb-linear — 203 nits must come back as 1.0 (SDR white);
//   - the EXR ROUTE: srgb-linear float16 ImageData in, the same values out.
// Needs no GPU. WebGPU cannot be measured headless (no adapter), so it is not probed here.
//
// Playwright is not a profiletool dependency; set PLAYWRIGHT to its index.mjs, or it falls
// back to the sibling chardata install (same convention as sync-translations.mjs for xlsx).

import zlib from 'node:zlib'

const PW = process.env.PLAYWRIGHT || '/home/colour/code/chardata/node_modules/playwright/index.mjs'
const { chromium } = await import(PW)

// ── build the test image: 256×64 16-bit RGB PNG, PQ code values, cICP BT.2020 / PQ / RGB / full ──
const pq = (nits) => {
  const m1 = 2610 / 16384, m2 = 2523 / 4096 * 128, c1 = 3424 / 4096, c2 = 2413 / 4096 * 32, c3 = 2392 / 4096 * 32
  const y = Math.max(nits, 0) / 10000
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
}
const W = 256, H = 64
// 0 → 203 nits (SDR white) at x=128 → 1000 nits at x=255.
const nitsAt = (x) => (x <= 128 ? 203 * x / 128 : 203 + (1000 - 203) * (x - 128) / (W - 1 - 128))
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), crc = Buffer.alloc(4)
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const raw = Buffer.alloc(H * (1 + W * 6))
for (let y = 0; y < H; y++) {
  const o = y * (1 + W * 6)
  for (let x = 0; x < W; x++) {
    const v = Math.round(pq(nitsAt(x)) * 65535)
    for (let ch = 0; ch < 3; ch++) raw.writeUInt16BE(v, o + 1 + x * 6 + ch * 2)
  }
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr.set([16, 2, 0, 0, 0], 8)
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('cICP', Buffer.from([9, 16, 0, 1])), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])

const XS = [0, 64, 128, 160, 192, 224, 255]
const EXPECT = XS.map((x) => nitsAt(x) / 203)
const EXR_IN = [0.5, 1, 2, 4]

let failed = 0
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? '  — ' + detail : ''}`) }
// 3% relative (or 0.01 absolute near black): float16 + PQ quantisation measured ≤ 1.2%.
const close = (a, b) => Math.abs(a - b) <= Math.max(0.01, 0.03 * Math.abs(b))

for (const [label, args] of [['no flag', []], ['flag', ['--enable-experimental-web-platform-features']]]) {
  const browser = await chromium.launch({ args })
  const page = await browser.newPage()
  await page.setContent('<!doctype html><body></body>')
  const r = await page.evaluate(async ({ b64, xs, exrIn }) => {
    const out = {
      drl: ['standard', 'no-limit', 'constrained', 'dynamic-range-limit-mix(standard 50%, no-limit 50%)']
        .map((v) => CSS.supports('dynamic-range-limit', v)),
      configureHDR: typeof HTMLCanvasElement.prototype.configureHighDynamicRange === 'function',
    }
    const mk = (w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      return c.getContext('2d', { colorSpace: 'rec2100-pq', colorType: 'float16' })
    }
    try { mk(1, 1) } catch (e) { out.pqCanvas = e.name; return out }
    out.pqCanvas = 'ok'
    const read = (ctx, w, y, space) => ctx.getImageData(0, y, w, 1, { pixelFormat: 'rgba-float16', colorSpace: space }).data
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const ctx = mk(256, 64)
    ctx.drawImage(await createImageBitmap(new Blob([bytes], { type: 'image/png' })), 0, 0)
    const lin = read(ctx, 256, 32, 'srgb-linear')
    out.pngLinear = xs.map((x) => lin[x * 4])
    const f = new Float16Array(exrIn.length * 4)
    exrIn.forEach((v, i) => { f[i * 4] = f[i * 4 + 1] = f[i * 4 + 2] = v; f[i * 4 + 3] = 1 })
    const c2 = mk(exrIn.length, 1)
    c2.putImageData(new ImageData(f, exrIn.length, 1, { pixelFormat: 'rgba-float16', colorSpace: 'srgb-linear' }), 0, 0)
    const back = read(c2, exrIn.length, 0, 'srgb-linear')
    out.exrOut = exrIn.map((_, i) => back[i * 4])
    return out
  }, { b64: png.toString('base64'), xs: XS, exrIn: EXR_IN })

  console.log(`── ${label}`)
  check(`${label}: dynamic-range-limit standard / no-limit / constrained / mix supported`, r.drl.every(Boolean), JSON.stringify(r.drl))
  if (label === 'no flag') {
    check('no flag: float16 rec2100-pq canvas throws', r.pqCanvas === 'TypeError', r.pqCanvas)
    check('no flag: configureHighDynamicRange absent (WebGL2 HDR gated too)', r.configureHDR === false)
  } else {
    check('flag: float16 rec2100-pq canvas available', r.pqCanvas === 'ok', r.pqCanvas)
    check('flag: configureHighDynamicRange present', r.configureHDR === true)
    const fmt = (a) => JSON.stringify(a?.map((v) => +v.toFixed(3)))
    check('flag: PQ PNG → srgb-linear: 203 nits reads 1.0 (SDR white)', close(r.pngLinear[2], 1), fmt(r.pngLinear))
    check('flag: PQ PNG → srgb-linear matches nits/203 across the ramp (above white survives)',
      r.pngLinear.every((v, i) => close(v, EXPECT[i])), `expected ${fmt(EXPECT)}`)
    check('flag: EXR route srgb-linear [0.5,1,2,4] round-trips', r.exrOut.every((v, i) => close(v, EXR_IN[i])), fmt(r.exrOut))
  }
  await browser.close()
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
