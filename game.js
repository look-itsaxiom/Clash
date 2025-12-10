// Game state
const GameState = {
    player: {
        hearts: 3,
        hand: [],
        discard: [],
        playedCard: null
    },
    ai: {
        hearts: 3,
        hand: [],
        discard: [],
        playedCard: null
    },
    phase: 'select', // 'select', 'reveal', 'result', 'gameover'
    selectedCard: null
};

// Card types
const CardType = {
    ATTACK: 'attack',
    DEFENSE: 'defense',
    HEAL: 'heal',
    RECHARGE: 'recharge'
};

// Initialize game
function initGame() {
    // Reset game state
    GameState.player = {
        hearts: 3,
        hand: createDeck(),
        discard: [],
        playedCard: null
    };
    
    GameState.ai = {
        hearts: 3,
        hand: createDeck(),
        discard: [],
        playedCard: null
    };
    
    GameState.phase = 'select';
    GameState.selectedCard = null;
    
    // Update UI
    updateUI();
    document.getElementById('game-over-modal').style.display = 'none';
    document.getElementById('turn-info').textContent = 'Select a card to play';
    document.getElementById('result-display').innerHTML = '';
    document.getElementById('reveal-btn').style.display = 'none';
    document.getElementById('continue-btn').style.display = 'none';
    document.getElementById('new-game-btn').style.display = 'none';
    
    // Clear card slots
    document.getElementById('player-card-slot').innerHTML = '<div class="card-placeholder">Select a card</div>';
    document.getElementById('ai-card-slot').innerHTML = '<div class="card-back">?</div>';
}

// Create a deck of cards
function createDeck() {
    return [
        { type: CardType.ATTACK, icon: '⚔️', name: 'Attack' },
        { type: CardType.ATTACK, icon: '⚔️', name: 'Attack' },
        { type: CardType.DEFENSE, icon: '🛡️', name: 'Defense' },
        { type: CardType.DEFENSE, icon: '🛡️', name: 'Defense' },
        { type: CardType.HEAL, icon: '💚', name: 'Heal' },
        { type: CardType.RECHARGE, icon: '🔄', name: 'Recharge' }
    ];
}

// Update UI
function updateUI() {
    updateHearts('player', GameState.player.hearts);
    updateHearts('ai', GameState.ai.hearts);
    updateHandCount('player', GameState.player.hand.length);
    updateHandCount('ai', GameState.ai.hand.length);
    renderPlayerHand();
}

// Update hearts display
function updateHearts(player, hearts) {
    const heartsContainer = document.getElementById(`${player}-hearts`);
    const heartElements = heartsContainer.querySelectorAll('.heart');
    
    heartElements.forEach((heart, index) => {
        if (index < hearts) {
            heart.classList.remove('lost');
        } else {
            heart.classList.add('lost');
        }
    });
}

// Update hand count
function updateHandCount(player, count) {
    document.getElementById(`${player}-hand-count`).textContent = count;
}

// Render player's hand
function renderPlayerHand() {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';
    
    GameState.player.hand.forEach((card, index) => {
        const cardElement = createCardElement(card, index);
        handContainer.appendChild(cardElement);
    });
}

// Create card element
function createCardElement(card, index) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${card.type}`;
    cardDiv.dataset.index = index;
    
    if (GameState.phase !== 'select') {
        cardDiv.classList.add('disabled');
    }
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'card-icon';
    iconDiv.textContent = card.icon;
    
    const typeDiv = document.createElement('div');
    typeDiv.className = 'card-type';
    typeDiv.textContent = card.name;
    
    cardDiv.appendChild(iconDiv);
    cardDiv.appendChild(typeDiv);
    
    if (GameState.phase === 'select') {
        cardDiv.addEventListener('click', () => selectCard(index));
    }
    
    return cardDiv;
}

// Player selects a card
function selectCard(index) {
    if (GameState.phase !== 'select') return;
    
    // Remove previous selection
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select new card
    GameState.selectedCard = index;
    const cards = document.querySelectorAll('.card');
    if (cards[index]) {
        cards[index].classList.add('selected');
    }
    
    // Update turn info
    document.getElementById('turn-info').textContent = 'Card selected! Click Reveal to play';
    document.getElementById('reveal-btn').style.display = 'inline-block';
}

// Reveal cards
function revealCards() {
    if (GameState.selectedCard === null) return;
    
    GameState.phase = 'reveal';
    
    // Play player's card
    GameState.player.playedCard = GameState.player.hand.splice(GameState.selectedCard, 1)[0];
    
    // AI plays a card
    GameState.ai.playedCard = aiSelectCard();
    
    // Display played cards
    displayPlayedCard('player', GameState.player.playedCard);
    displayPlayedCard('ai', GameState.ai.playedCard);
    
    // Hide reveal button
    document.getElementById('reveal-btn').style.display = 'none';
    document.getElementById('turn-info').textContent = 'Cards Revealed!';
    
    // Wait a moment, then resolve
    setTimeout(() => {
        resolveRound();
    }, 1500);
}

// Display played card
function displayPlayedCard(player, card) {
    const slot = document.getElementById(`${player}-card-slot`);
    slot.innerHTML = '';
    
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${card.type} played-card`;
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'card-icon';
    iconDiv.textContent = card.icon;
    
    const typeDiv = document.createElement('div');
    typeDiv.className = 'card-type';
    typeDiv.textContent = card.name;
    
    cardDiv.appendChild(iconDiv);
    cardDiv.appendChild(typeDiv);
    slot.appendChild(cardDiv);
}

// Resolve round
function resolveRound() {
    GameState.phase = 'result';
    
    const playerCard = GameState.player.playedCard;
    const aiCard = GameState.ai.playedCard;
    
    let resultHTML = '<h3>Round Result:</h3>';
    
    // Move cards to discard first (before processing effects)
    // Keep playedCard references so Defense can check opponent's card
    GameState.player.discard.push(playerCard);
    GameState.ai.discard.push(aiCard);
    
    // Process player's card effect
    let playerEffect = processCardEffect(playerCard, GameState.player, GameState.ai);
    if (playerEffect) {
        resultHTML += `<p>You: ${playerEffect}</p>`;
    }
    
    // Process AI's card effect
    let aiEffect = processCardEffect(aiCard, GameState.ai, GameState.player);
    if (aiEffect) {
        resultHTML += `<p>AI: ${aiEffect}</p>`;
    }
    
    // Clear playedCard references after processing effects
    GameState.player.playedCard = null;
    GameState.ai.playedCard = null;
    
    // Display results
    document.getElementById('result-display').innerHTML = resultHTML;
    updateUI();
    
    // Check for game over
    if (GameState.player.hearts <= 0 || GameState.ai.hearts <= 0) {
        setTimeout(() => {
            gameOver();
        }, 2000);
    } else {
        document.getElementById('continue-btn').style.display = 'inline-block';
    }
}

// Process card effect
function processCardEffect(card, player, opponent) {
    let message = '';
    
    switch (card.type) {
        case CardType.ATTACK:
            // Check if opponent has defense
            if (opponent.playedCard && opponent.playedCard.type === CardType.DEFENSE) {
                message = `${card.name} blocked by Defense!`;
            } else {
                opponent.hearts = Math.max(0, opponent.hearts - 1);
                message = `${card.name} dealt 1 damage!`;
            }
            break;
            
        case CardType.DEFENSE:
            // Defense only works against attacks
            if (opponent.playedCard && opponent.playedCard.type === CardType.ATTACK) {
                message = `${card.name} blocked the attack!`;
            } else {
                message = `${card.name} (no attack to block)`;
            }
            break;
            
        case CardType.HEAL:
            if (player.hearts < 3) {
                player.hearts = Math.min(3, player.hearts + 1);
                message = `${card.name} restored 1 heart!`;
            } else {
                message = `${card.name} (already at max hearts)`;
            }
            break;
            
        case CardType.RECHARGE:
            // Return all cards from discard, including the Recharge card itself
            const returned = player.discard.length;
            player.hand.push(...player.discard);
            player.discard = [];
            message = `${card.name} returned ${returned} card(s) to hand!`;
            break;
    }
    
    return message;
}

// Continue to next round
function continueGame() {
    GameState.phase = 'select';
    GameState.selectedCard = null;
    
    document.getElementById('turn-info').textContent = 'Select a card to play';
    document.getElementById('result-display').innerHTML = '';
    document.getElementById('continue-btn').style.display = 'none';
    
    // Clear card slots
    document.getElementById('player-card-slot').innerHTML = '<div class="card-placeholder">Select a card</div>';
    document.getElementById('ai-card-slot').innerHTML = '<div class="card-back">?</div>';
    
    updateUI();
}

// Game over
function gameOver() {
    GameState.phase = 'gameover';
    
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const message = document.getElementById('game-over-message');
    
    if (GameState.player.hearts <= 0) {
        title.textContent = '💔 Defeat 💔';
        message.textContent = 'The AI has won the battle!';
    } else {
        title.textContent = '🎉 Victory! 🎉';
        message.textContent = 'You have defeated the AI!';
    }
    
    modal.style.display = 'flex';
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    document.getElementById('reveal-btn').addEventListener('click', revealCards);
    document.getElementById('continue-btn').addEventListener('click', continueGame);
    document.getElementById('new-game-btn').addEventListener('click', initGame);
    document.getElementById('modal-new-game-btn').addEventListener('click', initGame);
});
