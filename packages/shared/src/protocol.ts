/**
 * The wire protocol, shared verbatim by client and server.
 *
 * Both sides import these typed event maps so that Socket.IO's generics catch a
 * mismatched event name or payload at compile time — the network boundary is as
 * type-safe as a local function call.
 */

import type { Move } from "./cards.js";
import type { ClientGameState, TurnResult } from "./index.js";

export interface ServerToClientEvents {
  "lobby:queued": (payload: { position: number }) => void;
  "lobby:room_created": (payload: { roomCode: string }) => void;
  "lobby:waiting": (payload: { roomCode: string }) => void;
  "lobby:error": (payload: { message: string }) => void;

  "game:start": (payload: { state: ClientGameState }) => void;
  "game:state": (payload: { state: ClientGameState }) => void;
  /** Sent the instant both players have locked in; carries the resolved turn. */
  "game:reveal": (payload: { state: ClientGameState; result: TurnResult }) => void;
  "game:over": (payload: { state: ClientGameState }) => void;
  "game:opponent_disconnected": (payload: { name: string }) => void;
  "game:opponent_reconnected": (payload: { name: string }) => void;
  "game:opponent_left": (payload: { name: string }) => void;
  /** Server-driven countdown for the current selection phase, in ms remaining. */
  "game:timer": (payload: { deadline: number }) => void;
}

export interface ClientToServerEvents {
  "lobby:queue": (payload: { name?: string }) => void;
  "lobby:cancel": () => void;
  "lobby:create_room": (payload: { name?: string }) => void;
  "lobby:join_room": (payload: { roomCode: string; name?: string }) => void;
  "game:submit": (payload: { card: Move }) => void;
  "game:rematch": () => void;
  /** Reattach to an in-progress game after a reload/disconnect. */
  "game:resume": (payload: { token: string }) => void;
}

export const TURN_TIME_MS = 30_000;
