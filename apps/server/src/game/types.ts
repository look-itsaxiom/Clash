import type { GameState } from "@clash/shared";

export interface Seat {
  playerId: string;
  name: string;
}

export interface Room {
  id: string;
  state: GameState;
  seats: [Seat, Seat];
  /** Epoch ms by which the current selection phase must complete, or null when idle. */
  deadline: number | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  /** Players who have voted to rematch after a finished game. */
  rematchVotes: Set<string>;
  /** Grace-period timers keyed by playerId, started when a player disconnects. */
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
}
