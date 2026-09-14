<!-- (c) 2026 William Li -->

# ICC Profile Tool — User Manual

**ICC Profile Tool** (profiletool) is a browser-based tool for inspecting, validating, and round-trip editing **ICC.1** and **ICC.2 (iccMAX)** colour profiles. It runs entirely in your browser — no upload, no install — using a WebAssembly build of [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), the ICC's official demo implementation of IccProfLib.

**What you can do:**

- **Browse the header** — every field of the 128-byte profile header, decoded into human-readable strings.
- **Browse the tag directory** — every tag with its signature, type, byte offset, size, and pad bytes. Click any tag to expand a full type-specific description (the same output as the iccDEV `wxProfileDump` "Describe" view), and — for tags that carry one — an inline **visualization**: tone-response curves, chromaticity charts, CLUT and gamut images, named-colour scatters, plus a single-point **transform evaluator**.
- **Validate** — run the ICC Profile Assessment Working Group checklist (Security / Conformance / Quality), each check with a verdict, filterable by category.
- **Round-trip edit** — convert the profile to XML or JSON, edit it in the built-in code editor, convert back to ICC, and re-validate. The save button downloads the edited binary.
- **Chain profiles** — in the **Combine** tab, drag pooled profiles into an ordered chain, then bake it into a **DeviceLink**, **transform an image** through it (with full control over output encoding, compression, planar layout and ICC embedding), or **transform a colour dataset**.
- **Work with HDR** — check a profile against the ICC.1 HDR Profile rules (clause 8.10), read its cICP code points, and plot its adaptive gain curve at any display headroom. The **HDR** tab shows one HDR image on your display, and **Settings → Environment** reports what this browser and display can do.
- **Launch from chardata** — open a profile that's loaded in [chardata](https://chardata.colourbill.com/) directly here, with the bytes handed over in-browser via `postMessage`.
- **Launch with a URL** — open a link that points the tool at a profile hosted on the web and, optionally, the tab to land on (e.g. `…/profiletool#url=…&tab=VAL`).

Everything runs client-side. Profile bytes never leave the browser tab.

<div class="note">
<strong>ICC.2 (iccMAX) support is partial.</strong> ICC.2 profiles load, inspect, validate and round-trip like ICC.1 ones — the validation checklist includes iccMAX-specific checks, spectral PCS and multi-processing-element tags are decoded, and the transform engines are built against the full iccMAX stack. Not yet covered: multi-part <strong>ICS</strong> (Interchange Color Space) workflows, selecting a V5 <em>sub-profile</em> when applying a transform, and inverse search on some ICC.2 profiles. Expect gaps on the more exotic ICC.2 features; they are being filled release by release.
</div>

<div class="note">
<strong>HDR Profile support follows a draft.</strong> The HDR checks, the <code>headroomAdaptiveGainCurveTag</code> views and the HDR tab implement the ICC.1 HDR amendment as it currently stands. The amendment is not yet published, so details may change before it is.
</div>

---

## Contents

1. [The workspace](#1-the-workspace)
2. [Settings panel](#2-settings-panel)
3. [Profile views](#3-profile-views)
   - [Header](#3-1-header)
   - [Tags](#3-2-tags)
   - [Validation](#3-3-validation)
   - [Analysis](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Combine tab](#4-combine-tab)
   - [Building a chain](#4-1-building-a-chain)
   - [Make DeviceLink](#4-2-make-devicelink)
   - [Transform Image](#4-3-transform-image)
   - [Transform Data](#4-4-transform-data)
   - [Observer Change](#4-5-observer-change)
   - [Compare and Spectral tabs](#4-6-compare-and-spectral-tabs)
   - [HDR tab](#4-7-hdr-tab)
5. [Round-trip editing](#5-round-trip-editing)
6. [Launching from chardata](#6-launching-from-chardata)
7. [Launching with a URL](#7-launching-with-a-url)
8. [Mobile](#8-mobile)
9. [Limits and security](#9-limits-and-security)

---

## 1. The workspace

profiletool is a **multi-profile workbench**. The window has three parts:

- the **Profiles** pane down the left — the *pool* of everything you've loaded;
- the **canvas** on the right, with five tabs across the top — **Profile**, **Compare**, **Combine**, **Spectral**, **HDR**;
- the **Settings** blade on the right edge (see [Settings panel](#2-settings-panel)).

### Loading profiles

Load files in either of two ways:

- Click **Load Profiles** at the top of the Profiles pane and pick one or more files, or
- **Drag and drop** files onto the Profiles pane.

You can load `.icc` / `.icm` profiles *and* images. Drop a **TIFF, PNG, JPEG, HEIC or AVIF** and the tool extracts its **embedded ICC profile** and adds that to the pool. It reads only the file's metadata, never the pixels. For HEIC and AVIF it walks the file's boxes, so this works in every browser, including ones that cannot display those formats. A **JPEG XL** file is refused too: its profile is compressed inside the codestream, which profiletool does not decompress yet. Videos and camera raw files that share HEIC's container (MP4, QuickTime, Canon CR3) are not treated as images. An **OpenEXR** or **Radiance HDR** (`.hdr`) file is refused with the reason: neither format has a slot for an ICC profile. OpenEXR states its colour through chromaticities, Radiance HDR through an optional `PRIMARIES` header line. To *view* an image, use the [HDR tab](#4-7-hdr-tab). A **＋ New from .cube** button builds a DeviceLink from a `.cube` LUT.

A profile is accepted if its first 36 bytes contain the `acsp` signature and it parses through IccProfLib's `ValidateIccProfile`. Files that fail are listed in a rejection summary with the specific reason; their bytes are not retained.

### The Profiles pane

Loaded profiles are grouped into collapsible sections by **profile class** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). ICC.1 clause 8.10 **HDR Profiles** get their own section at the top instead, split by transfer into **Linear transfer** and **Non-linear transfer (PQ, HLG)**, with the transfer shown as a badge on each row. The split matters in the [HDR tab](#4-7-hdr-tab), where only a Linear-transfer profile can be assigned to an OpenEXR or Radiance HDR image. Each row shows the filename and badges for class, colour space, version and size; a profile that could only be partially parsed is flagged. Use the **A–Z** button to cycle the sort (load order → ascending → descending), the **×** on a row to remove it, and the handle on the pane's right edge to resize it — or collapse the pane entirely.

Click to select a row; Ctrl/Cmd-click to toggle and Shift-click to select a range. **Drag rows out of the pool onto a tab** to put them to work.

<div class="note">
<strong>The pool is session-only.</strong> Nothing is uploaded and nothing is persisted — your filesystem stays the durable store. Reloading the page empties the pool.
</div>

### The tabs

| Tab | What it does |
|---|---|
| **Profile** | Inspects **one** profile — header, tags, validation, analysis, XML, JSON. Dropping a new profile here replaces the current one. |
| **Compare** | Overlays the gamuts of **two or more** profiles. |
| **Combine** | Chains profiles into a DeviceLink, or transforms an image / dataset through them. |
| **Spectral** | Assembles single-channel spectral images into one multi-channel TIFF. |
| **HDR** | Shows **one** HDR image on your display, with an SDR ↔ HDR control. See [HDR tab](#4-7-hdr-tab). |

Spectral and HDR take image files directly rather than pooled profiles. Each of the other tabs keeps its own set of profiles, shown as removable chips beneath the tab strip, with a count badge on the tab itself. The first profile you load opens automatically in the **Profile** tab; after that, drag from the pool onto whichever tab you want. Dropping files straight onto a tab loads them into the pool *and* places them on that tab in one action.

<div class="note">
<strong>Size limit:</strong> the loader rejects anything larger than 256 MB. Real profiles are normally well under 10 MB; the cap exists only to prevent a hostile drop or postMessage from exhausting the tab's WASM heap.
</div>

---

## 2. Settings panel

Open Settings by clicking the **⚙** button on the right edge of the screen (or the gear icon at the top-right on mobile). The panel slides over the content without resizing it.

Two more buttons sit below ⚙:

- **?** opens this guide **inside the app**, as a pane that slides in over the window. It has a search box in its header — type to highlight matches, then use `Enter` / `Shift+Enter` (or the `˄` `˅` buttons) to step through them; `Escape` clears the search, and a second `Escape` closes the pane.
- **✉** opens the contact form on colourbill.com in a new browser tab.

The panel has two groups, **Display** and **Environment**. To make the panel wider or narrower, drag its left edge (220–560 px); the width is remembered.

### Background

Switches the app between **Light**, **Dark**, and **System** (follows the OS preference) themes. The choice persists across sessions. In **System** mode the app subscribes to `prefers-color-scheme` and flips automatically when the OS theme changes; choosing Light or Dark explicitly detaches that listener.

### Number format

Chooses how numeric values are displayed throughout the profile views — **Hexadecimal** or **Decimal**.

### Language

Overrides the interface language. **System default (…)** detects the browser locale and uses the closest supported language, with the native name in the parenthetical so you can see which it picked. Translation covers the app chrome: the Profiles pane, tab labels, the Combine, Spectral and HDR tools, the HDR gain-curve views in Tags, the settings panel including Environment and its reasons, and this guide's chrome. Some text is not translated:
- Strings produced by IccProfLib — tag descriptions, validation messages, header field names — come from the C++ library in English.
- The browser-flag name stays in English so it matches the browser's own flags page.
- The Environment panel's **Display events** log stays in English, so it can be pasted into a bug report as-is.

Supported languages: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. The chardata Settings panel offers the same set, so toggling Language in one app gives a consistent reading experience in the other.

### Environment

Shows what **this** browser, platform and display can do, so that when a format or HDR feature is unavailable you can see why. From top to bottom:

- **Summary** — the browser and operating system, and whether the display reports HDR.
- **Browser flags** (Chrome, Edge, Opera, Brave) — whether *Experimental Web Platform features* is on. That flag enables the HDR canvas and lets the page read a display's HDR headroom.
  - When the flag is known to be off, the box is highlighted. It is marked **required** if this browser has no usable WebGPU, since the HDR canvas is then the only way to render HDR. Otherwise it is **optional**.
  - Profile inspection never needs it.
  - A web page cannot open or change browser flags. Click **Copy**, paste the address into the address bar, set the flag to *Enabled*, then relaunch the browser.
- **Display facts** — **HDR display**, **Wide gamut** (sRGB, Display P3 or Rec. 2020), **Pixel ratio**, and the **HDR canvas path** in use (`float16-canvas`, `webgpu` or none). These refresh on their own when you drag the window onto a screen where they differ. The switch happens once most of the window is on the new screen.
- **Identify displays** (Chromium browsers) — asks permission to see which monitor the window is on. Once allowed, the panel refreshes even between monitors that look alike, names the **Current monitor**, and shows **HDR headroom** where the browser exposes it (Chrome with the flag above), for example *1.35 stops (≈2.55× SDR white)*. If you refuse the permission, change it in the site's settings.
  - Headroom is the room above SDR white, so on a laptop's built-in HDR panel it **falls as you raise the brightness** (SDR white gets brighter while the panel's peak stays put) and rises as you lower it. For HDR viewing, lower the brightness.
  - On Windows a new value arrives a few seconds after a brightness change, once the display driver reports it. It also refreshes when the window moves to another screen or Chrome becomes the active app again.
- **Display events** — a collapsible log of the last 20 refreshes and what triggered each one. It is useful when reporting a display problem.
- **Format table** — one row per format (ICC profile, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), with three questions:
  - **Inspect**: can the embedded profile be read?
  - **Display**: can the pixels be shown?
  - **HDR**: can it render brighter than white?

  Hover a row for the reason behind a ✕; formats that cannot be displayed are listed with their reasons below the table. A dot marks formats profiletool decodes itself, which work the same in every browser. **Inspect** is ✓ for every format except JPEG XL, whose profile is compressed inside the codestream.

---

## 3. Profile views

Drag a profile from the pool onto the **Profile** tab to inspect it. The tab shows a bar with the filename and a **Save profile** button (plus a *● Modified — unsaved edits* pill once you've edited it), and below that the viewer: a title bar (filename · size in bytes · IccProfLib version · validity badge) and its own tab strip.

The badge summarises the **Validation** report: green **Pass** when no check fails or warns, amber **Warning** when at least one check warns, red **Fail** when any check fails.

<div class="note">
<strong>Partially-parsed profiles:</strong> if a profile is damaged enough that the validator can only read it structurally, a warning banner appears and only the <strong>Header</strong> and <strong>Tags</strong> tabs are available — Validation, Analysis, XML and JSON are hidden, because the profile must not be applied.
</div>

### 3.1 Header

A two-column table of every field in the ICC profile's 128-byte binary header. Values are decoded into human-readable strings (signatures expanded, dates formatted, fixed-point values converted) using IccProfLib's `CIccInfo`. The **profile ID** (MD5 hash from the header) is shown in a highlighted strip at the top.

### 3.2 Tags

A six-column grid of every tag in the profile's tag directory:

| Column | Meaning |
|---|---|
| `#` | Position in the directory (1-based) |
| `Name` | Long human-readable name (e.g. `profileDescriptionTag`) |
| `ID` | 4-character signature (e.g. `desc`) |
| `Offset` | Byte offset from the start of the file |
| `Size` | Byte size of the tag data |
| `Pad` | Padding bytes between this tag and the next |

The tag **type** signature (e.g. `descType`, `mft2`, `mAB`) is shown with the offset and size at the top of the expanded tag.

Tags are sorted by offset. The **Pad** column is colour-coded — `Pad < 0` (overlapping tags, non-compliant) is shown in red; `Pad > 3` (above-spec padding) is shown in amber.

**Click any row** to expand it in place (an accordion — one tag open at a time). The expanded detail always ends with the full type-specific description — equivalent to running IccProfLib's `CIccTag::Describe(verbosity = 100)`. For tags that contain large CLUTs or curves (e.g. `A2B0`, `B2A0`), this includes every grid cell or curve point.

Above that description, tags that carry visualizable data show one or more **inline visualizations**, each in a collapsible section:

| Tag type | Visualizations |
|---|---|
| Tone curves (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | The tone-response curve plotted against the identity line; the curve table is collapsed below it. |
| RGB colorants (`rXYZ`/`gXYZ`/`bXYZ`) and white point (`wtpt`) | A CIE 1931 chromaticity chart with the relevant primary (or the white point) highlighted; the colorant/white-point data is shown beneath. |
| LUT transforms (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Input-side and output-side tone curves (overlaid, colour-coded per colorant, with a legend to toggle traces); the CLUT lattice as an image; the **gamut image** (for the profile's `gamutTag`, colour-coded — neutral = in gamut, red = out of gamut); the **evaluator** (below); and the raw data table, collapsed. |
| Named / colorant tables (`ncl2`/`nmcl`/`clrt`/`clot`) | A scatter of the colours on the CIELAB a\*b\* (and CIE xy) charts; the tables are collapsed below. |
| Coding-independent code points (`cicp`) | **Code points**: colour primaries, transfer characteristics, matrix coefficients and the full-range flag, each named as ITU-T H.273 defines it. Values H.273 does not assign are flagged, as are non-zero reserved bytes. |
| Adaptive gain curve (`headroomAdaptiveGainCurveTag`) | **Gain at a display headroom**, plus **Gain curve** when the tag stores alternate images. See *HDR gain curves (HAGC)* below. |

<div class="note">
<strong>Malformed data is never hidden.</strong> If a curve or other visualizable element fails IccProfLib's validation — for example a tone curve with a degenerate gamma of 0 — the section still renders what it can and shows a ⚠ warning with the exact reason from the library, rather than silently omitting the graph.
</div>

#### The transform evaluator

For LUT transforms (`A2B*` / `B2A*` / preview tags) the **Evaluate** section applies that specific tag's transform to a single colour you supply, using IccProfLib directly — no external colour engine. The direction follows the tag (`A2B*` maps device → PCS; `B2A*` maps PCS → device), and the rendering intent is implied by the tag (`…0` perceptual, `…1` relative colorimetric, `…2` saturation).

- Enter input either as **floating-point** values (device channels, or PCS in human Lab/XYZ units) or, when the tag has a CLUT, by **grid-point** index (a node position on the lattice).
- The output is shown in **both** the internal normalized 0–1 encoding and human units (Lab/XYZ for a PCS result).

The gamut tag (`gamt`) has no evaluator — it is a one-channel in/out-of-gamut map rather than an invertible transform; its gamut image is shown instead.

#### HDR gain curves (HAGC)

A `headroomAdaptiveGainCurveTag` says how an HDR Profile's image should be tone-mapped for displays with different amounts of headroom. Expanding the tag shows two views:

- **Gain curve** plots the control points exactly as stored in the file, one line per alternate image. It is absent when the tag stores no alternate images. The x axis is the curve input: linear light, with 1.0 at the tag's HDR reference white. The y axis is the gain in stops, which is negative for an alternate that tones down.
- **Gain at a display headroom** shows the curve as a colour-managed transform applies it, computed by IccProfLib's own evaluator. Drag **Display headroom** from 0 to 6 stops; it starts at the tag's baseline, and **Baseline** returns there. Two plots follow the slider:
  - **Gain applied at this headroom**: the blended curve, drawn against every curve in the tag;
  - **Grey tone curve at this headroom**: what a grey input becomes, drawn against *no change* and the display peak.

  Three more views make the adaptation visible:
  - **Preview through the colour engine** runs one test strip through IccProfLib's HDR transform twice: a grey ramp, then pure R, G, B, Y, C and M bands, all rising left to right in the profile's own signal (PQ, HLG, or Linear on a log scale). The top strip is **as authored**, at the baseline headroom where the tag applies no gain. The bottom strip is **tone-mapped** for the slider's headroom. Both are capped at that headroom's peak, the way a display with that much headroom would show them. Where the top strip clips to flat, the gain curve rolls the highlights off. Ticks mark where the ramp reaches **reference white** and the **display peak**. The strips use the same HDR output as the [HDR tab](#4-7-hdr-tab): on an HDR display, values above SDR white look brighter than it.
  - **Gain across every headroom** is a heatmap of the gain on a grey input. The horizontal axis is input brightness, in stops relative to HDR reference white; the vertical axis is display headroom from 0 to 6 stops. Blue compresses, red expands, white leaves the input unchanged. Dotted lines mark the curves stored in the tag, the solid line the baseline, the amber line the slider, and the dashed diagonal where the input reaches the display peak. **Click** the heatmap to move the slider to that headroom.
  - **Grey tone curves by headroom** overlays the tone curve at each headroom the tag stores, shaded from blue (low) to red (high), with the slider's curve in amber. Both axes are in stops, so the diagonal means no change.

  A note appears when slopes or whole curves are derived rather than stored. Another appears when the headroom is outside the tag's range, in which case the nearest curve is used unchanged.

  Two cases have no curves to draw, and the view still explains them:
  - **Tone mapping on, no alternate images.** The tag asks for no tone mapping, only a clamp to what the display can show. The gain is zero at every headroom, and the preview strip shows the clamp.
  - **Tone mapping off** (the tag's *Headroom Adaptive Tone Map* flag is clear), or a tag IccProfLib cannot apply. The view says why IccProfLib declines, and a colour engine falls back to the next tone-mapping method (clause 8.10.3).

### 3.3 Validation

Runs the **ICC Profile Assessment Working Group** checklist against the loaded profile and shows it as a report. The checks come from the iccDEV `iccPawgReport` tool, compiled to a separate WebAssembly module that's fetched only when you first open this tab. (The same report drives the validity badge in the title bar, and is reachable from a URL launch as either `VAL` or the legacy `PAWG`.)

Each check is grouped under **Security**, **Conformance**, or **Quality**, and carries one verdict. Profiles with HDR content get a fourth group, **HDR**. Its first check reports whether the profile is a conforming ICC.1 **HDR Profile** (clause 8.10), and the rest check the HDR metadata that clause relies on:

| Verdict | Meaning |
|---|---|
| **Pass** | The check succeeded |
| **Warn** | A non-fatal concern worth reviewing |
| **Fail** | The profile does not satisfy the check |
| **Gap** | The check could not be fully evaluated (e.g. not yet implemented) |
| **N/A** | The check does not apply to this profile |
| **Not Run** | The check was skipped |

The summary row at the top tallies each verdict as a coloured pill. **Click a pill to filter** the report below — a blue halo marks the categories currently shown, and pills with zero items are inactive. For example, switch off **Pass** and **N/A** to focus on just the Warns and Fails.

### 3.4 Analysis

Whole-profile quality analyses derived from the profile's colour transforms — computed by a dedicated WebAssembly module (the iccDEV visualization engine) that's fetched only when you first open this tab, and plotted in the app's own style.

Each analysis is a collapsible section and **all of them start closed**. That's deliberate: every section costs a full transform pass over the profile, so opening one is your explicit choice rather than six analyses firing the moment you switch tabs. Results are cached, so re-opening a section is instant. A section that doesn't apply to the loaded profile shows a short *not applicable* note instead (for example, a matrix/TRC display profile has no device↔PCS CLUTs to analyse).

#### Profile Statistics

Whole-profile metrics for **one** selected rendering intent, driven by two listboxes and a checkbox:

- **Rendering intent** — Perceptual / Relative Colorimetric / Saturation / Absolute Colorimetric.
- **Round-trip type** — which accuracy metric to report (see below).
- **Use MPE (color) tags** — off = the colorimetric lookup tables; on = the multi-processing-element / colour tags. It has no effect on the in-gamut overview, and is disabled there.

The table shows the **gamut volume** (in ΔE\*ab³, enclosed by the device → PCS `A2B` transform, measured by voxelising the boundary and counting enclosed cells) alongside the selected round trip's **min / mean / std dev / P90 / max** ΔE\*ab. Below it sits a ΔE distribution histogram — relative frequency bars with a cumulative-frequency line — plus the worst-error `L, a, b` and, for PRMG, whether the profile implies the Perceptual Reference Medium Gamut.

The four round-trip types:

- **In-gamut overview (RT0)** — a device-value grid taken to PCS, back to device, and to PCS again; ΔE\*ab measured between the two PCS passes. A fast in-gamut stability check.
- **Inversion + gamut (RT1)** — ΔE\*ab between each device colour's PCS and its PCS after one Lab → device → Lab round trip. Reflects inversion accuracy *and* gamut mapping.
- **Reproducibility (RT2)** — ΔE\*ab between the first and second round trips: how stable a repeated round trip is, independent of the first trip's gamut clipping.
- **PRMG interoperability** — PCS colours inside the Perceptual Reference Medium Gamut round-tripped once; the ΔE distribution indicates cross-profile interoperability.

Below the histogram, **Round-trip ΔE by lightness** answers the question the summary figures cannot: *where* in the tone scale the inversion struggles, and *how far into the gamut* the trouble reaches.

It samples 32 lightness levels. At each level it takes 64 points **on the gamut boundary**, then repeats them eroded toward the neutral axis at 80 %, 50 % and 20 % of their chroma — 8,192 points in all, each plotted individually, with dotted separators between levels.

Read it band by band. Within one band the points run from the gamut surface on the left to neutral on the right, so the error should **fall away** across the band: colours near the boundary are the hardest to invert, colours near neutral the easiest. A band whose error stays high all the way to neutral is a profile in trouble at that lightness. The tallest spikes mark the lightness levels where the gamut boundary itself is least well inverted.

Every seed is inside the gamut by construction, so what you see is genuine `B2A`/`A2B` disagreement rather than colours being clipped for being unreachable. Note that this plot has its **own** sampling — deliberately weighted toward the gamut boundary — so its mean and maximum are higher than, and not comparable with, the table above. It follows the rendering intent but not the round-trip type.

A profile lacking the device↔PCS transforms a metric needs shows a *not applicable* note; a device space too wide to sample is reported as skipped rather than as an error.

#### Extrema Colorimetry

The ends of the profile's reproduction range — the numbers a print operator usually reads first.

- **White point** — the colour of **zero colorant**, i.e. bare substrate.
- **Black point** — found by pushing PCS black (L\*=0, a\*=b\*=0) through the selected `B2A` table to get the inking the profile *chooses* for black, then reading that inking back through `A2B1`.
- Both are shown in **relative** and **absolute** colorimetry. Absolute shows the substrate's own colour (a blue-white paper reads as something like L\* 95, b\* −4); relative re-references it to a perfect white. If the two columns are identical, that's normal — the media white simply matches the illuminant. A profile with no media white point tag shows relative only.
- **Inking at black point** and **TAC** — the per-channel ink at that black, and their sum: total area coverage, the ink-limit figure.

Because each `B2A` table picks its own inking for black, the black point genuinely differs between intents — hence the rendering-intent selector.

Below that, **Full tone vs maximum chroma**: for each ink corner (C, M, Y, R, G, B and K), where it lands in hue / chroma / lightness, and the most chromatic point found on the way there from bare substrate. These rows are measured through `A2B1` and so **do not change with the intent selector**. On a well-behaved profile the two rows match. When maximum chroma arrives *before* full tone the row is flagged: past that point the extra ink is no longer adding chroma, only darkening.

**Output (printer) profiles only** — the analysis assumes zero colorant means bare substrate. The per-hue table additionally needs a **CMYK or CMY** device space: an n-colour (nCLR) profile names its channels in any order, so which channel is "cyan" cannot be known, and the table reports that rather than guessing.

#### Neutral Axis Inking

Sweeps the neutral axis (a\*=b\*=0) from white (L\*=100) down to black (L\*=0) through the profile's `B2A` (PCS → device) table and plots how much of each device colorant the profile lays down along the way — the classic GCR / neutral-build curve. One curve per device channel, colour-coded per colorant.

A further curve is drawn over the separation:

- **L\* out (tone)** — the tone response: where the neutral axis actually lands in lightness after a round trip through the profile. Read two things from its shape. Sag below the diagonal means greys render darker than requested. More usefully, the curve **flattens at the darkest lightness the profile can reach** — that plateau *is* the media black point, and it should agree with the Extrema Colorimetry section above.

**Output (printer) profiles only**; other profile classes show a note.

#### Ink Usage in Shadows

Four straight paths across the a\*b\* plane at one constant, deliberately dark lightness — 0°, 45°, 90° and 135° — run through the selected `B2A` table, with the resulting separation plotted for each.

Because every sample on a path shares the same L\*, any abrupt step or reversal in a colorant comes from hue and chroma handling alone. That's the signature of a shadow gamut-mapping artefact, and it's the kind of thing that shows up in print as banding or a sudden colour shift in dark areas. The paths sweep from far outside the gamut, through it, and out the other side, so you also see where the profile starts clamping.

The lightness plane is chosen automatically: halfway between the profile's Blue corner and the darkest of C, M, Y, R and G. For the perceptual and saturation tables the lightness is first stretched from the media black point up to PCS black — those tables expect black there — and the section reports both the compensated plane and the raw one.

**Output (printer) profiles only**, and the same CMYK/CMY restriction as the per-hue table above (the plane is derived from the ink corners).

#### Primary-Inking Paths through Neutral

Three paths — Cyan→Red, Magenta→Green, Yellow→Blue — each routed from one primary corner, **through the neutral axis** at the midpoint lightness of its two endpoints, to the opposite corner, run through the selected `B2A` table and plotted as a separation.

This is the in-gamut counterpart to Ink Usage in Shadows. There, the paths deliberately run outside the gamut to expose gamut-mapping artefacts; here, **every sample is inside the gamut by construction** — both endpoints are the profile's own primaries and the pivot sits on the neutral axis. So a step, kink or reversal in a colorant along one of these paths cannot be blamed on gamut clipping: it is a CLUT-smoothness defect. The neutral pivot is the midpoint of each plot, where you should see a balanced neutral build.

For the perceptual and saturation tables the lightness is black-point compensated for the intent, exactly as in Ink Usage in Shadows.

**Output (printer) profiles only**, with the same CMYK/CMY restriction (the corners come from the same source as the per-hue table).

#### Ink Usage Statistics

How much of each colorant the profile lays down, as a mean coverage and as a **share of the total** — the ink-consumption signature of the separation.

The table sums each colorant across the neutral axis and reports its mean coverage and its percentage of all ink laid down. The share column is the diagnostic: it is the profile's neutral-build fingerprint (a cyan-heavy grey balance reads differently from a black-heavy one), and it is independent of how many samples were taken.

A second table — ink usage across **all on-and-in-gamut colours** — is listed as *pending*: it needs a gamut-boundary construction that is not yet built.

**Output (printer) profiles only.**

#### CLUT Image

The colour lookup table of a device↔PCS transform, tiled into an image, with a selector for which rendering-intent table to view (`A2B0`–`A2B3`, `B2A0`–`B2A3`, and the preview tables). Useful for spotting structural damage in a table at a glance. Zoom, pan and reset with the controls on the canvas.

When you select a **`B2A` (PCS → device) table**, a grayscale **ink-coverage image for each colorant** appears below the lattice — the per-ink separations, darker meaning more of that ink. A hint at the top of the section points you to them, since the section opens on an `A2B` table (whose output is L\*a\*b\*, not inks). For an **n-colour (nCLR) output** — 5-, 6- or 7-colour — where there is no simple colour preview, the main image is **colour-managed through the profile's forward `A2B`** so it still renders in real colour instead of a single-channel grey.

#### Gamut Image

The gamut tag's in/out-of-gamut map: neutral where a PCS colour is reproducible, red where it falls outside the device gamut. Only present when the profile carries a `gamt` tag.

### 3.5 XML

Converts the profile to XML (via IccLibXML, the same writer the iccDEV `iccToXml` CLI uses) and shows it in a CodeMirror editor with syntax highlighting. Edit the XML and click **Convert to ICC** to round-trip back to binary; the viewer re-validates and the **Save profile** button in the Profile-tab bar downloads the result.

A **dirty** indicator shows when the editor text differs from the last converter output, so you can tell at a glance whether your edits have been applied. If conversion fails, IccLibXML's parse error is shown above the editor with the offending line / column.

### 3.6 JSON

Same idea as the XML tab but using a JSON representation of the profile produced by the validator wrapper (`json-wrapper.cpp`). Edit, click **Convert to ICC**, save. The JSON form is more compact and easier to script against; the XML form is more familiar if you've used the iccDEV CLI tools.

---

## 4. Combine tab

profiletool keeps every loaded profile in a **Profile Pool** on the left. Across the top are five tabs — **Profile** (the single-profile viewer above), **Compare**, **Combine**, **Spectral** and **HDR**. The **Combine** tab is where you chain profiles together and put them to work: build a **DeviceLink**, **transform an image**, or **transform a colour dataset** through the chain.

### 4.1 Building a chain

Drag one or more profiles from the pool into the Combine card to add them to the chain, in order. The chain is a **vertical stack**: the source is at the top, the sink at the bottom. Each profile contributes **one transform**, and the tool shows the colour space entering and leaving it (e.g. `RGB → Lab`), with the **connecting space** labelled on the line between stages. The engine validates the whole chain live and reports the end-to-end flow (e.g. *Chain: RGB → CMYK*) or explains, per stage, where it fails to connect.

- **Reorder** a stage by dragging its grip (`⠿`) or with the ▲ / ▼ buttons; remove one with ×.
- **Flip direction** — the head transform's ⇅ button reverses the chain's direction, rippling through the following stages.
- **Rendering intent** — pick one for the whole chain with *Rendering intent (all)*, or override any single stage with its own listbox. Hover either control for a description of the selected intent. Beyond the four base intents, a profile that carries the necessary tables also offers the *no D2Bx/B2Dx* and *+ BPC* (black-point compensation) variants.

<div class="note">
<strong>HDR Profile in the chain.</strong> An ICC.1 HDR Profile has no TRC tags, so a transform through it uses its <code>AToB0Tag</code>. That table is the baked SDR rendering clause 8.10.6 requires for software without HDR processing. The card says so when a chain contains an HDR Profile: the DeviceLink, image or data you produce reflects that SDR fallback, not the profile's HDR behaviour.
</div>

### 4.2 Make DeviceLink

Bakes the whole chain into a single **DeviceLink** profile (an in-browser port of iccDEV's `iccApplyToLink`). Name it and click **Make DeviceLink**; the result lands in the pool and the Combine accumulator like any other profile, ready to inspect on the Profile tab or reuse in another chain.

### 4.3 Transform Image

Drop one raster image (TIFF, PNG or JPEG) into the image slot and click **Transform Image** to run it through the chain (an in-browser port of `iccApplyProfiles`). The image is validated by a header-only probe first — its colour space must match the chain's input. The result **downloads**; images are never stored in the pool.

When a valid image is loaded, an **Image output options** panel appears with the destination knobs that mirror the `iccApplyProfiles` CLI:

- **Encoding** — *Same as source*, 8-bit, 16-bit, or **Float (32-bit)**.
- **Compression** — None, **LZW**, or **ZIP** (Deflate).
- **Planar** — **Composite** (chunky) or **Separated** planes.
- **CMM interpolation** — **Tetrahedral** or **Linear**.
- **Embed ICC** — tag the output with the chain's last (output-space) profile.

The friendly default keeps RGB/Gray output as a PNG; choosing a TIFF-only knob (float, LZW/ZIP, or separated planes) switches the container to TIFF.

<div class="note">
<strong>Embedded profiles:</strong> if the dropped image carries its own embedded ICC profile, a banner offers to <strong>extract</strong> it — the profile is added to the pool and placed at the head of the chain (its source space) in one click.
</div>

### 4.4 Transform Data

Drop a colour dataset (CGATS/IT8, CSV, CxF, or JSON) into the data slot and click **Transform Data** to run every patch through the chain (the `iccApplyNamedCmm` equivalent). The tool reads the dataset's kinds (device / Lab / XYZ / spectral) and feeds whichever the chain's input needs; a **spectral** input is converted to colorimetry with iccDEV's canonical calculator, using the **Observer** and **Illuminant** you choose. Duplicate patches can be filtered (median or mean). The result opens in a table you can **Save** as CSV.

### 4.5 Observer Change

The Combine tab holds **two** maker cards. Above the Link Pipeline, the **Observer Change** card builds a v4.3 matrix/TRC display profile from a V5 RGB display profile plus a V5 observer (PCC) profile. Drag both onto the card — they are routed automatically into the **V5 RGB display** and **V5 observer (PCC)** slots by profile class — then click **Make V4 Display Profile**, name it, and click **Create**. The result joins the pool and this tab. A profile that is neither is ignored with a warning.

### 4.6 Compare and Spectral tabs

The **Compare** tab overlays the gamut boundaries of two or more pooled profiles — a 3-D shell plus a 2-D lightness slice — to see where they differ. When the profiles are HDR Profiles, a **Showing the SDR fallback** note explains that each gamut is built from the `AToB0Tag` SDR rendering, not from the profile's HDR range, which cannot be drawn in a bounded PCS. The **Spectral** tab assembles a set of single-channel spectral images (dropped in channel order) into one multi-channel TIFF (`iccSpecSepToTiff`).

### 4.7 HDR tab

Drop **one** image on the **HDR** tab, or click the drop area to choose one. A new image replaces the current one, and nothing is added to the Profiles pool. What happens depends on who can decode the image:

| File | Shown by | SDR ↔ HDR control |
|---|---|---|
| **AVIF**, **JPEG** (including gain-map JPEG), **PNG** (including cICP-tagged), **HEIC** on Safari | the browser | **SDR** / **HDR** buttons, plus a **Dynamic range** slider where the browser can blend the two (Chrome, Edge). Safari offers the two ends only. |
| **OpenEXR**, **Radiance HDR** (`.hdr`, RGBE) | profiletool | the same buttons and slider, plus **Exposure** |
| **TIFF** | profiletool, once a profile is assigned (a TIFF's own embedded profile is assigned automatically); a TIFF with no profile shows a note | the same buttons and slider, plus **Exposure** |

The panel lists what it knows: which output it is using, whether the display reports HDR, the image size, the **brightest pixel** as a multiple of SDR white (whenever profiletool renders the pixels), its chromaticities, any **gain map**, and any **embedded ICC profile**. **Open in Profile tab** loads that profile for inspection.

**Radiance HDR.** profiletool reads run-length-encoded and flat RGBE files in any orientation. A `PRIMARIES` header line sets the chromaticities; without one (or with Photoshop's all-zero line) Rec. 709 is assumed, as for OpenEXR. The stored values are shown as they are: an `EXPOSURE` line is not undone. XYZE files are refused, and so is any image over 40 megapixels. So is a file whose pixel data is too small for its size: at most 64 pixels per byte, four times what run-length encoding reaches on a flat scanline. Old-style repeat markers could otherwise describe a 40-megapixel image in about 75 KB.

**Outputs for OpenEXR and Radiance HDR.** profiletool renders the pixels itself, through the first of these that works:
1. **HDR canvas (float16)**: needs `chrome://flags/#enable-experimental-web-platform-features` (see [Environment](#environment)).
2. **WebGPU (extended range)**: needs no flag, but needs a working GPU adapter.
3. **SDR canvas (tone-mapped)**: always available. It cannot show brighter-than-white, so the slider is hidden.

On the slider, 0% is the SDR rendering and 100% is no limit. Values in between cap brightness smoothly at that many stops above SDR white (0 to 6 stops), shown beside the slider.

**Matching the display.** The panel tracks the monitor the window is on: drag it to another screen and the facts and notes update.
- **Display peak** says how bright this display can go, as a multiple of SDR white. It comes from the headroom the browser reports; see [Environment](#environment), where **Identify displays** grants the permission (the button also appears here). An SDR display reads *1× — SDR display*. When the browser does not report a peak, the panel says so rather than guessing.
- When an OpenEXR or Radiance HDR image asks for more than the display shows, a note says so — for example *asks for 4.93×, this display shows up to 2.23×*. Values above the display's peak then **clip** to flat white, which is why the SDR and HDR ends can look alike even on an HDR monitor.
- **Fit to display** sets the limit to the display's peak, so highlights roll off into it instead of clipping. On an SDR display that means the SDR rendering. On Windows the reported peak can lag behind brightness changes; the value is shown so you can judge.
- An **SDR white patch** — plain white — sits against the image's right edge, for comparison by eye. **Drag** it anywhere over the viewer (or focus it and use the arrow keys; Shift for bigger steps), and **double-click** it to put it back beside the image. The **SDR white patch** button above the image turns it on and off. Its position and on/off state are remembered. On an HDR display with real HDR output, highlights look brighter than the patch; at the SDR end the brightest pixels sit just below it, because the SDR rendering eases highlights in under white. If highlights never look brighter, the output is being clamped.

**When Fit to display is available.** The button is always shown. When it cannot work it is greyed out, with the reason beside it:

| The panel shows… | Fit to display | Why |
|---|---|---|
| **Shown by: the browser** (AVIF, JPEG, PNG, HEIC) | not available | The browser renders the image, and CSS can only show it at the SDR end, the HDR end, or a blend of the two. It has no setting for "cap at this display's peak". |
| **Shown by: profiletool**, **Output: SDR canvas** | not available | This output cannot show anything above SDR white, so there is nothing to fit. The Dynamic range slider is hidden too. |
| **Shown by: profiletool**, **Display peak: not known** | not available | There is no peak to fit to. Click **Identify displays** in the **Display peak** row. |
| **Shown by: profiletool**, an HDR output and a known peak | available | Sets the limit to the display's peak. |

The **Fit to display** beside **Target headroom**, when a profile is assigned, needs only a known display peak.

**Image details.** Click **Image details** to fold away the facts from **Embedded ICC profile** down to **HDR reference white**, including **Assign profile**, and leave more room for the image. Click again to unfold. The choice is remembered.

**Zoom, pan and resize.** The image opens at actual size (100%), or shrunk to fit if it is larger than the view. Zooming is a display transform only: the pixel values sent to the display do not change.
- **+** and **−** zoom, as does **Ctrl** (⌘ on a Mac) with the mouse wheel, toward the pointer. The percentage is the scale: 100% is one image pixel per CSS pixel. Above 200%, pixels show as sharp squares.
- **Fit image** fills the view with the image; **1:1** returns to actual pixels. **Double-click** the image to go back to the opening view.
- **Drag** the image to pan. With the view focused, the arrow keys pan, and **+**, **−**, **0** (opening view) and **1** (1:1) work too.
- Drag the **corner grip** at the bottom right to resize the view; double-click the grip for the default size. The size is remembered.
- The **SDR white patch** is not zoomed: it stays the same size wherever the image moves, and a docked patch follows the image's right edge.

**Assigning an HDR profile.** For TIFF, PNG, JPEG, OpenEXR and Radiance HDR, **Assign profile** chooses a profile to interpret the image's pixel values:
- the image's **embedded profile**;
- any **HDR Profile in the pool** (load one in the Profiles pane first);
- **None**, to go back to what the file itself signals.

A TIFF starts with its embedded profile selected, since without one its values mean nothing.

With a profile assigned, profiletool decodes the image itself and runs it through IccProfLib's HDR colour-management path, as the ICC.1 HDR amendment (clause 8.10) describes. The profile's transfer function (PQ, HLG or Linear) converts the code values to light, its gain curve tone-maps them, and its colorants set the colour. 1.0 lands on the profile's **HDR reference white**, which is shown at the display's SDR white.
- **Target headroom** (0 to 6 stops) is the display the image is being prepared for. The profile's gain curve is evaluated there, the same curve **Gain at a display headroom** plots in the Tags tab. **Fit to display** sets it to this display's peak.
- **Tone mapping** chooses the method: **Auto** (the clause 8.10.3 ranking), **Gain curve** only, the profile's **Baked SDR fallback** (`AToB0Tag`), or **Off**, which behaves like a colour engine that predates the amendment.
- The panel reports what the colour engine actually did: which **path** (HDR with the gain curve applied, HDR without a curve, or the baked table), the **transfer**, and the **HDR reference white**. A profile without a gain curve still takes the HDR path, but tone-maps nothing, so the **Dynamic range** limit is what keeps its highlights within the display.
- Pooled HDR Profiles appear in two groups, **Linear transfer** and **PQ / HLG transfer**, matching the Profiles pane. OpenEXR and Radiance HDR store linear light, so for those images only the **Linear transfer** group is offered. A note under the list says so, and how many PQ/HLG profiles are hidden. Assigning needs a 3-channel RGB image.
- **Linear values** (OpenEXR, Radiance HDR and floating-point TIFF only) says what a file value of 1.0 means. The two conventions disagree. These files usually put SDR white at 1.0, but an ICC Linear transfer reads 1.0 as 1 cd/m² (ICC.1 clause 8.10.2 a) and then divides by the HDR reference white, so an unscaled image comes out a few hundred times too dark.
  - **File 1.0 = HDR reference white** (the default) multiplies the pixels by the profile's HDR reference white first, so file 1.0 lands on it. The **Input scale** fact shows the factor, for example *×300*.
  - **File 1.0 = 1 cd/m²** passes the values unscaled, as the clause reads them. Use it for files whose values really are in cd/m².

  The choice is remembered.

<div class="note">
<strong>Why some images look dim:</strong> browsers ignore HDR that is signalled <em>only</em> by an embedded ICC profile. A PNG or JPEG whose HDR lives in an ICC.1 clause 8.10 HDR Profile therefore looks flat here. The panel says so when that applies. Its profile is still fully inspectable.
</div>

<div class="note">
<strong>Refusals name the reason.</strong> For example, HEIC display needs Safari: Chrome and Firefox decode HEIC on no platform. The image's profile can still be opened in the Profile tab.
</div>

**Gain curves.** An HDR Profile's adaptive gain curve is not shown here but in **Profile → Tags**. See *HDR gain curves (HAGC)* under [Tags](#3-2-tags).

---

## 5. Round-trip editing

Both the XML and JSON tabs can write the profile back to ICC binary. The typical workflow:

1. **Load** an ICC profile.
2. Open the **XML** or **JSON** tab. Click **Convert to XML** / **Convert to JSON** to populate the editor.
3. **Edit** in the in-page editor. A dirty indicator appears next to the toolbar.
4. Click **Convert to ICC**. The wrapper builds a new profile, re-runs validation, and updates the Header / Tags / Validation tabs.
5. A **● Modified — unsaved edits** pill appears next to the filename in the Profile-tab bar.
6. Click **Save profile**. The edited bytes are downloaded as `<original>-edited.icc`.

Both editors are independent — editing XML then editing JSON doesn't mix the two paths. The most recently produced ICC bytes are what gets saved.

<div class="note">
<strong>Caveat:</strong> conversion fidelity depends on what IccLibXML / the JSON wrapper supports for each tag type. If a tag type isn't representable, the round-trip will lose detail; check the Validation tab after the convert-back to confirm everything still parses cleanly.
</div>

The Tags tab highlights any tag whose bytes differ from the original load, so it's easy to see what your edits changed.

---

## 6. Launching from chardata

In **chardata**, after loading an ICC profile, click **Display File** to open the in-page viewer, then click **Launch editor**. A new tab opens here with `?source=chardata` in the URL.

The handover works entirely in-browser:

1. profiletool opens, detects `?source=chardata`, and sends `{type:'profiletool:ready'}` to `window.opener` via `postMessage`.
2. chardata replies with `{type:'profiletool:load', filename, bytes}`.
3. profiletool accepts the bytes (after verifying the sender's origin against an allowlist and the size against the 256 MB cap), runs validation, and shows the profile.

No upload, no server round-trip. The flow is one-way — edits made here are saved by clicking **Save profile**, not handed back to chardata.

---

## 7. Launching with a URL

You can open the tool with a link that names a profile to load — and the tab to land on — using a **URL fragment** (the part after `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Both parameters are optional:

- **`url=`** — the web address the profile is fetched from. The bytes are downloaded in your browser and then run through exactly the same path as a local file: the `acsp` header check, full `ValidateIccProfile`, the 256 MB size cap, and the best-effort fallback for unparseable profiles. Nothing is uploaded — the fetched bytes only feed the validator and are never re-sent.
- **`tab=`** — which view to open once the profile has loaded.

A complete example:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>Why a fragment, not a query string?</strong> The part after <code>#</code> is never sent to a web server, so the address of the profile you are inspecting stays on your own machine.
</div>

### Tab names

`tab=` accepts two interchangeable, case-insensitive naming schemes. The **short** codes are the preferred form:

| View | Short code | Long name |
|---|---|---|
| Header | `HEADER` | `Header` |
| Tags | `TAGS` | `Tags` |
| Validation | `VAL` | `Validation` |
| Analysis | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

The long names are the on-screen tab labels with the spaces removed. Both schemes are kept stable even if the visible labels are renamed, so existing links keep working. The Validation tab also answers to the legacy code `PAWG` (it was formerly labelled "Profile Assessment WG"). An unrecognised `tab=` value is ignored and the Header view opens.

<div class="note">
<strong>Requirements for <code>url=</code>:</strong> the profile must be served over <strong>HTTPS</strong>, and the hosting server must allow cross-origin reads (a permissive <code>Access-Control-Allow-Origin</code> / CORS header). If either is missing the browser blocks the download and the tool shows a fetch error. If the profile URL itself contains <code>&</code> or <code>#</code> (its own query string), percent-encode the whole <code>url=</code> value so those characters don't terminate the fragment early.
</div>

---

## 8. Mobile

On screens narrower than 700 px:

- The Settings panel collapses into a slide-in drawer from the right.
- A **⚙** floating button at the top-right opens / closes Settings.
- A **?** button below ⚙ opens this guide in its slide-in pane.
- A **✉** button opens the contact form in a new browser tab.
- Tapping the dimmed backdrop closes the open drawer.
- The tag table reflows from a wide grid into stacked cards so every column stays readable without horizontal scrolling; a tag still expands in place.

All features are available; the layout adapts to the smaller screen.

---

## 9. Limits and security

profiletool makes no network requests after the initial page load. The validator, the XML converter, the JSON converter and the image codecs are all WebAssembly compiled from C++ sources and run entirely client-side. The HDR tab shows a dropped image through a local object URL, so the image never leaves the tab. **Identify displays** asks the browser, not a server, which monitor the window is on.

| Limit | Where | Notes |
|---|---|---|
| **256 MB** | postMessage / file load | Refuses to load anything larger; prevents heap exhaustion from a hostile opener |
| **32 MB** | XML and JSON converters | Both the JS guard (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) and the C++ wrappers (`kMaxXmlBytes` / `kMaxJsonBytes`) enforce this; the C++ side is independently authoritative |
| **XML entity-bomb guard** | XML converter | Any XML containing `<!DOCTYPE` or `<!ENTITY`, or a NUL byte, is rejected before libxml2 sees it. libxml2's own entity-expansion limits are also active, so this is a second layer of defence against billion-laughs input |
| **512 MB** | HDR tab file | Checked against the file's size before any of it is read; mirrors the image codecs' own 512 MB input cap |
| **40 megapixels**, **64 pixels per byte** | Radiance HDR decode (HDR tab) | Both checked from the header and the file size before any pixel memory is allocated; the second refuses repeat-marker decompression bombs |
| **EXR decode budget** | OpenEXR decode | Width × height × channels × 4 bytes must fit in 512 MB, checked from the header before the decoder allocates anything |
| **HEIC/AVIF box walk** | Profile extraction | Box sizes are checked without overflow, nesting is capped at 8, a profile at 64 MB (per file, in total) and item associations at 65 536 |
| **Origin allowlist** | postMessage launch | Only same-origin and chardata's dev-host origins can send `profiletool:load` bytes |
| **HTTPS + CORS** | `#url=` launch | A URL-launch profile must be served over HTTPS from a host that permits cross-origin reads; the fetched bytes feed only the validator and are never re-sent |

The `#url=` launch (added in 1.1.5) is the one case where the tool makes an off-origin request after page load: it widens the Content-Security-Policy `connect-src` to `https:` so the named profile can be fetched. Script loading is **not** widened — only data fetches.

If you need to inspect a profile that exceeds these limits, build iccDEV from source and use the native CLI tools — those have no JS-side caps.

### ICC.2 (iccMAX) coverage

Both **ICC.1** and **ICC.2** profiles are supported, but ICC.2 coverage is **incomplete**. Loading, the header and tag views, validation, the XML/JSON round-trip and the transform engines all understand ICC.2; the known gaps are multi-part **ICS** interchange workflows, choosing a V5 **sub-profile** when applying a transform, and inverse search on some ICC.2 profiles. A profile using an unsupported ICC.2 construct is reported by the Validation tab rather than silently mis-read.
