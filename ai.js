// AI card selection logic
function aiSelectCard() {
    const aiHand = GameState.ai.hand;
    
    if (aiHand.length === 0) {
        return null;
    }
    
    // AI strategy based on game state
    let selectedIndex = 0;
    
    // Strategy 1: If low on health, try to heal
    if (GameState.ai.hearts <= 1) {
        const healIndex = aiHand.findIndex(card => card.type === CardType.HEAL);
        if (healIndex !== -1) {
            selectedIndex = healIndex;
            return aiHand.splice(selectedIndex, 1)[0];
        }
    }
    
    // Strategy 2: If hand is low, try to recharge
    if (aiHand.length <= 2) {
        const rechargeIndex = aiHand.findIndex(card => card.type === CardType.RECHARGE);
        if (rechargeIndex !== -1 && GameState.ai.discard.length > 0) {
            selectedIndex = rechargeIndex;
            return aiHand.splice(selectedIndex, 1)[0];
        }
    }
    
    // Strategy 3: Balanced approach - prefer attack slightly
    const availableCards = [...aiHand];
    const weights = availableCards.map(card => {
        switch (card.type) {
            case CardType.ATTACK:
                // More aggressive when ahead
                return GameState.ai.hearts > GameState.player.hearts ? 40 : 30;
            case CardType.DEFENSE:
                // More defensive when behind
                return GameState.ai.hearts < GameState.player.hearts ? 35 : 25;
            case CardType.HEAL:
                // Prioritize when injured
                return GameState.ai.hearts < 3 ? 30 : 15;
            case CardType.RECHARGE:
                // Use when discard has many cards
                return GameState.ai.discard.length >= 3 ? 35 : 10;
            default:
                return 20;
        }
    });
    
    // Weighted random selection
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            selectedIndex = i;
            break;
        }
    }
    
    return aiHand.splice(selectedIndex, 1)[0];
}

// Additional AI helper functions

// Evaluate board state
function evaluateBoardState() {
    const playerStrength = GameState.player.hearts + GameState.player.hand.length * 0.5;
    const aiStrength = GameState.ai.hearts + GameState.ai.hand.length * 0.5;
    return aiStrength - playerStrength;
}

// Get card type priority based on situation
function getCardPriority(cardType, situation) {
    const priorities = {
        'desperate': {
            [CardType.HEAL]: 10,
            [CardType.DEFENSE]: 8,
            [CardType.RECHARGE]: 5,
            [CardType.ATTACK]: 3
        },
        'defensive': {
            [CardType.DEFENSE]: 9,
            [CardType.HEAL]: 7,
            [CardType.ATTACK]: 5,
            [CardType.RECHARGE]: 4
        },
        'neutral': {
            [CardType.ATTACK]: 7,
            [CardType.DEFENSE]: 6,
            [CardType.HEAL]: 5,
            [CardType.RECHARGE]: 5
        },
        'aggressive': {
            [CardType.ATTACK]: 10,
            [CardType.DEFENSE]: 4,
            [CardType.HEAL]: 3,
            [CardType.RECHARGE]: 3
        }
    };
    
    return priorities[situation]?.[cardType] || 5;
}
