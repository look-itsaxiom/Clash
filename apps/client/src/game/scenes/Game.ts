import { Scene } from "phaser";
import { CARDS, MAX_HEARTS, type CardId, type ClientGameState, type Move, type TurnResult } from "@clash/shared";
import { EventBus } from "../EventBus";
import { ClashEvent, type RevealPayload } from "../events";
import { SUPERSAMPLE, logicalBoardSize } from "../constants";

const PALETTE: Record<CardId, number> = {
  ATTACK: 0xe0524a,
  HEAVY_ATTACK: 0xb5179e,
  DEFENSE: 0x4895ef,
  HEAL: 0x52b788,
  RECHARGE: 0xf4a261,
};

const COLOR_CARD = 0x141a30;
const COLOR_BACK = 0x1b2440;
const COLOR_BORDER = 0x3a4a82;
const COLOR_EMPTY = 0x2a3563;
const COLOR_PANEL = 0x111a36;
const ACCENT_YOU = 0x52b788;
const ACCENT_OPP = 0x8893ff;

interface Panel {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Metrics {
  W: number;
  H: number;
  cx: number;
  handCardW: number;
  handCardH: number;
  slotCardW: number;
  slotCardH: number;
  oppPanel: Panel;
  youPanel: Panel;
  oppHandY: number;
  oppSlotY: number;
  vsY: number;
  youSlotY: number;
  youHandY: number;
  fontName: number;
  fontHeart: number;
  fontSmall: number;
}

/**
 * Pure-presentation board. It never decides anything about the rules — it only
 * renders whatever {@link ClientGameState} the server (via React) hands it and
 * emits the player's chosen move back over the EventBus.
 *
 * Layout is fully proportional to the (supersampled) canvas size and split into
 * dedicated regions:
 *
 *   ┌ opponent info ┐                         (HUD: turn/timer / log)
 *   │  name·hearts  │      · opponent hand ·
 *   └───────────────┘
 *                       [ opponent's card ]
 *   ───────────────────────── VS ─────────────────────────
 *                       [   your card    ]
 *   ┌  your info  ┐
 *   │ name·hearts │       ·  your hand  ·
 *   └─────────────┘
 *
 * Rendering is idempotent: every update rebuilds the board layer from scratch,
 * so the visuals can never desync from the authoritative state.
 */
export class Game extends Scene {
  private bg!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Container;
  private fx!: Phaser.GameObjects.Container;
  private view: ClientGameState | null = null;
  private submitting = false;
  private alive = false;
  private readonly onWindowResize = () => this.syncOrientation();

  constructor() {
    super("Game");
  }

  create() {
    this.bg = this.add.graphics(); // persistent background, behind the rebuilt layers
    this.board = this.add.container(0, 0);
    this.fx = this.add.container(0, 0);
    this.drawBackdrop();

    EventBus.on(ClashEvent.View, this.onView, this);
    EventBus.on(ClashEvent.Reveal, this.onReveal, this);
    // Re-render whenever the canvas dimensions change (orientation / resize).
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onCanvasResize, this);
    window.addEventListener("resize", this.onWindowResize);
    window.addEventListener("orientationchange", this.onWindowResize);

    const cleanup = () => {
      this.alive = false;
      EventBus.off(ClashEvent.View, this.onView, this);
      EventBus.off(ClashEvent.Reveal, this.onReveal, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onCanvasResize, this);
      window.removeEventListener("resize", this.onWindowResize);
      window.removeEventListener("orientationchange", this.onWindowResize);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    this.alive = true;
    this.syncOrientation();
    EventBus.emit(ClashEvent.Ready);
  }

  /** Swap the canvas between landscape and portrait aspect to match the viewport. */
  private syncOrientation() {
    if (!this.alive) return;
    const { width, height } = logicalBoardSize();
    const w = width * SUPERSAMPLE;
    const h = height * SUPERSAMPLE;
    if (this.scale.width !== w || this.scale.height !== h) {
      this.scale.setGameSize(w, h);
    }
  }

  private onCanvasResize() {
    if (!this.alive) return;
    this.drawBackdrop();
    if (this.view) this.renderView(this.view);
  }

  // ---- layout ---------------------------------------------------------------

  private metrics(): Metrics {
    const W = this.scale.width;
    const H = this.scale.height;
    // Size everything off the smaller dimension so cards and text stay sensible
    // in both wide (landscape) and tall (portrait) aspect ratios.
    const u = Math.min(W, H);
    const portrait = H > W;
    const pad = u * 0.022;
    const panelW = portrait ? Math.min(W * 0.72, u * 0.82) : u * 0.3;
    const panelH = u * 0.13;
    const handCardH = u * 0.155;
    const slotCardH = u * 0.2;
    return {
      W,
      H,
      cx: W / 2,
      handCardW: handCardH * 0.7,
      handCardH,
      slotCardW: slotCardH * 0.7,
      slotCardH,
      oppPanel: portrait
        ? { x: (W - panelW) / 2, y: pad, w: panelW, h: panelH }
        : { x: pad, y: pad, w: panelW, h: panelH },
      youPanel: portrait
        ? { x: (W - panelW) / 2, y: H * 0.705, w: panelW, h: panelH }
        : { x: pad, y: H - pad - panelH, w: panelW, h: panelH },
      oppHandY: portrait ? H * 0.2 : H * 0.115,
      oppSlotY: portrait ? H * 0.33 : H * 0.35,
      vsY: portrait ? H * 0.46 : H * 0.5,
      youSlotY: portrait ? H * 0.59 : H * 0.65,
      youHandY: H * 0.875,
      fontName: Math.round(u * 0.035),
      fontHeart: Math.round(u * 0.055),
      fontSmall: Math.round(u * 0.026),
    };
  }

  // ---- event handlers -------------------------------------------------------

  private onView(view: ClientGameState) {
    if (!this.alive) return;
    this.view = view;
    this.renderView(view);
  }

  private onReveal({ state, result }: RevealPayload) {
    if (!this.alive) return;
    this.view = state;
    this.renderReveal(state, result);
  }

  // ---- rendering ------------------------------------------------------------

  private renderView(view: ClientGameState) {
    const m = this.metrics();
    this.board.removeAll(true);
    // A fresh selection turn clears the local submit lock, whether we got here
    // from a plain state update or from the reveal animation settling.
    if (view.phase === "SELECTING" && !view.you.selected) this.submitting = false;
    const selectable = view.phase === "SELECTING" && !view.you.selected && !this.submitting;

    this.drawInfoPanel(m.oppPanel, view.opponent.name, view.opponent.hearts, view.opponent.connected, ACCENT_OPP, m);
    this.drawInfoPanel(m.youPanel, view.you.name, view.you.hearts, view.you.connected, ACCENT_YOU, m);

    this.drawFaceDownRow(view.opponent.handCount, m.oppHandY, m);
    this.drawVs(view, m);

    // Opponent's committed card: face-down while hidden, revealed otherwise.
    if (view.opponent.selected) this.placeCard(m.cx, m.oppSlotY, asCardOrNull(view.opponent.selected), false, false, m.slotCardW, m.slotCardH);
    else if (view.opponent.hasSelected) this.placeCard(m.cx, m.oppSlotY, null, true, false, m.slotCardW, m.slotCardH);
    else this.placeCard(m.cx, m.oppSlotY, null, false, true, m.slotCardW, m.slotCardH);

    // Your committed card (if you have locked in this turn).
    if (view.you.selected) this.placeCard(m.cx, m.youSlotY, asCardOrNull(view.you.selected), false, false, m.slotCardW, m.slotCardH);
    else this.placeCard(m.cx, m.youSlotY, null, false, true, m.slotCardW, m.slotCardH);

    this.drawHand(view.you.hand, m, selectable);
  }

  private renderReveal(state: ClientGameState, result: TurnResult) {
    const m = this.metrics();
    this.board.removeAll(true);
    this.fx.removeAll(true);

    const youEntry = result.entries.find((e) => e.playerId === state.you.id)!;
    const oppEntry = result.entries.find((e) => e.playerId === state.opponent.id)!;

    // Freeze the panels at their pre-turn hearts during the reveal, then settle.
    this.drawInfoPanel(m.oppPanel, state.opponent.name, oppEntry.heartsBefore, state.opponent.connected, ACCENT_OPP, m);
    this.drawInfoPanel(m.youPanel, state.you.name, youEntry.heartsBefore, state.you.connected, ACCENT_YOU, m);
    this.drawVs(state, m);

    const oppCard = this.placeCard(m.cx, m.oppSlotY, null, true, false, m.slotCardW, m.slotCardH);
    const youCard = this.placeCard(m.cx, m.youSlotY, null, true, false, m.slotCardW, m.slotCardH);

    this.flip(oppCard, asCardOrNull(oppEntry.card), 120, m);
    this.flip(youCard, asCardOrNull(youEntry.card), 260, m);

    this.time.delayedCall(640, () => {
      this.applyFloaters(youEntry, m.youPanel, m);
      this.applyFloaters(oppEntry, m.oppPanel, m);
      this.drawInfoPanel(m.youPanel, state.you.name, youEntry.heartsAfter, state.you.connected, ACCENT_YOU, m);
      this.drawInfoPanel(m.oppPanel, state.opponent.name, oppEntry.heartsAfter, state.opponent.connected, ACCENT_OPP, m);
    });

    this.time.delayedCall(1200, () => {
      if (this.view === state) this.renderView(state);
    });
  }

  // ---- pieces ---------------------------------------------------------------

  private drawInfoPanel(p: Panel, name: string, hearts: number, connected: boolean, accent: number, m: Metrics) {
    const g = this.add.graphics();
    g.fillStyle(COLOR_PANEL, 0.82);
    g.fillRoundedRect(p.x, p.y, p.w, p.h, 14);
    g.lineStyle(2, accent, 0.5);
    g.strokeRoundedRect(p.x, p.y, p.w, p.h, 14);
    g.fillStyle(accent, 1);
    g.fillRoundedRect(p.x, p.y, 7, p.h, { tl: 14, bl: 14, tr: 0, br: 0 });
    this.board.add(g);

    const padX = p.x + p.w * 0.09;
    const nameText = this.add
      .text(padX, p.y + p.h * 0.3, connected ? name : `${name} (away)`, {
        fontSize: `${m.fontName}px`,
        color: connected ? "#e7ecff" : "#8893b8",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.board.add(nameText);

    this.drawHearts(padX, p.y + p.h * 0.68, hearts, m.fontHeart);
  }

  private drawHearts(x: number, y: number, hearts: number, size: number) {
    const spacing = size * 0.92;
    for (let i = 0; i < MAX_HEARTS; i++) {
      const alive = i < hearts;
      // Same glyph for both states so the silhouette matches exactly — only the
      // colour changes (a lost heart is a dark "ghost" of a full one).
      const h = this.add
        .text(x + i * spacing, y, "♥", {
          fontSize: `${size}px`,
          color: alive ? "#ff5d73" : "#33406b",
        })
        .setOrigin(0, 0.5);
      this.board.add(h);
    }
  }

  private drawFaceDownRow(count: number, y: number, m: Metrics) {
    const w = m.handCardH * 0.32;
    const h = m.handCardH * 0.46;
    const gap = w * 0.5;
    const total = count * w + (count - 1) * gap;
    const startX = m.cx - total / 2 + w / 2;
    for (let i = 0; i < count; i++) {
      const g = this.add.graphics();
      const x = startX + i * (w + gap);
      g.fillStyle(COLOR_BACK, 1);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.lineStyle(2, COLOR_BORDER, 1);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      this.board.add(g);
    }
  }

  private drawVs(view: ClientGameState, m: Metrics) {
    const g = this.add.graphics();
    g.lineStyle(2, 0x26305a, 1);
    g.lineBetween(m.W * 0.28, m.vsY, m.W * 0.43, m.vsY);
    g.lineBetween(m.W * 0.57, m.vsY, m.W * 0.72, m.vsY);
    this.board.add(g);

    const u = Math.min(m.W, m.H);
    const ready = view.phase === "SELECTING" && view.opponent.hasSelected;
    const t = this.add
      .text(m.cx, m.vsY, "VS", { fontSize: `${Math.round(u * 0.045)}px`, color: "#5566aa", fontStyle: "bold" })
      .setOrigin(0.5);
    this.board.add(t);
    if (ready) {
      const dot = this.add
        .text(m.cx, m.vsY + u * 0.055, "● opponent ready", { fontSize: `${m.fontSmall}px`, color: "#88e6b6" })
        .setOrigin(0.5);
      this.board.add(dot);
    }
  }

  private drawHand(hand: CardId[], m: Metrics, selectable: boolean) {
    const y = m.youHandY;
    if (hand.length === 0) {
      const t = this.add
        .text(m.cx, y, "— no cards — you must pass —", { fontSize: `${m.fontName}px`, color: "#8893b8" })
        .setOrigin(0.5);
      this.board.add(t);
      if (selectable) this.drawPassButton(m);
      return;
    }
    const gap = m.handCardW * 0.16;
    const total = hand.length * m.handCardW + (hand.length - 1) * gap;
    const startX = m.cx - total / 2 + m.handCardW / 2;

    hand.forEach((card, i) => {
      const x = startX + i * (m.handCardW + gap);
      const c = this.makeCard(card, false, false, m.handCardW, m.handCardH);
      c.setPosition(x, y);
      this.board.add(c);

      if (!selectable) {
        c.setAlpha(0.5);
        return;
      }
      const hit = this.add.rectangle(x, y, m.handCardW, m.handCardH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      this.board.add(hit);
      const lift = m.H * 0.03;
      hit.on("pointerover", () => this.tweens.add({ targets: c, y: y - lift, duration: 120, ease: "Quad.out" }));
      hit.on("pointerout", () => this.tweens.add({ targets: c, y, duration: 120, ease: "Quad.out" }));
      hit.on("pointerdown", () => this.choose(card, c, m));
    });
  }

  private choose(card: Move, cardObj: Phaser.GameObjects.Container, m: Metrics) {
    if (this.submitting) return;
    this.submitting = true;
    this.tweens.add({
      targets: cardObj,
      x: m.cx,
      y: m.youSlotY,
      duration: 240,
      ease: "Quad.out",
      onComplete: () => EventBus.emit(ClashEvent.Play, card),
    });
  }

  private drawPassButton(m: Metrics) {
    const btn = this.add
      .text(m.cx, m.youHandY + m.H * 0.06, "▶ Pass", {
        fontSize: `${m.fontName}px`,
        color: "#cdd6f4",
        backgroundColor: "#26314f",
        padding: { x: 20, y: 12 },
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

  private placeCard(x: number, y: number, card: CardId | null, faceDown: boolean, empty: boolean, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.makeCard(card, faceDown, empty, w, h);
    c.setPosition(x, y);
    this.board.add(c);
    return c;
  }

  private makeCard(card: CardId | null, faceDown: boolean, empty: boolean, w: number, h: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    const r = Math.min(w, h) * 0.12;
    const lw = Math.max(2, h * 0.02);

    if (empty) {
      g.lineStyle(lw, COLOR_EMPTY, 0.9);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      c.add(g);
      return c;
    }

    if (faceDown || !card) {
      g.fillStyle(COLOR_BACK, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      g.lineStyle(lw, COLOR_BORDER, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      c.add(g);
      const mark = this.add.text(0, 0, "⚔", { fontSize: `${Math.round(h * 0.3)}px`, color: "#3a4a82" }).setOrigin(0.5);
      c.add(mark);
      return c;
    }

    const def = CARDS[card];
    const accent = PALETTE[card];
    g.fillStyle(COLOR_CARD, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    // A slim accent stripe for colour identity (not a heavy header band).
    g.fillStyle(accent, 0.9);
    g.fillRoundedRect(-w / 2, -h / 2, w, h * 0.07, { tl: r, tr: r, bl: 0, br: 0 });
    g.lineStyle(lw, accent, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    c.add(g);

    const emoji = this.add.text(0, -h * 0.11, def.emoji, { fontSize: `${Math.round(h * 0.32)}px` }).setOrigin(0.5);
    c.add(emoji);
    // Wrap on the card width so longer names ("Heavy Attack") never spill out.
    const name = this.add
      .text(0, h * 0.27, def.name.toUpperCase(), {
        fontSize: `${Math.round(h * 0.085)}px`,
        color: "#cdd6f4",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: w * 0.82 },
        lineSpacing: Math.round(h * 0.01),
      })
      .setOrigin(0.5);
    c.add(name);
    if (def.oneTime) {
      const warn = this.add.text(w / 2 - w * 0.15, -h / 2 + h * 0.17, "⚠", { fontSize: `${Math.round(h * 0.11)}px` }).setOrigin(0.5);
      c.add(warn);
    }
    return c;
  }

  private applyFloaters(entry: TurnResult["entries"][number], panel: Panel, m: Metrics) {
    const lost = entry.heartsBefore - entry.heartsAfter;
    const x = panel.x + panel.w + m.W * 0.01;
    const y = panel.y + panel.h * 0.52;
    if (lost > 0) {
      this.floatText(`-${lost}`, x, y, "#ff5d73", m);
      this.cameras.main.shake(180, 0.004);
    }
    if (entry.healed > 0) this.floatText(`+${entry.healed}`, x, y, "#88e6b6", m);
    if (entry.damageBlocked > 0 && lost === 0) this.floatText("blocked", x, y, "#7fc0ff", m);
  }

  private floatText(text: string, x: number, y: number, color: string, m: Metrics) {
    const u = Math.min(m.W, m.H);
    const t = this.add.text(x, y, text, { fontSize: `${Math.round(u * 0.05)}px`, color, fontStyle: "bold" }).setOrigin(0, 0.5);
    this.fx.add(t);
    this.tweens.add({ targets: t, y: y - u * 0.07, alpha: 0, duration: 950, ease: "Quad.out", onComplete: () => t.destroy() });
  }

  private flip(card: Phaser.GameObjects.Container, faceCard: CardId | null, delay: number, m: Metrics) {
    this.tweens.add({
      targets: card,
      scaleX: 0,
      duration: 120,
      delay,
      ease: "Quad.in",
      onComplete: () => {
        card.removeAll(true);
        const face = this.makeCard(faceCard, false, false, m.slotCardW, m.slotCardH);
        face.list.slice().forEach((child) => card.add(child));
        face.destroy();
        this.tweens.add({ targets: card, scaleX: 1, duration: 120, ease: "Quad.out" });
      },
    });
  }

  private drawBackdrop() {
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.bg;
    g.clear();
    g.fillGradientStyle(0x0b1020, 0x0b1020, 0x141d3a, 0x141d3a, 1);
    g.fillRect(0, 0, W, H);
    // A subtle central stage band to anchor the duel.
    g.fillStyle(0x162043, 0.45);
    g.fillRect(0, H * 0.22, W, H * 0.56);
  }
}

function asCardOrNull(move: Move): CardId | null {
  return move === "PASS" ? null : move;
}
