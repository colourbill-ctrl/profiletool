# Plan: refresh HDR display info when the window changes monitor

**Status:** IMPLEMENTED 2026-09-12 on branch `beta`; manual two-monitor check (§7) DONE the same day.

**Real-hardware results (user's Windows laptop: built-in HDR panel, dpr 2, reports an empty
label + external SDR "H32T13 " monitor, dpr 1; Chrome with the experimental flag):**
- Trigger (1): every drag flipped `dynamic-range`, `video-dynamic-range`, `color-gamut-p3`
  and `resolution` together, coalesced into one log entry per move. ✔
- Trigger (2): after Identify, `currentscreenchange` joined those same entries; headroom
  followed the window (0 on the SDR monitor, 0.97–1.55 on the HDR panel). ✔
- The flip happens **partway across** the boundary, not at the edge — consistent with
  "largest intersecting area" as the current screen. ✔
- **Brightness keys do NOT update `hdrHeadroom` — a Chromium limitation, not ours.**
  `ui/display/win/screen_win.cc` re-reads the SDR white level (`GetSDRWhiteLevel`) only on
  `WM_DISPLAYCHANGE`, `WM_ACTIVATEAPP`, `WM_SETTINGCHANGE/SPI_SETWORKAREA`, colour-profile or
  DXGI-info changes; a brightness key sends none. Blink updates the value and queues the
  events in the same step (`screen_details.cc`), so a page-side poll cannot see a newer
  value either. Two mid-session updates without a move are most likely `WM_ACTIVATEAPP`
  (Chrome re-activated) — unconfirmed; test: change brightness, Alt-Tab away and back.
- **Unit settled from source:** `ScreenDetailed::hdrHeadroom()` =
  `log2(max(HDRMaxLuminanceRelative, 1))` — stops, floored at 0. Observed 0.97 / 1.35 /
  1.55 ≈ 1.96× / 2.55× / 2.92× SDR white.
- Proposed follow-ups (awaiting the user): show stops + ≈× SDR white and a Windows refresh
  caveat in place of "unit not standardised"; trim monitor labels; optional Chromium bug
  report for stale headroom on brightness change.

**TO VERIFY items, as measured in Chromium 149 (headless):**
- `navigator.permissions.query({ name: 'window-management' })` works without prompting
  (`'prompt'` by default); `'window-placement'` throws `TypeError`.
- Playwright's `grantPermissions` rejects `window-management` as unknown. CDP
  `Browser.grantPermissions({ permissions: ['windowManagement'] })` works, but only in a
  **persistent** context (a `newContext()` grant silently does not apply).
- `hdrHeadroom` is `0` on headless's SDR screen with the flag and absent without it. A linear
  ratio would read 1.0 for SDR, so the unit is probably not a ratio — but that is one
  observation, so the UI shows the value raw and says the unit is unstandardised.
- Harness notes: CDP cannot emulate `dynamic-range` (the query stays false). A
  `setDeviceMetricsOverride` scale change updates `devicePixelRatio` at once but the
  `resolution` query's `change` event is delivered only at the next media re-evaluation,
  which headless does not run on its own; re-sending `setEmulatedMedia` forces it.
**Scope:** triggers (1) and (2) from the multi-monitor investigation. Headroom (3) is wired
in opportunistically through (2) where the browser exposes it. **Do not push** — see §8.

---

## 1. The problem, as it stands in code

`EnvironmentPanel.jsx` calls `detectEnvironment()` (`frontend/src/lib/environment.js`)
**once, on mount**. Drag the browser window from an SDR monitor to an HDR one and the panel
still shows the first monitor. Nothing refreshes.

**Only the display block can change between monitors** — re-probe that, not everything:

| Changes with monitor | Does NOT change with monitor |
|---|---|
| `display.hdr` / `videoHdr` (`dynamic-range`, `video-dynamic-range`) | codec support (`decode.*`, ImageDecoder) |
| `display.p3` / `rec2020` (`color-gamut`) | `pathway.float16Canvas` (a browser capability) |
| `devicePixelRatio` | `pathway.webgpu` adapter, `pathway.screenHeadroom` (API presence) |
| screen HDR **headroom value** (when exposed) | browser / os / engine |

## 2. Verified facts this plan rests on

All checked during the investigation; sources at the end.

- **CSSOM View**: a `MediaQueryList` `change` event fires whenever its matches state changes
  **for any reason**, during the rendering update — which includes moving to another display.
- **Chrome** resolves `dynamic-range` against **the display the window is currently on**.
- **"Current screen" is implementation-defined** — the W3C Window Management spec gives
  "the screen with the largest area intersecting the window" as the example. So the switch
  happens when the window is mostly across, not when it crosses the edge.
- **Window Management API**: `window.getScreenDetails()` needs the **`window-management`**
  permission (prompt; rejects `NotAllowedError` if denied), a **secure context**
  (`http://127.0.0.1`/`localhost` count), **Chromium only**. `ScreenDetails` fires
  **`currentscreenchange`** when the window moves to another screen or when a basic/advanced
  observable property of the current screen changes. `ScreenDetailed` exposes `label`,
  `devicePixelRatio`, `isPrimary`, `isInternal`, `left`, `top`, `availLeft`, `availTop` —
  **no HDR or colour attributes in the spec**.
- **Headroom**: Chromium ships `ScreenDetailed.hdrHeadroom` + `onhdrheadroomchange`, Blink
  feature `ScreenDetailedHdrHeadroom`, status **experimental** →
  `chrome://flags/#enable-experimental-web-platform-features`. Measured in Chromium 149:
  `'hdrHeadroom' in ScreenDetailed.prototype` is true **only** with the flag. The open spec
  PR (w3c/window-management#150) names it `headroom` / `onheadroomchange` — **accept both**.
  The legacy `highDynamicRangeHeadroom` (Blink `CanvasHDR`) is marked obsolete — do not use.
- **Safari**: WebKit bug 254489 is fixed — `dynamic-range: high` reflects real HDR photo
  support (iOS 26). Multi-display behaviour on macOS Safari is **undocumented**.
- **Headless Chromium cannot simulate two monitors.** Real validation needs the user's
  two-monitor Windows machine.

## 3. Design

### New module: `frontend/src/lib/displayWatcher.js`

Browser-side, the counterpart to `environment.js` (which OBSERVES) — this one SUBSCRIBES.
Keep `capabilities.js` pure and untouched in principle; it already takes an env object.

```js
// Trigger (1): always on, no permission. Returns unsubscribe.
export function watchDisplay(onChange, { matchMedia = window.matchMedia.bind(window) } = {})

// Trigger (2): opt-in. MUST be called from a user gesture (it may prompt).
// Resolves { ok, reason, details } and starts forwarding currentscreenchange
// (and headroom changes) to onChange. Returns unsubscribe on success.
export async function watchScreenDetails(onChange, { getScreenDetails = window.getScreenDetails } = {})

// Pure helper so the display block can be re-read cheaply without re-running codec probes.
export function readDisplay({ matchMedia })   // → { hdr, videoHdr, p3, rec2020, dpr }
```

Injectable `matchMedia` / `getScreenDetails` are what make the coalescing logic unit-testable
in Node with fakes (§6).

### Trigger (1) — media-query listeners (baseline, always on)

- Subscribe `change` on: `(dynamic-range: high)`, `(video-dynamic-range: high)`,
  `(color-gamut: p3)`, `(color-gamut: rec2020)`.
- **devicePixelRatio**: subscribe `(resolution: ${devicePixelRatio}dppx)`, and on its change
  **re-create the query at the new ratio** — it only reports leaving the value it was made for.
- Fires only when a result actually differs between monitors. Two monitors identical in HDR,
  gamut and DPR produce no event — that is the case (2) exists for.

### Trigger (2) — `getScreenDetails()` (opt-in upgrade)

- UI: an **"Identify displays"** button in the Environment panel. The permission prompt must
  come from a user gesture, and headroom is a fingerprinting vector — so never on load.
- **If already granted, attach without a prompt**: check
  `navigator.permissions.query({ name: 'window-management' })` first. **TO VERIFY on "go"**:
  that the permission name is queryable in Chromium 149 (older builds used
  `window-placement`) — wrap in try/catch and treat failure as "not granted".
- On `currentscreenchange`: re-read the display block **and rebind** the headroom listener.

### Headroom (3), through (2)

- Read from `screenDetails.currentScreen`: `hdrHeadroom ?? headroom` (whichever exists).
- Listen `hdrheadroomchange` / `headroomchange` on **the current `ScreenDetailed` only**.
- **Rebind on every `currentscreenchange`** — a listener left on the previous screen keeps
  reporting the monitor the window just left.
- Headroom moves with screen brightness: **debounce** (~250 ms) before re-rendering.
- **TO VERIFY on "go"**: units/range of the value (do not assume log2 vs ratio — read it on
  the user's display and state what was observed).

### Integration rules (the part that makes (1) and (2) coexist)

1. **Coalesce.** One drag can fire media-query changes AND `currentscreenchange`, in
   different ticks. Every trigger calls one `schedule()` that collapses bursts into a single
   re-read (`requestAnimationFrame` + trailing debounce), and the re-read reads **fresh**
   state — never trust event order or payloads.
2. **Re-read only the display block** (§1), merge into the existing env object, re-render.
3. **Degrade silently.** Denied permission, Safari, Firefox, insecure context → (1) keeps
   working; the button explains why (2) is unavailable rather than failing.
4. **Unsubscribe on unmount** — both triggers, all listeners, the headroom rebind.
5. `capabilityMatrix()` / `browserFlags()` recompute from the merged env — no new logic there.

### UI additions (Environment panel)

- Facts gain **current monitor** (label, primary/internal, DPR) and **HDR headroom** — shown
  only when (2) is active; otherwise the existing "browsers cannot report headroom" note stays.
- **"Identify displays"** button with states: available / granted / denied / unsupported.
- **Live event log** (collapsible, capped ~20 lines): timestamp, trigger source
  (`media:dynamic-range`, `currentscreenchange`, `hdrheadroomchange`, …), and the resulting
  hdr/gamut/DPR/headroom. This is the diagnostic the user asked for: drag between the two
  Windows monitors and watch which events fire. Collapsed by default.
- New chrome strings → **all 12 locales** in `i18n.jsx`, then `node scripts/sync-translations.mjs`.

## 4. Order of work on "go"

1. `displayWatcher.js` with trigger (1) + `readDisplay` + coalescing scheduler.
2. Unit tests with fake MediaQueryList / ScreenDetails (§6) — green before any UI.
3. Wire (1) into `EnvironmentPanel` (subscribe/unsubscribe, merge, re-render).
4. Trigger (2) + permission pre-check + headroom rebind, behind the button.
5. Event log + new facts + i18n (12 locales) + translation regen.
6. Browser test (§6), build, commit on `beta`.
7. Hand the user the manual two-monitor test script (§7).

## 5. Files

| File | Change |
|---|---|
| `frontend/src/lib/displayWatcher.js` | **new** |
| `frontend/src/components/EnvironmentPanel.jsx` (+ `.module.css`) | subscribe, merge, button, facts, log |
| `frontend/src/lib/environment.js` | export the display-block readers for reuse (no behaviour change) |
| `frontend/src/i18n.jsx`, `translations/*.xlsx` | new keys, 12 locales |
| `scripts/check-display-watcher.mjs` | **new** unit tests |
| `hdr-phase1-status.md` | record the feature under Phase 2 when done |

## 6. Testing

**Unit (Node, no browser)** — `scripts/check-display-watcher.mjs` with fakes:
- a fake MQL whose `matches` can be flipped and `change` dispatched → callback fires once;
- a burst of 4 MQL changes + 1 `currentscreenchange` in quick succession → **one** re-read;
- the resolution query is **re-created** at the new DPR after it fires;
- headroom listener **moves** to the new current screen on `currentscreenchange`, and the old
  screen's `headroomchange` no longer triggers;
- both `hdrHeadroom` and `headroom` property names accepted;
- permission denied / `getScreenDetails` missing → `watchScreenDetails` resolves
  `{ ok: false, reason }` and trigger (1) is unaffected;
- unsubscribe removes every listener (fakes count their listeners).

**Browser (headless Chromium via Playwright)** — cannot simulate monitors, so test wiring:
- listeners attach on mount and detach on unmount;
- dispatching a synthetic `change` on the page's own MediaQueryList updates the panel;
- the button reports "unsupported"/"denied" correctly. **TO VERIFY**: whether Playwright can
  grant `window-management` (`context.grantPermissions`); if not, assert the denied path only.

Tooling notes from this session: Playwright + cached Chromium live in
`/home/colour/code/chardata/node_modules/playwright/index.mjs`; run a dev server with
`npx vite --port 5199 --strictPort --host 127.0.0.1` from `frontend/`; stop it by port
(`kill $(lsof -t -i tcp:5199 -sTCP:LISTEN)`) — `pkill -f` matches its own shell.

## 7. Manual validation (user, two-monitor Windows)

Hand over as a short checklist after the build:
1. Chrome, `chrome://flags/#enable-experimental-web-platform-features` = Enabled (for headroom).
2. Windows Settings → Display: note which monitor has **Use HDR** on.
3. Open profiletool, Settings blade → Environment, expand the event log.
4. Drag the window fully onto the other monitor; note which events fire and whether
   HDR display flips. Repeat without clicking "Identify displays", then with it.
5. Change brightness on the HDR monitor; note `hdrheadroomchange` and the value.
6. Report back: events seen, values, and whether the flip happened at the edge or mid-window.

## 8. Constraints carried over

- Branch `beta`, local only. **Never push until the user says so.** `main` stays at the
  published v2.3.0 (`c37d414`).
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` +
  `Claude-Session: https://claude.ai/code/session_01KyeyuyKaCpLNbSR2GQQh3Q`.
- Refusals and unknowns must be stated as such — never a confident wrong value (the
  through-line of the HDR tranche). `null` from a probe = "cannot tell", not `false`.
- Verify claims in a real browser before reporting them; this session found 4 bugs that
  passed the build.

## Sources

[CSSOM View: media query change events](https://drafts.csswg.org/cssom-view/#evaluate-media-queries-and-report-changes) ·
[W3C Window Management](https://w3c.github.io/window-management/) ·
[MDN currentscreenchange](https://developer.mozilla.org/docs/Web/API/ScreenDetails/currentscreenchange_event) ·
[Chrome intent to ship HDR media queries](https://groups.google.com/a/chromium.org/g/blink-dev/c/OpUsOWnnN6c) ·
[w3c/window-management#149](https://github.com/w3c/window-management/issues/149) / [PR #150](https://github.com/w3c/window-management/pull/150) ·
[Chromium screen_detailed.idl](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/screen_details/screen_detailed.idl) ·
[WebKit bug 254489](https://bugs.webkit.org/show_bug.cgi?id=254489)
