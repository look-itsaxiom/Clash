export type CardType =
  | "ATTACK"
  | "HEAVY_ATTACK"
  | "DEFENSE"
  | "HEAL"
  | "RECHARGE";

export interface PlayerState {
  id: string;
  hearts: number;
  hand: CardType[];
  discard: CardType[];
  selectedCard?: CardType | null;
}

export interface ClashGameState {
  id: string;
  players: [PlayerState, PlayerState];
  status: "WAITING" | "PLAYING" | "FINISHED";
  winnerId?: string | null;
  draw?: boolean;
}

export const StartingHand: CardType[] = [
  "ATTACK",
  "ATTACK",
  "HEAVY_ATTACK",
  "DEFENSE",
  "DEFENSE",
  "HEAL",
  "RECHARGE",
];

export const StartingHearts = 3;

export function createNewGame(
  id: string,
  player1Id: string,
  player2Id: string
): ClashGameState {
  return {
    id,
    status: "PLAYING",
    players: [
      {
        id: player1Id,
        hearts: StartingHearts,
        hand: [...StartingHand],
        discard: [],
        selectedCard: null,
      },
      {
        id: player2Id,
        hearts: StartingHearts,
        hand: [...StartingHand],
        discard: [],
        selectedCard: null,
      },
    ],
  };
}

export function submitCard(
  state: ClashGameState,
  playerId: string,
  card: CardType
): ClashGameState {
  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    if (!player.hand.includes(card)) {
      throw new Error(`Player ${playerId} does not have card ${card} in hand.`);
    }

    const newHand = [...player.hand];
    const idx = player.hand.indexOf(card);
    newHand.splice(idx, 1);
    return {
      ...player,
      hand: newHand,
      selectedCard: card,
    } as PlayerState;
  }) as [PlayerState, PlayerState];

  return { ...state, players };
}

export function resolveTurn(state: ClashGameState): ClashGameState {
  const [player1, player2] = state.players;
  if (!player1.selectedCard || !player2.selectedCard) return state; // Can't resolve yet

  // Example resolution logic (to be expanded)
  const card1 = player1.selectedCard;
  const card2 = player2.selectedCard;

  switch (card1) {
    case "ATTACK":
      if (card2 !== "DEFENSE") {
      }
      break;
    case "HEAVY_ATTACK":
      if (card2 !== "DEFENSE") {
      }
      break;
    case "HEAL":
      player1.hearts += 1;
      break;
    case "RECHARGE":
      // Implement recharge logic
      break;
    case "DEFENSE":
      // Implement defense logic
      break;
  }

  player1.discard.push(card1);
  player2.discard.push(card2);
  player1.selectedCard = null;
  player2.selectedCard = null;

  return { ...state, players: [player1, player2] };
}
