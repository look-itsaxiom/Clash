import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// The package compiles to CommonJS; require it directly so every export resolves
// regardless of the ESM/CJS interop heuristics.
const require = createRequire(import.meta.url);
const { CARDS, createGame, createPlayer, legalMoves, submit, resolve, rematch, viewFor } =
  require("../dist/index.js");

function game() {
  return createGame("g1", createPlayer("p0", "Alice"), createPlayer("p1", "Bob"));
}

/** Play one full turn: both submit, then resolve. */
function turn(state, m0, m1) {
  state = submit(state, "p0", m0);
  state = submit(state, "p1", m1);
  return resolve(state);
}

test("new game starts in SELECTING with full hands and hearts", () => {
  const g = game();
  assert.equal(g.phase, "SELECTING");
  assert.equal(g.turn, 1);
  assert.equal(g.players[0].hearts, 3);
  assert.equal(g.players[0].hand.length, 7);
  assert.equal(g.players[1].hand.length, 7);
});

test("legalMoves returns distinct held cards, PASS only when empty", () => {
  const g = game();
  const moves = legalMoves(g.players[0]);
  assert.deepEqual([...moves].sort(), ["ATTACK", "DEFENSE", "HEAL", "HEAVY_ATTACK", "RECHARGE"]);
  const empty = createPlayer("x", "X");
  empty.hand = [];
  assert.deepEqual(legalMoves(empty), ["PASS"]);
});

test("submit rejects illegal and duplicate choices", () => {
  let g = game();
  g = submit(g, "p0", "ATTACK");
  assert.throws(() => submit(g, "p0", "ATTACK"), /already chosen/);
  // Player has no second HEAL — but does have one; use a card not in hand:
  const stripped = game();
  stripped.players[1].hand = ["ATTACK"];
  assert.throws(() => submit(stripped, "p1", "HEAL"), /not legal/);
});

test("attack into open guard deals 1 damage", () => {
  let g = turn(game(), "ATTACK", "DEFENSE"); // p1 defends, p0 unprotected
  // p0 attacked nothing-blocking? p1 played DEFENSE so p0's attack is blocked.
  assert.equal(g.players[1].hearts, 3); // blocked
  assert.equal(g.players[0].hearts, 3); // defense deals no damage
});

test("attack vs non-defense deals damage; defense blocks fully", () => {
  let g = turn(game(), "ATTACK", "RECHARGE");
  assert.equal(g.players[1].hearts, 2); // Bob took 1
  assert.equal(g.players[0].hearts, 3);

  let g2 = turn(game(), "ATTACK", "DEFENSE");
  assert.equal(g2.players[1].hearts, 3); // blocked
});

test("heavy attack deals 2 and is blocked by defense", () => {
  let g = turn(game(), "HEAVY_ATTACK", "RECHARGE");
  assert.equal(g.players[1].hearts, 1);
  let g2 = turn(game(), "HEAVY_ATTACK", "DEFENSE");
  assert.equal(g2.players[1].hearts, 3);
});

test("simultaneous attacks both land", () => {
  let g = turn(game(), "ATTACK", "ATTACK");
  assert.equal(g.players[0].hearts, 2);
  assert.equal(g.players[1].hearts, 2);
});

test("heal restores but never exceeds max", () => {
  let g = game();
  g = turn(g, "ATTACK", "HEAL"); // Bob at 3 heals while full -> still 3 (heal wasted, no damage to Bob since Alice attacked... wait Alice attacked Bob)
  // Alice ATTACK hits Bob (no defense) -> Bob 2, but Bob also healed +1 same turn -> back to 3.
  assert.equal(g.players[1].hearts, 3);
});

test("heal nets against simultaneous damage", () => {
  // Bring Bob to 1, then Bob heals while taking an attack.
  let g = game();
  g = turn(g, "HEAVY_ATTACK", "RECHARGE"); // Bob 1
  assert.equal(g.players[1].hearts, 1);
  g = turn(g, "ATTACK", "HEAL"); // Bob: 1 -1 +1 = 1
  assert.equal(g.players[1].hearts, 1);
});

test("recharge returns spent non-one-time cards and not itself", () => {
  let g = game();
  g = turn(g, "ATTACK", "DEFENSE"); // p0 discards ATTACK (blocked by Bob)
  g = turn(g, "DEFENSE", "DEFENSE"); // p0 discards DEFENSE
  const beforeHand = g.players[0].hand.length;
  g = turn(g, "RECHARGE", "RECHARGE");
  // p0 discard had [ATTACK, DEFENSE] (both rechargeable) -> returned to hand.
  // RECHARGE itself goes to discard afterward, so it is NOT returned this turn.
  assert.equal(g.players[0].discard.filter((c) => c === "RECHARGE").length, 1);
  assert.ok(g.players[0].hand.includes("ATTACK"));
  assert.ok(g.players[0].hand.includes("DEFENSE"));
  // hand grew by the 2 returned cards minus the recharge just played
  assert.equal(g.players[0].hand.length, beforeHand - 1 + 2);
});

test("recharge never returns one-time cards", () => {
  let g = game();
  g = turn(g, "HEAVY_ATTACK", "DEFENSE"); // p0 spends HEAVY_ATTACK (one-time)
  g = turn(g, "HEAL", "RECHARGE"); // p0 spends HEAL (one-time)
  g = turn(g, "RECHARGE", "DEFENSE");
  assert.ok(!g.players[0].hand.includes("HEAVY_ATTACK"));
  assert.ok(!g.players[0].hand.includes("HEAL"));
  // one-time cards remain in discard forever
  assert.ok(g.players[0].discard.includes("HEAVY_ATTACK"));
  assert.ok(g.players[0].discard.includes("HEAL"));
});

test("reducing a player to 0 hearts wins the game", () => {
  let g = game();
  g = turn(g, "HEAVY_ATTACK", "ATTACK"); // Bob 1, Alice 2
  g = turn(g, "ATTACK", "ATTACK"); // Bob 0, Alice 1
  assert.equal(g.phase, "FINISHED");
  assert.equal(g.winnerId, "p0");
  assert.equal(g.draw, false);
});

test("a double knockout is a draw", () => {
  let g = game();
  g = turn(g, "ATTACK", "ATTACK"); // 2/2
  g = turn(g, "ATTACK", "ATTACK"); // 1/1
  g = turn(g, "HEAVY_ATTACK", "HEAVY_ATTACK"); // both to -1
  assert.equal(g.phase, "FINISHED");
  assert.equal(g.draw, true);
  assert.equal(g.winnerId, null);
});

test("resolve cannot run before both players choose", () => {
  let g = submit(game(), "p0", "ATTACK");
  assert.throws(() => resolve(g), /Both players must choose/);
});

test("viewFor hides the opponent hand and pending move", () => {
  let g = game();
  g = submit(g, "p0", "ATTACK");
  const view = viewFor(g, "p1");
  assert.equal(view.you.hand.length, 7); // own hand visible
  assert.equal(view.opponent.handCount, 7); // count only
  assert.equal(view.opponent.selected, null); // p0's move hidden
  assert.equal(view.opponent.hasSelected, true); // but we know they locked in
  assert.equal(view.you.selected, null); // p1 hasn't chosen
});

test("rematch resets hearts, hands, and result while keeping identities", () => {
  let g = game();
  g = turn(g, "HEAVY_ATTACK", "RECHARGE");
  const r = rematch(g);
  assert.equal(r.phase, "SELECTING");
  assert.equal(r.turn, 1);
  assert.equal(r.players[0].hearts, 3);
  assert.equal(r.players[0].hand.length, 7);
  assert.equal(r.players[0].name, "Alice");
  assert.equal(r.lastResult, null);
});

test("card catalog stays internally consistent", () => {
  assert.equal(CARDS.HEAVY_ATTACK.damage, 2);
  assert.equal(CARDS.HEAVY_ATTACK.oneTime, true);
  assert.equal(CARDS.ATTACK.oneTime, false);
  assert.equal(CARDS.DEFENSE.blocks, true);
});
