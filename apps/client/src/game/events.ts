import type { ClientGameState, TurnResult } from "@clash/shared";

/**
 * The bridge between React (which owns the socket) and Phaser (which owns the
 * board). React publishes authoritative state down; the scene publishes player
 * intent back up. Centralising the names and payload types here keeps the two
 * worlds in lockstep.
 */
export const ClashEvent = {
  /** React → Phaser: full authoritative view to render. */
  View: "clash:view",
  /** React → Phaser: a resolved turn to animate before settling on the new view. */
  Reveal: "clash:reveal",
  /** React → Phaser: leave the board (back to lobby). */
  Reset: "clash:reset",
  /** Phaser → React: the scene has mounted and wants the current view. */
  Ready: "clash:ready",
  /** Phaser → React: the player chose a move. */
  Play: "clash:play",
} as const;

export interface RevealPayload {
  state: ClientGameState;
  result: TurnResult;
}
