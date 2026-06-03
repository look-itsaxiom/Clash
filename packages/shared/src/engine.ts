/**
 * The Clash rules engine.
 *
 * Pure and deterministic: every function takes state and returns new state
 * (or a derived value) without mutating its input and without any I/O,
 * randomness, or clock access. This is what lets the same engine run on the
 * authoritative server, drive client-side prediction, and power unit tests and
 * replays from a single source of truth.
 *
 * Turn lifecycle: `SELECTING` → both players `submit()` a move → `resolve()`
 * reveals and applies both moves simultaneously → back to `SELECTING`, or
 * `FINISHED` once someone hits 0 hearts (a double-KO is a draw).
 */

import { CARDS, type CardId, type Move } from "./cards.js";
import {
  MAX_HEARTS,
  STARTING_HAND,
  STARTING_HEARTS,
  type GameState,
  type PlayerSlot,
  type PlayerState,
  type TurnResult,
  type TurnResultEntry,
} from "./state.js";

export class GameError extends Error {}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function createPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    connected: true,
    hearts: STARTING_HEARTS,
    hand: [...STARTING_HAND],
    discard: [],
    selected: null,
  };
}

export function createGame(id: string, p0: PlayerState, p1: PlayerState): GameState {
  return {
    id,
    phase: "SELECTING",
    turn: 1,
    players: [p0, p1],
    lastResult: null,
    winnerId: null,
    draw: false,
  };
}

export function findSlot(state: GameState, playerId: string): PlayerSlot | -1 {
  if (state.players[0].id === playerId) return 0;
  if (state.players[1].id === playerId) return 1;
  return -1;
}

/**
 * The moves a player may legally submit. With cards in hand, that is the set of
 * distinct cards held; with an empty hand the only option is `PASS`, which is
 * how Clash gracefully handles a player who has run out of cards instead of
 * soft-locking.
 */
export function legalMoves(player: PlayerState): Move[] {
  if (player.hand.length === 0) return ["PASS"];
  return [...new Set(player.hand)];
}

export function bothReady(state: GameState): boolean {
  return state.players[0].selected !== null && state.players[1].selected !== null;
}

/** Records a player's move for the turn. Does not resolve — call {@link resolve} once both are ready. */
export function submit(state: GameState, playerId: string, move: Move): GameState {
  if (state.phase !== "SELECTING") {
    throw new GameError(`Cannot submit during phase ${state.phase}.`);
  }
  const slot = findSlot(state, playerId);
  if (slot === -1) throw new GameError(`Unknown player ${playerId}.`);

  const player = state.players[slot];
  if (player.selected !== null) {
    throw new GameError(`Player ${playerId} has already chosen this turn.`);
  }
  if (!legalMoves(player).includes(move)) {
    throw new GameError(`Move ${move} is not legal for ${playerId}.`);
  }

  const players = clonePlayers(state.players);
  players[slot] = { ...players[slot], selected: move };
  return { ...state, players };
}

/** Splits a discard pile into the cards Recharge returns and the one-time cards it leaves behind. */
function partitionDiscard(discard: CardId[]): { returned: CardId[]; kept: CardId[] } {
  const returned: CardId[] = [];
  const kept: CardId[] = [];
  for (const card of discard) {
    if (CARDS[card].oneTime) kept.push(card);
    else returned.push(card);
  }
  return { returned, kept };
}

interface ResolvedSide {
  player: PlayerState;
  entry: TurnResultEntry;
}

/**
 * Resolves one move against the opponent's move using a snapshot of both
 * players taken before any mutation, so the two halves of a turn truly happen
 * "simultaneously" — neither player's outcome can depend on the other's having
 * already been applied.
 */
function resolveSide(
  self: PlayerState,
  opponent: PlayerState,
  selfMove: Move,
  opponentMove: Move,
): ResolvedSide {
  const incoming = opponentMove === "PASS" ? 0 : CARDS[opponentMove].damage;
  const blocking = selfMove !== "PASS" && CARDS[selfMove].blocks;
  const damageBlocked = blocking ? incoming : 0;
  const damageTaken = incoming - damageBlocked;

  const selfDef = selfMove === "PASS" ? null : CARDS[selfMove];
  const nominalHeal = selfDef?.heal ?? 0;

  const heartsBefore = self.hearts;
  const heartsAfter = clamp(heartsBefore - damageTaken + nominalHeal, 0, MAX_HEARTS);
  const healed = Math.max(0, heartsAfter - clamp(heartsBefore - damageTaken, 0, MAX_HEARTS));

  // The played card leaves the hand. Recharge then reads the discard *before*
  // this turn's card is added to it, so a freshly played Recharge never returns
  // itself.
  let hand = [...self.hand];
  if (selfMove !== "PASS") {
    const idx = hand.indexOf(selfMove);
    if (idx !== -1) hand.splice(idx, 1);
  }
  let discard = [...self.discard];
  let recharged = 0;
  if (selfDef?.recharges) {
    const { returned, kept } = partitionDiscard(discard);
    hand = [...hand, ...returned];
    discard = kept;
    recharged = returned.length;
  }
  if (selfMove !== "PASS") discard = [...discard, selfMove];

  const player: PlayerState = {
    ...self,
    hearts: heartsAfter,
    hand,
    discard,
    selected: null,
  };

  const entry: TurnResultEntry = {
    playerId: self.id,
    card: selfMove,
    damageDealt: 0, // landed damage is attributed in `resolve` once both blocks are known
    damageBlocked,
    healed,
    recharged,
    heartsBefore,
    heartsAfter,
  };
  return { player, entry };
}

function narrate(entry: TurnResultEntry, opponentName: string): string[] {
  const name = CARDS[entry.card === "PASS" ? "ATTACK" : entry.card];
  const lines: string[] = [];
  if (entry.card === "PASS") {
    lines.push(`has no cards left and passes.`);
    return lines;
  }
  const lostHearts = entry.heartsBefore - entry.heartsAfter;
  switch (entry.card) {
    case "ATTACK":
    case "HEAVY_ATTACK":
      // Damage dealt is reported from the defender's perspective below; here we
      // describe the action itself.
      lines.push(`plays ${name.emoji} ${name.name}.`);
      break;
    case "DEFENSE":
      lines.push(
        entry.damageBlocked > 0
          ? `🛡️ blocks ${entry.damageBlocked} damage!`
          : `🛡️ braces, but nothing comes.`,
      );
      break;
    case "HEAL":
      lines.push(entry.healed > 0 ? `💚 heals ${entry.healed} heart.` : `💚 heals, but is already full.`);
      break;
    case "RECHARGE":
      lines.push(
        entry.recharged > 0
          ? `🔄 recharges ${entry.recharged} card${entry.recharged === 1 ? "" : "s"}.`
          : `🔄 recharges, but the discard is empty.`,
      );
      break;
  }
  if (lostHearts > 0) lines.push(`takes ${lostHearts} damage from ${opponentName}.`);
  return lines;
}

/**
 * Reveals both chosen moves and applies them simultaneously, then advances the
 * game. Requires both players to have submitted. A double knockout is a draw.
 */
export function resolve(state: GameState): GameState {
  if (state.phase !== "SELECTING") throw new GameError(`Cannot resolve during phase ${state.phase}.`);
  const [a0, a1] = state.players;
  if (a0.selected === null || a1.selected === null) {
    throw new GameError("Both players must choose before the turn can resolve.");
  }

  const m0 = a0.selected;
  const m1 = a1.selected;
  const left = resolveSide(a0, a1, m0, m1);
  const right = resolveSide(a1, a0, m1, m0);

  // Attribute the damage each player actually landed (after the opponent's block).
  left.entry.damageDealt = clampDealt(m0, right.entry.damageBlocked);
  right.entry.damageDealt = clampDealt(m1, left.entry.damageBlocked);

  const players: [PlayerState, PlayerState] = [left.player, right.player];

  const messages: string[] = [];
  for (const line of narrate(left.entry, a1.name)) messages.push(`${a0.name} ${line}`);
  for (const line of narrate(right.entry, a0.name)) messages.push(`${a1.name} ${line}`);

  const lastResult: TurnResult = {
    turn: state.turn,
    entries: [left.entry, right.entry],
    messages,
  };

  const dead0 = players[0].hearts <= 0;
  const dead1 = players[1].hearts <= 0;
  const stalemate = players[0].hand.length === 0 && players[1].hand.length === 0;

  let phase: GameState["phase"] = "SELECTING";
  let winnerId: string | null = null;
  let draw = false;

  if (dead0 || dead1 || stalemate) {
    phase = "FINISHED";
    if (dead0 && dead1) draw = true;
    else if (dead0) winnerId = players[1].id;
    else if (dead1) winnerId = players[0].id;
    else if (players[0].hearts > players[1].hearts) winnerId = players[0].id;
    else if (players[1].hearts > players[0].hearts) winnerId = players[1].id;
    else draw = true;
  }

  return {
    ...state,
    players,
    phase,
    turn: phase === "FINISHED" ? state.turn : state.turn + 1,
    lastResult,
    winnerId,
    draw,
  };
}

function clampDealt(move: Move, blocked: number): number {
  if (move === "PASS") return 0;
  return Math.max(0, CARDS[move].damage - blocked);
}

/** Starts a fresh game between the same two players, preserving names and ids. */
export function rematch(state: GameState): GameState {
  return createGame(
    state.id,
    { ...createPlayer(state.players[0].id, state.players[0].name), connected: state.players[0].connected },
    { ...createPlayer(state.players[1].id, state.players[1].name), connected: state.players[1].connected },
  );
}

function clonePlayers(players: [PlayerState, PlayerState]): [PlayerState, PlayerState] {
  return [
    { ...players[0], hand: [...players[0].hand], discard: [...players[0].discard] },
    { ...players[1], hand: [...players[1].hand], discard: [...players[1].discard] },
  ];
}

export { STARTING_HEARTS, MAX_HEARTS };
