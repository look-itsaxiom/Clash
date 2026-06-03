/**
 * Fog-of-war projections.
 *
 * The authoritative {@link GameState} contains both players' hands and locked-in
 * moves — information a client must never see for the opponent. `viewFor`
 * projects the full state down to exactly what a single player is allowed to
 * know: their own hand in full, the opponent as counts only, and the
 * opponent's chosen move hidden until the reveal.
 */

import type { CardId, Move } from "./cards.js";
import { legalMoves } from "./engine.js";
import type { GamePhase, GameState, PlayerSlot, TurnResult } from "./state.js";

export interface SelfView {
  slot: PlayerSlot;
  id: string;
  name: string;
  connected: boolean;
  hearts: number;
  hand: CardId[];
  discard: CardId[];
  selected: Move | null;
  legalMoves: Move[];
}

export interface OpponentView {
  id: string;
  name: string;
  connected: boolean;
  hearts: number;
  handCount: number;
  discard: CardId[];
  /** Their actual move, revealed only once the turn is being shown. */
  selected: Move | null;
  /** True as soon as they have locked in, even while the move itself stays hidden. */
  hasSelected: boolean;
}

export interface ClientGameState {
  id: string;
  phase: GamePhase;
  turn: number;
  you: SelfView;
  opponent: OpponentView;
  lastResult: TurnResult | null;
  winnerId: string | null;
  draw: boolean;
}

const MAX_HEARTS_CONST = 3;
export const VIEW_MAX_HEARTS = MAX_HEARTS_CONST;

export function viewFor(state: GameState, playerId: string): ClientGameState {
  const youSlot: PlayerSlot = state.players[0].id === playerId ? 0 : 1;
  const oppSlot: PlayerSlot = youSlot === 0 ? 1 : 0;
  const me = state.players[youSlot];
  const them = state.players[oppSlot];

  // The opponent's move is secret while either player is still choosing.
  const revealOpponent = state.phase === "REVEAL" || state.phase === "FINISHED";

  return {
    id: state.id,
    phase: state.phase,
    turn: state.turn,
    you: {
      slot: youSlot,
      id: me.id,
      name: me.name,
      connected: me.connected,
      hearts: me.hearts,
      hand: [...me.hand],
      discard: [...me.discard],
      selected: me.selected,
      legalMoves: legalMoves(me),
    },
    opponent: {
      id: them.id,
      name: them.name,
      connected: them.connected,
      hearts: them.hearts,
      handCount: them.hand.length,
      discard: [...them.discard],
      selected: revealOpponent ? them.selected : null,
      hasSelected: them.selected !== null,
    },
    lastResult: state.lastResult,
    winnerId: state.winnerId,
    draw: state.draw,
  };
}
