/**
 * Serializable game state.
 *
 * Everything here is plain JSON — no class instances, no functions — so a full
 * game can be sent over a socket, persisted, or snapshotted for a replay
 * without any custom serialization. The engine in `engine.ts` treats these
 * structures as immutable: every transition returns a fresh object.
 */

import type { CardId, Move } from "./cards.js";

export const STARTING_HEARTS = 3;
export const MAX_HEARTS = 3;

/** The fixed opening hand. Clash has no shuffle or draw — it is fully deterministic. */
export const STARTING_HAND: readonly CardId[] = [
  "ATTACK",
  "ATTACK",
  "HEAVY_ATTACK",
  "DEFENSE",
  "DEFENSE",
  "HEAL",
  "RECHARGE",
];

export type PlayerSlot = 0 | 1;

export interface PlayerState {
  id: string;
  name: string;
  connected: boolean;
  hearts: number;
  hand: CardId[];
  discard: CardId[];
  /**
   * The move locked in for the current turn, hidden from the opponent until the
   * reveal. `null` means the player has not chosen yet.
   */
  selected: Move | null;
}

export type GamePhase = "WAITING" | "SELECTING" | "REVEAL" | "FINISHED";

/** Per-player breakdown of what happened during a single resolved turn. */
export interface TurnResultEntry {
  playerId: string;
  card: Move;
  damageDealt: number;
  damageBlocked: number;
  healed: number;
  /** Number of cards returned to hand by Recharge. */
  recharged: number;
  heartsBefore: number;
  heartsAfter: number;
}

export interface TurnResult {
  turn: number;
  entries: [TurnResultEntry, TurnResultEntry];
  /** Human-readable, ordered narration of the turn for the UI/log. */
  messages: string[];
}

export interface GameState {
  id: string;
  phase: GamePhase;
  /** 1-based turn counter. */
  turn: number;
  players: [PlayerState, PlayerState];
  /** Result of the most recently resolved turn, or `null` before the first reveal. */
  lastResult: TurnResult | null;
  winnerId: string | null;
  draw: boolean;
}
