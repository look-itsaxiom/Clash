/** Logical board dimensions (the aspect ratio the layout is designed around).
 * Kept dependency-free so both `main.ts` and the scenes can import them without
 * creating a circular module dependency. The scene lays out proportionally, so
 * these are about shape (16:10), not absolute pixels. */
export const BOARD_WIDTH = 1280;
export const BOARD_HEIGHT = 800;
