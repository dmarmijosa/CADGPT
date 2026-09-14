/**
 * Maps a scroll position within the exploded-hero's scroll track to an
 * explosion progress in [0,1]. The hero wrapper is taller than the viewport
 * (a "scrollytelling" track); its sticky inner viewport stays pinned while
 * the wrapper scrolls past underneath. `top` is the wrapper's
 * `getBoundingClientRect().top` (negative once the page has scrolled past
 * its start), `wrapperHeight` is the wrapper's rendered height, and
 * `viewportHeight` is `window.innerHeight`.
 *
 * Pulled out as a pure function so the scroll-to-progress math is testable
 * without simulating real layout or `requestAnimationFrame` in jsdom.
 */
export function computeExplodeProgress(
  top: number,
  wrapperHeight: number,
  viewportHeight: number,
): number {
  const scrollableDistance = wrapperHeight - viewportHeight;
  if (scrollableDistance <= 0) return 0;
  const raw = -top / scrollableDistance;
  return Math.min(1, Math.max(0, raw));
}
