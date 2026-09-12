// (c) 2026 William Li
//
// Detect the browser environment: engine, platform, and what the DISPLAY can do.
//
// WHY THIS IS SPLIT FROM capabilities.js. This file only OBSERVES — it runs probes and
// reports what came back. capabilities.js decides what those observations permit. Keeping
// them apart is what makes the decision logic testable in Node with no browser: the tests
// hand capabilities.js a synthetic environment object rather than trying to fake a DOM.
//
// FEATURE-DETECT, DON'T SNIFF. Every capability question here is answered by an actual
// probe — `ImageDecoder.isTypeSupported`, `matchMedia`, an attempted canvas configure.
// The user-agent parse exists only to NAME the environment for the user ("this is Chrome
// on Windows"), never to decide what is allowed. A UA string attributes a reason; it does
// not establish a fact. See DL-HDRENV1.

// ── naming (for display only — never for gating) ────────────────────────────
function parseUserAgent(ua, uaData) {
  // navigator.userAgentData is the structured, non-spoofy form where it exists.
  const brands = uaData?.brands?.map((b) => b.brand) || []
  const pick = (...names) => names.find((n) => brands.some((b) => b.includes(n)))

  let browser = 'Unknown'
  // Order matters: Edge and Opera both contain "Chrome" in their UA string, and
  // Chrome-the-brand appears in every Chromium browser's brand list.
  if (/\bEdg\//.test(ua) || pick('Microsoft Edge')) browser = 'Edge'
  else if (/\bOPR\//.test(ua) || pick('Opera')) browser = 'Opera'
  else if (/\bFirefox\//.test(ua)) browser = 'Firefox'
  else if (/\bChrome\//.test(ua) || pick('Google Chrome', 'Chromium')) browser = 'Chrome'
  // Safari must be last: every WebKit and Chromium UA contains "Safari".
  else if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) browser = 'Safari'

  // Brave ships Chrome's UA string; navigator.brave is its own marker. It matters here
  // only because its flags page is brave://flags rather than chrome://flags.
  if (browser === 'Chrome' && typeof navigator !== 'undefined' && navigator.brave) browser = 'Brave'

  let os = 'Unknown'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/\b(iPhone|iPad|iPod)\b/.test(ua)) os = 'iOS'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Linux/.test(ua)) os = 'Linux'

  // iPadOS reports itself as a Mac. A Mac with touch points is an iPad.
  if (os === 'macOS' && (navigator.maxTouchPoints || 0) > 1) os = 'iOS'

  const v = /\b(?:Version|Firefox|Edg|OPR|Chrome)\/(\d+)/.exec(ua)
  return { browser, os, majorVersion: v ? Number(v[1]) : null }
}

// ── the WebKit question, answered without sniffing ──────────────────────────
// Every browser on iOS is WebKit underneath, so "Firefox on iPhone" has Safari's image
// support, not Firefox's. Gating on the brand would be wrong in both directions. This is
// the one place a UA-derived fact feeds a capability, and it is a fact about the ENGINE.
//
// Chromium is identified FIRST from navigator.userAgentData brands, which lists "Chromium"
// for every Chromium browser whatever it calls itself. The UA-string fallback matches
// `Chrome/` WITHOUT a word boundary: an earlier `\bChrome\/` missed "HeadlessChrome/", so
// headless Chromium was classed as WebKit — which hid the flags section and made the
// capability table claim it could display HEIC. Found by driving the real app in headless
// Chromium, not by reading the code.
function isWebKitEngine(ua, os, uaData) {
  if (os === 'iOS') return true
  const brands = uaData?.brands?.map((b) => b.brand) || []
  if (brands.includes('Chromium')) return false
  return /AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|Firefox\//.test(ua)
}

// ── probes ──────────────────────────────────────────────────────────────────
async function probeImageType(mime) {
  // ImageDecoder is the only DIRECT answer to "can this browser decode this format".
  // Where it is missing (Safari, at time of writing) the caller falls back to the
  // capability table's engine knowledge rather than guessing from the absence.
  try {
    if (typeof ImageDecoder === 'undefined' || !ImageDecoder.isTypeSupported) return null
    return await ImageDecoder.isTypeSupported(mime)
  } catch { return null }
}

function probeMedia(q) {
  try { return window.matchMedia(q).matches } catch { return null }
}

// Can a 2-D canvas hold brighter-than-white values? This is the pathway panelapp's
// research recommends, and it is flag-gated in Chrome — so an attempted configure is the
// only honest test.
//
// THE OPTION IS `colorType`, NOT `pixelFormat`. Measured in Chromium 149 with and without
// --enable-experimental-web-platform-features:
//   - without the flag, 'rec2100-pq' is not a valid PredefinedColorSpace and getContext
//     THROWS — so the colour space does not fail silently, the context does not exist;
//   - with the flag, { colorType: 'float16' } yields colorType "float16", while
//     { pixelFormat: 'float16' } is SILENTLY IGNORED and yields colorType "unorm8".
// `pixelFormat: 'rgba-float16'` is the ImageData option. An earlier version of this probe
// used pixelFormat on the canvas and so reported "no HDR canvas path" even with the flag
// on — exactly the trap panelapp's notes warn about.
function probeFloat16Canvas() {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d', { colorSpace: 'rec2100-pq', colorType: 'float16' })
    if (!ctx) return false
    // Read back rather than trust the call: an unknown option is ignored, not refused.
    const got = ctx.getContextAttributes?.()
    return got ? got.colorSpace === 'rec2100-pq' && got.colorType === 'float16' : false
  } catch { return false }
}

// Does this browser expose a screen's HDR headroom? Chromium ships it on ScreenDetailed as
// `hdrHeadroom` behind the same experimental flag (the open W3C proposal names it
// `headroom`, so accept both). Checked on the PROTOTYPE, which needs no permission prompt —
// actually reading a value would require getScreenDetails(). null when ScreenDetailed is
// not exposed at all (Firefox, Safari, or an insecure context), which is "cannot tell",
// not "no".
function probeScreenHdrHeadroom() {
  try {
    if (typeof ScreenDetailed === 'undefined') return null
    const P = ScreenDetailed.prototype
    return 'hdrHeadroom' in P || 'headroom' in P
  } catch { return null }
}

// Is WebGPU USABLE, not merely present? navigator.gpu exists wherever the API ships, but
// requestAdapter() resolves null when there is no usable GPU — blocklisted hardware, some
// VMs and drivers, headless runs. Checking only for the object reported an HDR route that
// could not work, and graded the flag "recommended" where it was actually "required".
// Bounded by a timeout so a stuck adapter request cannot hold up the whole panel.
async function probeWebGPU() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ])
    return !!adapter
  } catch { return false }
}

/**
 * Observe the environment. Async because ImageDecoder.isTypeSupported is.
 * Returns a plain object — no DOM handles — so it can be logged, displayed, or passed
 * to capabilities.js, and so tests can construct one by hand.
 */
export async function detectEnvironment() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const { browser, os, majorVersion } = parseUserAgent(ua, navigator?.userAgentData)

  const [heic, avif, jxl, webgpu] = await Promise.all([
    probeImageType('image/heic'),
    probeImageType('image/avif'),
    probeImageType('image/jxl'),
    probeWebGPU(),
  ])

  return {
    browser, os, majorVersion,
    webkitEngine: isWebKitEngine(ua, os, navigator?.userAgentData),
    // null means "could not be probed here", which is NOT the same as false and must not
    // be collapsed into it — the capability table treats the two differently.
    decode: { heic, avif, jxl },
    display: {
      // `dynamic-range: high` is the browser's own answer to "is there an HDR path to
      // this screen". It is necessary but not sufficient: it says nothing about how much
      // headroom, which cannot be queried at all (screen.colorInfo is unimplemented).
      hdr: probeMedia('(dynamic-range: high)'),
      videoHdr: probeMedia('(video-dynamic-range: high)'),
      p3: probeMedia('(color-gamut: p3)'),
      rec2020: probeMedia('(color-gamut: rec2020)'),
    },
    pathway: {
      float16Canvas: probeFloat16Canvas(),
      webgpu,
      screenHeadroom: probeScreenHdrHeadroom(),
    },
    // Recorded so the Environment panel can say WHY, and so a bug report carries it.
    userAgent: ua,
  }
}
