/** Rendering constants, kept dependency-free so both `main.ts` and the scenes
 * can import them without creating a circular module dependency. */

// Render the internal canvas at 2x the logical size so the browser DOWN-scales
// it to fit the page (sharp supersampling) instead of up-scaling a small canvas
// (which looks grainy).
export const SUPERSAMPLE = 2;

/** Pick a landscape or portrait aspect to match the current viewport, so the
 *  board fills the screen with minimal letterboxing on phones and desktops. */
export function logicalBoardSize(): { width: number; height: number } {
  const portrait = window.innerHeight > window.innerWidth;
  return portrait ? { width: 720, height: 1280 } : { width: 1280, height: 800 };
}
