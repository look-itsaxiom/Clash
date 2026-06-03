import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import {
  type ClientToServerEvents,
  type Move,
  type ServerToClientEvents,
  TURN_TIME_MS,
  bothReady,
  createGame,
  createPlayer,
  legalMoves,
  rematch,
  resolve,
  submit,
  viewFor,
} from "@clash/shared";
import type { Room, Seat } from "./types";

export interface SocketData {
  playerId: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

/** Grace window for a disconnected player to return before forfeiting. */
const DISCONNECT_GRACE_MS = 45_000;
const MAX_NAME_LEN = 16;

/**
 * Owns all live game state: the matchmaking queue, private rooms, in-progress
 * games, turn timers, and reconnection. The gateway is a thin adapter that
 * forwards socket events here; this service is where the rules engine meets the
 * network.
 */
@Injectable()
export class GameService {
  private readonly log = new Logger(GameService.name);
  private server!: GameServer;

  private readonly rooms = new Map<string, Room>();
  private readonly playerRoom = new Map<string, string>();
  private readonly playerSocket = new Map<string, string>();
  private readonly pendingName = new Map<string, string>();

  /** Player ids waiting for a random opponent. */
  private queue: string[] = [];
  /** Open private rooms keyed by their share code, holding the waiting host. */
  private readonly pendingRooms = new Map<string, Seat>();

  bind(server: GameServer): void {
    this.server = server;
  }

  // ---- connection lifecycle -------------------------------------------------

  handleConnect(socket: GameSocket): void {
    const playerId = randomUUID();
    socket.data.playerId = playerId;
    this.playerSocket.set(playerId, socket.id);
    this.log.log(`connect ${socket.id} -> player ${playerId}`);
  }

  handleDisconnect(socket: GameSocket): void {
    const playerId: string | undefined = socket.data.playerId;
    if (!playerId) return;
    // Only release the binding if this socket is the current one for the player
    // (guards against a stale disconnect after a resume re-bound the player).
    if (this.playerSocket.get(playerId) === socket.id) {
      this.playerSocket.delete(playerId);
    }
    this.removeFromQueue(playerId);

    const room = this.roomOf(playerId);
    if (!room || room.state.phase === "FINISHED") return;

    this.setConnected(room, playerId, false);
    const opponent = this.opponentSeat(room, playerId);
    if (opponent) this.emit(opponent.playerId, "game:opponent_disconnected", { name: this.nameOf(room, playerId) });

    // Forfeit if the player does not return within the grace window.
    const grace = setTimeout(() => this.forfeit(room, playerId), DISCONNECT_GRACE_MS);
    grace.unref?.();
    room.graceTimers.set(playerId, grace);
  }

  // ---- matchmaking ----------------------------------------------------------

  queueRandom(socket: GameSocket, name?: string): void {
    const playerId = this.idOf(socket);
    this.pendingName.set(playerId, sanitizeName(name));
    this.releaseIfFinished(playerId);
    if (this.playerRoom.has(playerId) || this.queue.includes(playerId)) return;

    const waiting = this.queue.shift();
    if (waiting && waiting !== playerId && this.playerSocket.has(waiting)) {
      this.startGame(this.seatFor(waiting), this.seatFor(playerId));
      return;
    }
    this.queue.push(playerId);
    this.emit(playerId, "lobby:queued", { position: this.queue.length });
  }

  cancelQueue(socket: GameSocket): void {
    this.removeFromQueue(this.idOf(socket));
  }

  createRoom(socket: GameSocket, name?: string): void {
    const playerId = this.idOf(socket);
    this.pendingName.set(playerId, sanitizeName(name));
    this.releaseIfFinished(playerId);
    const code = this.freshRoomCode();
    this.pendingRooms.set(code, this.seatFor(playerId));
    this.emit(playerId, "lobby:room_created", { roomCode: code });
    this.emit(playerId, "lobby:waiting", { roomCode: code });
  }

  joinRoom(socket: GameSocket, roomCode: string, name?: string): void {
    const playerId = this.idOf(socket);
    this.releaseIfFinished(playerId);
    const code = roomCode.trim().toUpperCase();
    const host = this.pendingRooms.get(code);
    if (!host) {
      this.emit(playerId, "lobby:error", { message: `No open room "${code}".` });
      return;
    }
    if (host.playerId === playerId) {
      this.emit(playerId, "lobby:error", { message: "You cannot join your own room." });
      return;
    }
    this.pendingRooms.delete(code);
    this.pendingName.set(playerId, sanitizeName(name));
    this.startGame(host, this.seatFor(playerId));
  }

  // ---- gameplay -------------------------------------------------------------

  submitMove(socket: GameSocket, move: Move): void {
    const playerId = this.idOf(socket);
    const room = this.roomOf(playerId);
    if (!room || room.state.phase !== "SELECTING") return;

    try {
      room.state = submit(room.state, playerId, move);
    } catch (err) {
      this.emit(playerId, "lobby:error", { message: (err as Error).message });
      return;
    }

    if (bothReady(room.state)) {
      this.resolveTurn(room);
    } else {
      this.broadcastState(room);
    }
  }

  rematchVote(socket: GameSocket): void {
    const playerId = this.idOf(socket);
    const room = this.roomOf(playerId);
    if (!room || room.state.phase !== "FINISHED") return;

    room.rematchVotes.add(playerId);
    if (room.rematchVotes.size >= 2) {
      room.rematchVotes.clear();
      room.state = rematch(room.state);
      this.broadcast(room, "game:start", (pid) => ({ state: viewFor(room.state, pid) }));
      this.startTurnTimer(room);
    }
  }

  /** A player explicitly leaves a match (clicked "Leave"). */
  leaveGame(socket: GameSocket): void {
    const playerId = this.idOf(socket);
    const room = this.roomOf(playerId);
    if (!room) return;

    // Leaving mid-game is a forfeit; leaving a finished game just frees the seat.
    if (room.state.phase !== "FINISHED") {
      this.forfeit(room, playerId);
      return;
    }
    const opponent = this.opponentSeat(room, playerId);
    if (opponent && this.playerRoom.get(opponent.playerId) === room.id) {
      this.emit(opponent.playerId, "game:opponent_left", { name: this.nameOf(room, playerId) });
    }
    this.releaseIfFinished(playerId);
  }

  /**
   * Detaches a player from a room they are still mapped to only because it
   * finished, so they are free to queue or host again. Disposes the room once
   * neither player references it.
   */
  private releaseIfFinished(playerId: string): void {
    const room = this.roomOf(playerId);
    if (!room || room.state.phase !== "FINISHED") return;
    this.playerRoom.delete(playerId);
    room.rematchVotes.delete(playerId);
    const stillReferenced = room.seats.some((s) => this.playerRoom.get(s.playerId) === room.id);
    if (!stillReferenced) this.disposeRoom(room);
  }

  resume(socket: GameSocket, token: string): void {
    const room = this.rooms.get(this.playerRoom.get(token) ?? "");
    if (!room || !room.seats.some((s) => s.playerId === token)) {
      this.emit(this.idOf(socket), "lobby:error", { message: "Game not found — it may have ended." });
      return;
    }
    // Re-bind this socket to the returning player's identity.
    const stale = socket.data.playerId;
    if (stale && stale !== token) {
      this.playerSocket.delete(stale);
      this.pendingName.delete(stale);
    }
    socket.data.playerId = token;
    this.playerSocket.set(token, socket.id);

    const grace = room.graceTimers.get(token);
    if (grace) {
      clearTimeout(grace);
      room.graceTimers.delete(token);
    }
    this.setConnected(room, token, true);

    const opponent = this.opponentSeat(room, token);
    if (opponent) this.emit(opponent.playerId, "game:opponent_reconnected", { name: this.nameOf(room, token) });

    this.emit(token, "game:start", { state: viewFor(room.state, token) });
    if (room.deadline) this.emit(token, "game:timer", { deadline: room.deadline });
  }

  // ---- internals ------------------------------------------------------------

  private startGame(a: Seat, b: Seat): void {
    const id = randomUUID();
    const state = createGame(
      id,
      createPlayer(a.playerId, a.name),
      createPlayer(b.playerId, b.name),
    );
    const room: Room = {
      id,
      state,
      seats: [a, b],
      deadline: null,
      turnTimer: null,
      rematchVotes: new Set(),
      graceTimers: new Map(),
    };
    this.rooms.set(id, room);
    this.playerRoom.set(a.playerId, id);
    this.playerRoom.set(b.playerId, id);
    this.pendingName.delete(a.playerId);
    this.pendingName.delete(b.playerId);

    this.broadcast(room, "game:start", (pid) => ({ state: viewFor(room.state, pid) }));
    this.startTurnTimer(room);
    this.log.log(`game ${id}: ${a.name} vs ${b.name}`);
  }

  private resolveTurn(room: Room): void {
    this.clearTurnTimer(room);
    room.state = resolve(room.state);
    const result = room.state.lastResult!;
    this.broadcast(room, "game:reveal", (pid) => ({ state: viewFor(room.state, pid), result }));

    if (room.state.phase === "FINISHED") {
      this.broadcast(room, "game:over", (pid) => ({ state: viewFor(room.state, pid) }));
    } else {
      this.startTurnTimer(room);
    }
  }

  private startTurnTimer(room: Room): void {
    this.clearTurnTimer(room);
    room.deadline = Date.now() + TURN_TIME_MS;
    room.turnTimer = setTimeout(() => this.onTurnTimeout(room), TURN_TIME_MS);
    room.turnTimer.unref?.();
    this.broadcast(room, "game:timer", () => ({ deadline: room.deadline! }));
  }

  private clearTurnTimer(room: Room): void {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.deadline = null;
  }

  /** Auto-pick for anyone who let the clock run out, then resolve. */
  private onTurnTimeout(room: Room): void {
    if (room.state.phase !== "SELECTING") return;
    for (const player of room.state.players) {
      if (player.selected === null) {
        const moves = legalMoves(player);
        room.state = submit(room.state, player.id, autoPick(moves));
      }
    }
    this.resolveTurn(room);
  }

  private forfeit(room: Room, quitterId: string): void {
    room.graceTimers.delete(quitterId);
    if (room.state.phase === "FINISHED") return;
    const opponent = this.opponentSeat(room, quitterId);
    this.clearTurnTimer(room);
    room.state = {
      ...room.state,
      phase: "FINISHED",
      winnerId: opponent ? opponent.playerId : null,
      draw: false,
    };
    if (opponent) {
      this.emit(opponent.playerId, "game:opponent_left", { name: this.nameOf(room, quitterId) });
      this.emit(opponent.playerId, "game:over", { state: viewFor(room.state, opponent.playerId) });
    }
    this.disposeRoom(room);
  }

  private disposeRoom(room: Room): void {
    this.clearTurnTimer(room);
    for (const t of room.graceTimers.values()) clearTimeout(t);
    room.graceTimers.clear();
    for (const seat of room.seats) {
      if (this.playerRoom.get(seat.playerId) === room.id) this.playerRoom.delete(seat.playerId);
    }
    this.rooms.delete(room.id);
  }

  private broadcastState(room: Room): void {
    this.broadcast(room, "game:state", (pid) => ({ state: viewFor(room.state, pid) }));
  }

  private broadcast<E extends keyof ServerToClientEvents>(
    room: Room,
    event: E,
    payload: (playerId: string) => Parameters<ServerToClientEvents[E]>[0],
  ): void {
    for (const seat of room.seats) {
      this.emit(seat.playerId, event, payload(seat.playerId));
    }
  }

  private emit<E extends keyof ServerToClientEvents>(
    playerId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    const socketId = this.playerSocket.get(playerId);
    if (!socketId) return;
    // socket.io places each socket in a room named after its own id. We emit
    // through a narrowed signature to sidestep its heavily-overloaded generics;
    // the payload is already statically checked by the `broadcast`/`emit` types.
    type Emitter = { emit(event: string, payload: unknown): void };
    (this.server.to(socketId) as unknown as Emitter).emit(event, payload);
  }

  private setConnected(room: Room, playerId: string, connected: boolean): void {
    const players = room.state.players.map((p) =>
      p.id === playerId ? { ...p, connected } : p,
    ) as typeof room.state.players;
    room.state = { ...room.state, players };
  }

  private idOf(socket: GameSocket): string {
    return socket.data.playerId as string;
  }

  private roomOf(playerId: string): Room | undefined {
    const roomId = this.playerRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  private seatFor(playerId: string): Seat {
    return { playerId, name: this.pendingName.get(playerId) ?? "Player" };
  }

  private opponentSeat(room: Room, playerId: string): Seat | undefined {
    return room.seats.find((s) => s.playerId !== playerId);
  }

  private nameOf(room: Room, playerId: string): string {
    return room.seats.find((s) => s.playerId === playerId)?.name ?? "Player";
  }

  private removeFromQueue(playerId: string): void {
    this.queue = this.queue.filter((id) => id !== playerId);
    for (const [code, seat] of this.pendingRooms) {
      if (seat.playerId === playerId) this.pendingRooms.delete(code);
    }
  }

  private freshRoomCode(): string {
    let code = "";
    do {
      code = randomRoomCode();
    } while (this.pendingRooms.has(code));
    return code;
  }
}

/** Prefer a productive default when auto-picking on timeout: defend, else first legal move. */
function autoPick(moves: Move[]): Move {
  if (moves.includes("DEFENSE")) return "DEFENSE";
  return moves[0] ?? "PASS";
}

function sanitizeName(name?: string): string {
  const trimmed = (name ?? "").trim().slice(0, MAX_NAME_LEN);
  return trimmed.length > 0 ? trimmed : "Player";
}

function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
