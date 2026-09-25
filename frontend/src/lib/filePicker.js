// (c) 2026 William Li
//
// `accept` for a <input type="file">, minus the platforms where it does more harm than good.
//
// THE BUG THIS FIXES. iOS (and iPadOS) resolve an `accept` list through the system's Uniform Type
// Identifiers. An extension the system has no UTI for matches NOTHING, so in the Files picker every
// such file is greyed out and CANNOT be chosen — the picker opens and the user simply cannot load
// their profile. `.icc` and `.icm` are exactly that case, and so are `.cube`, `.exr`, `.hdr`,
// `.cgats`, `.it8` and `.cxf`. Desktop browsers treat the same list as a soft filter (with an
// "All files" escape), which is why this is invisible off iOS.
//
// chardata hit this first and fixed it the blunt way: its profile input carries no `accept` at all.
// We keep the desktop filter — it is genuinely useful there — and drop the attribute only on iOS,
// where the choice is "no filter" or "no files".
//
// Lists that name only web image types (image/png, .jpg …) are safe to keep everywhere: iOS has
// UTIs for those. Pass them straight through rather than through this helper.

/**
 * True on iOS and iPadOS, whatever the browser brand — every engine there is WebKit and uses the
 * same Files picker. iPadOS reports itself as a Mac, so a Mac with touch points is an iPad (the
 * same rule lib/environment.js uses).
 */
export function isIosFilePicker(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false
  const ua = nav.userAgent || ''
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return true
  return /Mac OS X|Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1
}

/**
 * The `accept` value to put on a file input: the list as given, or undefined on iOS so React omits
 * the attribute and the Files picker offers every file.
 * @param {string} list e.g. '.icc,.icm'
 * @returns {string|undefined}
 */
export function acceptFor(list, nav) {
  return isIosFilePicker(nav) ? undefined : list
}
