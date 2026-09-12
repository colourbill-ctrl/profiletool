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
const isWebKitEngine = (ua, os) =>
  os === 'iOS' || (/\bAppleWebKit\//.test(ua) && !/\bChrome\/|\bChromium\/|\bFirefox\//.test(ua))

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
// research recommends, and it is flagged in Chrome — so an attempted configure is the
// only honest test. A thrown or ignored assignment means no.
function probeFloat16Canvas() {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d', { colorSpace: 'rec2100-pq', pixelFormat: 'float16' })
    if (!ctx) return false
    // Chrome silently ignores an unsupported colorSpace rather than throwing, so read
    // it back instead of trusting that the call succeeded.
    const got = ctx.getContextAttributes?.()
    return got ? got.colorSpace === 'rec2100-pq' && got.pixelFormat === 'float16' : false
  } catch { return false }
}

function probeWebGPU() {
  try { return typeof navigator !== 'undefined' && !!navigator.gpu } catch { return false }
}

/**
 * Observe the environment. Async because ImageDecoder.isTypeSupported is.
 * Returns a plain object — no DOM handles — so it can be logged, displayed, or passed
 * to capabilities.js, and so tests can construct one by hand.
 */
export async function detectEnvironment() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const { browser, os, majorVersion } = parseUserAgent(ua, navigator?.userAgentData)

  const [heic, avif, jxl] = await Promise.all([
    probeImageType('image/heic'),
    probeImageType('image/avif'),
    probeImageType('image/jxl'),
  ])

  return {
    browser, os, majorVersion,
    webkitEngine: isWebKitEngine(ua, os),
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
      webgpu: probeWebGPU(),
    },
    // Recorded so the Environment panel can say WHY, and so a bug report carries it.
    userAgent: ua,
  }
}
