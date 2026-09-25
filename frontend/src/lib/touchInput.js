// (c) 2026 William Li
//
// "Can this user drag?" — the one question the pool pane and the tab bar need.
//
// THE BUG THIS FIXES. Dragging a profile row onto a tab is how a profile is put to work. iOS has no
// HTML5 drag and drop at all: touching a row and moving scrolls the page, `dragstart` never fires,
// and there is no way to reach Compare, Combine or Spectral. chardata solved the same problem by
// giving every draggable card a plain CLICK that does what the drag would have done; we do the
// same, with the click split across the two steps the pool already has — select the rows, then tap
// the destination tab.
//
// Detection is capability-shaped, not brand-shaped: a coarse pointer (finger, stylus) is exactly
// the case where drag is unavailable or unreliable, and it covers iOS, Android and touch tablets
// without naming any of them. Desktop keeps drag and drop untouched; the tap path is additive, and
// only engages while rows are selected.

/**
 * True when the primary pointer is coarse — a touch screen — so drag and drop cannot be relied on.
 * @param {(q: string) => {matches: boolean}} [mm] matchMedia, injectable for tests
 */
export function isTouchPrimary(mm = typeof window !== 'undefined' ? window.matchMedia : null) {
  if (typeof mm !== 'function') return false
  try {
    return !!mm('(pointer: coarse)').matches
  } catch { return false }
}
