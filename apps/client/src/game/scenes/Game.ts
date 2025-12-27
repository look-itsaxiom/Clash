import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import {
    ClashGameState,
    createNewGame,
    CardType,
    submitCard,
    PlayerState,
} from "@clash/shared";

interface PlayerZone {
    playAreaRect: Phaser.GameObjects.Rectangle;
    dropZone: Phaser.GameObjects.Zone;
    heartsY: number;
    handY: number;
    color: number;
    colorDark: number;
}

const CARD_WIDTH = 80;
const CARD_HEIGHT = 100;
const CARD_SPACING = 5;

export class Game extends Scene {
    private gameState!: ClashGameState;
    private currentDraggedCard: CardType | null = null;
    private player1Zone!: PlayerZone;
    private player2Zone!: PlayerZone;

    constructor() {
        super("Game");
    }

    preload() {
        this.load.setPath("assets");

        this.load.image("star", "star.png");
        this.load.image("background", "bg.png");
        this.load.image("logo", "logo.png");
    }

    create() {
        this.gameState = createNewGame("1", "player1", "player2");
        EventBus.emit("game-state-updated", this.gameState);

        this.add.image(512, 384, "background");

        // Setup player zones
        this.player1Zone = this.createPlayerZone(400, 550, 0x00ff00, 0x00aa00);
        this.player2Zone = this.createPlayerZone(200, 50, 0xff0000, 0xaa0000);

        // Render both players
        this.renderPlayer(this.gameState.players[0], this.player1Zone, 0, true);
        this.renderPlayer(
            this.gameState.players[1],
            this.player2Zone,
            1,
            false,
        );

        EventBus.emit("current-scene-ready", this);
    }

    private createPlayerZone(
        playAreaY: number,
        heartsY: number,
        color: number,
        colorDark: number,
    ): PlayerZone {
        const playAreaRect = this.add.rectangle(
            495,
            playAreaY,
            600,
            200,
            color,
            0.5,
        );
        playAreaRect.setStrokeStyle(2, colorDark);

        const dropZone = this.add
            .zone(495, playAreaY, 600, 200)
            .setRectangleDropZone(600, 200);

        return {
            playAreaRect,
            dropZone,
            heartsY,
            handY: heartsY,
            color,
            colorDark,
        };
    }

    private renderPlayer(
        player: PlayerState,
        zone: PlayerZone,
        playerIndex: number,
        enableDragging: boolean,
    ) {
        // Render hearts
        this.renderHearts(player.hearts, zone.heartsY);

        // Render hand
        if (enableDragging) {
            this.renderDraggableHand(player, zone, playerIndex);
        } else {
            this.renderStaticHand(player.hand, zone.handY);
        }
    }

    private renderHearts(hearts: number, y: number) {
        for (let i = 0; i < hearts; i++) {
            this.add.image(50 + i * 50, y, "star");
        }
    }

    private renderStaticHand(hand: CardType[], y: number) {
        const totalWidth =
            hand.length * CARD_WIDTH + (hand.length - 1) * CARD_SPACING;
        const startX = -100 + totalWidth / 2 + CARD_WIDTH / 2;

        hand.forEach((card, index) => {
            const x = startX + index * (CARD_WIDTH + CARD_SPACING);
            this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, 0xcccccc);
            this.add
                .text(x, y, "?", {
                    color: "#000000",
                    fontSize: "32px",
                })
                .setOrigin(0.5);
        });
    }

    private renderDraggableHand(
        player: PlayerState,
        zone: PlayerZone,
        playerIndex: number,
    ) {
        const hand = player.hand;
        const totalWidth =
            hand.length * CARD_WIDTH + (hand.length - 1) * CARD_SPACING;
        const startX = -100 + totalWidth / 2 + CARD_WIDTH / 2;

        hand.forEach((card, index) => {
            const x = startX + index * (CARD_WIDTH + CARD_SPACING);
            this.createDraggableCard(card, x, zone.handY, player.id, zone);
        });
    }

    private createDraggableCard(
        card: CardType,
        x: number,
        y: number,
        playerId: string,
        zone: PlayerZone,
    ) {
        const rect = this.add.rectangle(
            x,
            y,
            CARD_WIDTH,
            CARD_HEIGHT,
            0xffffff,
        );
        const text = this.add
            .text(x - CARD_WIDTH / 2 + 10, y - CARD_HEIGHT / 2 + 10, card, {
                color: "#000000",
                wordWrap: { width: CARD_WIDTH - 20 },
            })
            .setOrigin(0, 0);

        rect.setInteractive({ draggable: true });
        this.input.setDraggable(rect);

        rect.on("dragstart", () => {
            this.currentDraggedCard = card;
            rect.setFillStyle(0xdddddd);
        });

        rect.on("drag", (pointer: any, dragX: number, dragY: number) => {
            rect.x = dragX;
            rect.y = dragY;
            text.x = dragX - CARD_WIDTH / 2 + 10;
            text.y = dragY - CARD_HEIGHT / 2 + 10;
        });

        rect.on(
            "dragend",
            (pointer: any, dragX: number, dragY: number, dropped: boolean) => {
                if (dropped && this.currentDraggedCard) {
                    this.handleCardPlayed(
                        playerId,
                        this.currentDraggedCard,
                        rect,
                        text,
                        zone,
                    );
                } else {
                    // Reset position
                    rect.setFillStyle(0xffffff);
                    rect.x = x;
                    rect.y = y;
                    text.x = x - CARD_WIDTH / 2 + 10;
                    text.y = y - CARD_HEIGHT / 2 + 10;
                }
                this.currentDraggedCard = null;
            },
        );
    }

    private handleCardPlayed(
        playerId: string,
        card: CardType,
        rect: Phaser.GameObjects.Rectangle,
        text: Phaser.GameObjects.Text,
        zone: PlayerZone,
    ) {
        // Update game state
        this.gameState = submitCard(this.gameState, playerId, card);
        EventBus.emit("game-state-updated", this.gameState);

        // Move card to play area (face down)
        rect.x = zone.playAreaRect.x - CARD_WIDTH / 2 - 10;
        rect.y = zone.playAreaRect.y;
        rect.setFillStyle(0x888888);
        text.setText("");
        text.x = rect.x - CARD_WIDTH / 2 + 10;
        text.y = rect.y - CARD_HEIGHT / 2 + 10;

        // Disable dragging
        rect.disableInteractive();
    }
}

