# ⚔️ Clash

A real-time, two-player card duel. Each player holds the same seven cards and, every turn, **both reveal simultaneously** — so winning is about reading your opponent: bait their Defense, time your Heavy Attack, and recharge before you run dry.

It's a deliberately tiny game built like a real one: an authoritative server, a pure deterministic rules engine, fog-of-war networking, reconnection, and a juicy animated board.

```
┌─────────────┐   typed Socket.IO    ┌──────────────┐
│   Client    │◀════ protocol ══════▶│    Server    │
│ React + Phaser│   (fog-of-war views) │ NestJS (auth.)│
└──────┬──────┘                      └──────┬───────┘
       │            @clash/shared            │
       └──────── pure rules engine ──────────┘
              (one source of truth)
```

## The deck (7 cards each)

| Card | Effect |
| --- | --- |
| ⚔️ Attack | Deal 1 damage |
| 💥 Heavy Attack | Deal 2 damage — **one-time use** |
| 🛡️ Defense | Block all incoming attack damage this turn |
| 💚 Heal | Restore 1 heart — **one-time use** |
| 🔄 Recharge | Return all spent cards (except one-time cards) to your hand |

Both cards resolve at once: damage and heals net against each other, Defense nullifies attacks, and a double knockout is a draw. Run out of cards and you must Pass — Recharge is what keeps you in the fight.

## Project layout

This is an npm-workspaces monorepo:

| Package | What it is |
| --- | --- |
| `packages/shared` | **The rules engine.** Pure, immutable, deterministic, fully unit-tested. Also defines the serializable game state, the per-player fog-of-war projection, and the typed wire protocol. Ships a dual ESM+CJS build so every consumer uses it natively. |
| `apps/server` | **Authoritative NestJS + Socket.IO server.** Matchmaking (random queue + private room codes), the simultaneous-reveal turn loop, turn timers with auto-pick, disconnect grace + forfeit, reconnection, and rematch. |
| `apps/client` | **React + Phaser client.** A lobby, a HUD overlay, and a board scene driven entirely by authoritative server state. |

### Why it's built this way

- **One source of truth.** The exact same engine that the server runs is what the unit tests exercise and what types the client. No rule is implemented twice.
- **The server is authoritative.** Clients render state and send intent; they never compute outcomes. Each client only ever receives its *own* view — the opponent's hand is sent as a count and their chosen card stays hidden until the reveal.
- **Deterministic by design.** No shuffle, no draw, no randomness in resolution. That makes the game trivially testable, replayable, and safe to reason about.
- **The network boundary is type-safe.** Client and server import the same `ServerToClientEvents` / `ClientToServerEvents` maps, so a wrong event name or payload is a compile error on both ends.

## Running it

Requires Node 20+.

```bash
npm install        # installs all workspaces and builds @clash/shared automatically

# Terminal 1 — the server (http://localhost:3000)
npm run dev:server

# Terminal 2 — the client (http://localhost:8080)
npm run dev:client
```

`@clash/shared` compiles to `dist/`, so it is built on install (and again before each
`dev:*` task). If you edit the shared engine while the apps are running, rebuild it with
`npm run build:shared`.

Open two browser tabs, pick **Create Private Room** in one and **Join** with the code in the other (or hit **Find a Match** in both). Point the client at a non-default server with `VITE_SERVER_URL`.

## Tests

```bash
npm test            # engine unit tests + server end-to-end tests
```

- `packages/shared` — 17 unit tests covering the full rule surface (blocking, heal-netting, recharge economy, one-time cards, win/draw/stalemate, fog-of-war).
- `apps/server` — 5 end-to-end tests that drive **two real Socket.IO clients** through matchmaking, fog-of-war, hidden moves, a full game to a terminal state, private rooms, and error handling.

## Production build

```bash
npm run build       # builds shared, server, and client
```

Serve `apps/client/dist` as static files and run the server with `node apps/server/dist/main.js` (honours `PORT`).
