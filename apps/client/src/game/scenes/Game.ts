import { Scene } from "phaser";
import { CARDS, MAX_HEARTS, type CardId, type ClientGameState, type Move, type TurnResult } from "@clash/shared";
import { EventBus } from "../EventBus";
import { ClashEvent, type RevealPayload } from "../events";
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants";

const CX = BOARD_WIDTH / 2;
const CARD_W = 92;
const CARD_H = 126;
const HAND_GAP = 14;

const PALETTE: Record<CardId, number> = {
  ATTACK: 0xe0524a,
  HEAVY_ATTACK: 0xb5179e,
  DEFENSE: 0x4895ef,
  HEAL: 0x52b788,
  RECHARGE: 0xf4a261,
};

const COLOR_BACK = 0x1b2440;
const COLOR_BORDER = 0x3a4a82;
const COLOR_EMPTY = 0x33406b;

const LAYOUT = {
  oppName: 26,
  oppHearts: 56,
  oppHand: 132,
  oppSlot: 250,
  vs: 322,
  youSlot: 394,
  youHearts: 524,
  youName: 556,
  youHand: 590,
};

/**
 * Pure-presentation board. It never decides anything about the rules — it only
 * renders whatever {@link ClientGameState} the server (via React) hands it and
 * emits the player's chosen move back over the EventBus. Rendering is
 * idempotent: every update rebuilds the board layer from scratch, which keeps
 * the visual state impossible to desync from the authoritative state.
 */
export class Game extends Scene {
  private board!: Phaser.GameObjects.Container;
  private fx!: Phaser.GameObjects.Container;
  private view: ClientGameState | null = null;
  private submitting = false;

  constructor() {
    super("Game");
  }

  create() {
    this.drawBackdrop();
    this.board = this.add.container(0, 0);
    this.fx = this.add.container(0, 0);

    EventBus.on(ClashEvent.View, this.onView, this);
    EventBus.on(ClashEvent.Reveal, this.onReveal, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(ClashEvent.View, this.onView, this);
      EventBus.off(ClashEvent.Reveal, this.onReveal, this);
    });

    // Ask React for the current authoritative view now that we can draw it.
    EventBus.emit(ClashEvent.Ready);
  }

  // ---- event handlers -------------------------------------------------------

  private onView(view: ClientGameState) {
    this.view = view;
    if (view.phase === "SELECTING" && !view.you.selected) this.submitting = false;
    this.renderView(view);
  }

  private onReveal({ state, result }: RevealPayload) {
    this.view = state;
    this.renderReveal(state, result);
  }

  // ---- rendering ------------------------------------------------------------

  private renderView(view: ClientGameState) {
    this.board.removeAll(true);
    const youSelectable = view.phase === "SELECTING" && !view.you.selected && !this.submitting;

    this.label(view.opponent.name + (view.opponent.connected ? "" : "  (away)"), CX, LAYOUT.oppName, 20, "#c7d2fe");
    this.drawHearts(view.opponent.hearts, LAYOUT.oppHearts);
    this.drawFaceDownRow(view.opponent.handCount, LAYOUT.oppHand);

    // Opponent's committed card: a face-down card while hidden, the real card on reveal.
    if (view.opponent.selected) this.placeCard(CX, LAYOUT.oppSlot, asCardOrNull(view.opponent.selected), false, false);
    else if (view.opponent.hasSelected) this.placeCard(CX, LAYOUT.oppSlot, null, true, false);
    else this.placeCard(CX, LAYOUT.oppSlot, null, false, true);

    this.drawVs(view);

    // Your committed card (if you have locked in this turn).
    if (view.you.selected) this.placeCard(CX, LAYOUT.youSlot, asCardOrNull(view.you.selected), false, false);
    else this.placeCard(CX, LAYOUT.youSlot, null, false, true);

    this.drawHearts(view.you.hearts, LAYOUT.youHearts);
    this.label(view.you.name, CX, LAYOUT.youName, 18, "#a7f3d0");
    this.drawHand(view.you.hand, LAYOUT.youHand, youSelectable);
  }

  private renderReveal(state: ClientGameState, result: TurnResult) {
    this.board.removeAll(true);
    this.fx.removeAll(true);

    const youEntry = result.entries.find((e) => e.playerId === state.you.id)!;
    const oppEntry = result.entries.find((e) => e.playerId === state.opponent.id)!;

    // Freeze hearts at their pre-turn values during the reveal, then settle.
    this.label(state.opponent.name, CX, LAYOUT.oppName, 20, "#c7d2fe");
    this.drawHearts(oppEntry.heartsBefore, LAYOUT.oppHearts);
    this.label(state.you.name, CX, LAYOUT.youName, 18, "#a7f3d0");
    this.drawHearts(youEntry.heartsBefore, LAYOUT.youHearts);
    this.drawVs(state);

    const oppCard = this.placeCard(CX, LAYOUT.oppSlot, null, true, false);
    const youCard = this.placeCard(CX, LAYOUT.youSlot, null, true, false);

    // Flip both cards face-up with a quick scale, staggered for drama.
    this.flip(oppCard, asCardOrNull(oppEntry.card), 120);
    this.flip(youCard, asCardOrNull(youEntry.card), 260);

    // Damage / heal feedback timed to land just after the flip.
    this.time.delayedCall(620, () => {
      this.applyFloaters(youEntry, LAYOUT.youHearts);
      this.applyFloaters(oppEntry, LAYOUT.oppHearts);
      this.drawHearts(youEntry.heartsAfter, LAYOUT.youHearts);
      this.drawHearts(oppEntry.heartsAfter, LAYOUT.oppHearts);
    });

    // Settle onto the real next-turn view.
    this.time.delayedCall(1150, () => {
      if (this.view === state) this.renderView(state);
    });
  }

  // ---- pieces ---------------------------------------------------------------

  private placeCard(
    x: number,
    y: number,
    card: CardId | null,
    faceDown: boolean,
    empty: boolean,
  ): Phaser.GameObjects.Container {
    const c = this.makeCard(card, faceDown, empty);
    c.setPosition(x, y);
    this.board.add(c);
    return c;
  }

  private makeCard(card: CardId | null, faceDown: boolean, empty: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();

    if (empty) {
      g.lineStyle(2, COLOR_EMPTY, 0.9);
      g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
      c.add(g);
      return c;
    }

    if (faceDown || !card) {
      g.fillStyle(COLOR_BACK, 1);
      g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
      g.lineStyle(2, COLOR_BORDER, 1);
      g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
      c.add(g);
      const mark = this.add.text(0, 0, "⚔", { fontSize: "34px", color: "#3a4a82" }).setOrigin(0.5);
      c.add(mark);
      return c;
    }

    const def = CARDS[card];
    const accent = PALETTE[card];
    g.fillStyle(0x141a30, 1);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.lineStyle(2.5, accent, 1);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
    g.fillStyle(accent, 0.22);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, 30, { tl: 12, tr: 12, bl: 0, br: 0 });
    c.add(g);

    const emoji = this.add.text(0, -8, def.emoji, { fontSize: "40px" }).setOrigin(0.5);
    const name = this.add
      .text(0, 44, def.name.toUpperCase(), { fontSize: "12px", color: "#cdd6f4", fontStyle: "bold" })
      .setOrigin(0.5);
    c.add(emoji);
    c.add(name);
    if (def.oneTime) {
      const warn = this.add.text(CARD_W / 2 - 14, -CARD_H / 2 + 14, "⚠", { fontSize: "14px" }).setOrigin(0.5);
      c.add(warn);
    }
    return c;
  }

  private drawHand(hand: CardId[], y: number, selectable: boolean) {
    if (hand.length === 0) {
      this.label("— no cards — you must pass —", CX, y, 16, "#8893b8");
      if (selectable) this.drawPassButton(y);
      return;
    }
    const total = hand.length * CARD_W + (hand.length - 1) * HAND_GAP;
    const startX = CX - total / 2 + CARD_W / 2;

    hand.forEach((card, i) => {
      const x = startX + i * (CARD_W + HAND_GAP);
      const c = this.makeCard(card, false, false);
      c.setPosition(x, y);
      this.board.add(c);

      if (!selectable) {
        c.setAlpha(0.55);
        return;
      }
      const hit = this.add.rectangle(x, y, CARD_W, CARD_H, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      this.board.add(hit);
      hit.on("pointerover", () => this.tweens.add({ targets: c, y: y - 18, duration: 120, ease: "Quad.out" }));
      hit.on("pointerout", () => this.tweens.add({ targets: c, y, duration: 120, ease: "Quad.out" }));
      hit.on("pointerdown", () => this.choose(card, c));
    });
  }

  private choose(card: Move, cardObj: Phaser.GameObjects.Container) {
    if (this.submitting) return;
    this.submitting = true;
    this.tweens.add({
      targets: cardObj,
      x: CX,
      y: LAYOUT.youSlot,
      duration: 220,
      ease: "Quad.out",
      onComplete: () => EventBus.emit(ClashEvent.Play, card),
    });
  }

  private drawPassButton(y: number) {
    const btn = this.add
      .text(CX, y + 34, "▶ Pass", {
        fontSize: "18px",
        color: "#cdd6f4",
        backgroundColor: "#26314f",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.board.add(btn);
    btn.on("pointerdown", () => {
      if (this.submitting) return;
      this.submitting = true;
      EventBus.emit(ClashEvent.Play, "PASS" as Move);
    });
  }

  private drawHearts(hearts: number, y: number) {
    const spacing = 34;
    const startX = CX - ((MAX_HEARTS - 1) * spacing) / 2;
    for (let i = 0; i < MAX_HEARTS; i++) {
      const alive = i < hearts;
      const h = this.add
        .text(startX + i * spacing, y, alive ? "♥" : "♡", {
          fontSize: "28px",
          color: alive ? "#ff5d73" : "#3a4570",
        })
        .setOrigin(0.5);
      this.board.add(h);
    }
  }

  private drawFaceDownRow(count: number, y: number) {
    const w = 30;
    const total = count * w;
    const startX = CX - total / 2 + w / 2;
    for (let i = 0; i < count; i++) {
      const g = this.add.graphics();
      const x = startX + i * w;
      g.fillStyle(COLOR_BACK, 1);
      g.fillRoundedRect(x - 16, y - 22, 32, 44, 6);
      g.lineStyle(1.5, COLOR_BORDER, 1);
      g.strokeRoundedRect(x - 16, y - 22, 32, 44, 6);
      this.board.add(g);
    }
  }

  private drawVs(view: ClientGameState) {
    const ready = view.phase === "SELECTING" && view.opponent.hasSelected ? "  ● opponent ready" : "";
    const t = this.add
      .text(CX, LAYOUT.vs, "VS" + ready, { fontSize: "22px", color: "#5566aa", fontStyle: "bold" })
      .setOrigin(0.5);
    this.board.add(t);
  }

  private applyFloaters(entry: TurnResult["entries"][number], heartsY: number) {
    const lost = entry.heartsBefore - entry.heartsAfter;
    if (lost > 0) {
      this.floatText(`-${lost}`, CX + 90, heartsY, "#ff5d73");
      this.cameras.main.shake(180, 0.004);
    }
    if (entry.healed > 0) this.floatText(`+${entry.healed}`, CX + 90, heartsY, "#88e6b6");
    if (entry.damageBlocked > 0 && lost === 0) this.floatText("blocked", CX + 100, heartsY, "#7fc0ff");
  }

  private floatText(text: string, x: number, y: number, color: string) {
    const t = this.add.text(x, y, text, { fontSize: "26px", color, fontStyle: "bold" }).setOrigin(0.5);
    this.fx.add(t);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: "Quad.out", onComplete: () => t.destroy() });
  }

  private flip(card: Phaser.GameObjects.Container, faceCard: CardId | null, delay: number) {
    this.tweens.add({
      targets: card,
      scaleX: 0,
      duration: 110,
      delay,
      ease: "Quad.in",
      onComplete: () => {
        card.removeAll(true);
        const face = this.makeCard(faceCard, false, false);
        face.list.slice().forEach((child) => card.add(child));
        face.destroy();
        this.tweens.add({ targets: card, scaleX: 1, duration: 110, ease: "Quad.out" });
      },
    });
  }

  private label(text: string, x: number, y: number, size: number, color: string) {
    const t = this.add.text(x, y, text, { fontSize: `${size}px`, color, fontStyle: "bold" }).setOrigin(0.5);
    this.board.add(t);
  }

  private drawBackdrop() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x141d3a, 0x141d3a, 1);
    g.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    g.fillStyle(0x1a2348, 0.5);
    g.fillRect(0, LAYOUT.vs - 30, BOARD_WIDTH, 60);
  }
}

function asCardOrNull(move: Move): CardId | null {
  return move === "PASS" ? null : move;
}
