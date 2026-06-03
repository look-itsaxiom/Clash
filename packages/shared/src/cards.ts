/**
 * Card catalog for Clash.
 *
 * The game is intentionally tiny, so the entire rule surface lives in data here
 * rather than scattered across `switch` statements. The engine reads these
 * descriptors to resolve a turn, which keeps the logic declarative and makes
 * adding a new card a matter of adding a row to {@link CARDS}.
 */

export type CardId = "ATTACK" | "HEAVY_ATTACK" | "DEFENSE" | "HEAL" | "RECHARGE";

/** A move a player can submit. `PASS` is only legal when a hand is empty. */
export type Move = CardId | "PASS";

export interface CardDef {
  id: CardId;
  name: string;
  emoji: string;
  description: string;
  /** One-time cards are removed from the game on use — Recharge never returns them. */
  oneTime: boolean;
  /** Damage dealt to the opponent (0 for non-offensive cards). */
  damage: number;
  /** Hearts restored to self. */
  heal: number;
  /** Nullifies all incoming attack damage this turn. */
  blocks: boolean;
  /** Returns every non-one-time card from the player's discard pile to hand. */
  recharges: boolean;
}

export const CARDS: Record<CardId, CardDef> = {
  ATTACK: {
    id: "ATTACK",
    name: "Attack",
    emoji: "⚔️",
    description: "Deal 1 damage to your opponent.",
    oneTime: false,
    damage: 1,
    heal: 0,
    blocks: false,
    recharges: false,
  },
  HEAVY_ATTACK: {
    id: "HEAVY_ATTACK",
    name: "Heavy Attack",
    emoji: "💥",
    description: "Deal 2 damage. One-time use — never returns.",
    oneTime: true,
    damage: 2,
    heal: 0,
    blocks: false,
    recharges: false,
  },
  DEFENSE: {
    id: "DEFENSE",
    name: "Defense",
    emoji: "🛡️",
    description: "Block all incoming attack damage this turn.",
    oneTime: false,
    damage: 0,
    heal: 0,
    blocks: true,
    recharges: false,
  },
  HEAL: {
    id: "HEAL",
    name: "Heal",
    emoji: "💚",
    description: "Restore 1 heart. One-time use — never returns.",
    oneTime: true,
    damage: 0,
    heal: 1,
    blocks: false,
    recharges: false,
  },
  RECHARGE: {
    id: "RECHARGE",
    name: "Recharge",
    emoji: "🔄",
    description: "Return all spent cards (except one-time cards) to your hand.",
    oneTime: false,
    damage: 0,
    heal: 0,
    blocks: false,
    recharges: true,
  },
};

export const ALL_CARD_IDS = Object.keys(CARDS) as CardId[];

export function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && value in CARDS;
}

export function isMove(value: unknown): value is Move {
  return value === "PASS" || isCardId(value);
}
