import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { type AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type { ClientGameState, Move } from "@clash/shared";
import { AppModule } from "./../src/app.module";

/** A simple deterministic policy: hit as hard as possible, fall back to anything. */
const PRIORITY: Move[] = ["HEAVY_ATTACK", "ATTACK", "DEFENSE", "RECHARGE", "HEAL", "PASS"];
function pick(legal: Move[]): Move {
  return PRIORITY.find((m) => legal.includes(m)) ?? legal[0];
}

function once<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe("Clash multiplayer (e2e)", () => {
  let app: INestApplication;
  let url: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterEach(() => {
    while (clients.length) clients.pop()?.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(): Socket {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    clients.push(socket);
    return socket;
  }

  it("matches two queued players and starts a game with fog-of-war", async () => {
    const a = connect();
    const b = connect();
    const startA = once<{ state: ClientGameState }>(a, "game:start");
    const startB = once<{ state: ClientGameState }>(b, "game:start");

    a.emit("lobby:queue", { name: "Alice" });
    b.emit("lobby:queue", { name: "Bob" });

    const [{ state: viewA }, { state: viewB }] = await Promise.all([startA, startB]);

    expect(viewA.phase).toBe("SELECTING");
    expect(viewA.you.hand).toHaveLength(7);
    expect(viewA.you.hearts).toBe(3);
    // Fog of war: the opponent is exposed only as a count, never as a hand.
    expect(viewA.opponent.handCount).toBe(7);
    expect((viewA.opponent as Record<string, unknown>).hand).toBeUndefined();
    expect(viewA.opponent.name).toBe("Bob");
    expect(viewB.opponent.name).toBe("Alice");
  });

  it("keeps a pending move hidden from the opponent until reveal", async () => {
    const a = connect();
    const b = connect();
    const startA = once<{ state: ClientGameState }>(a, "game:start");
    a.emit("lobby:queue", { name: "Alice" });
    b.emit("lobby:queue", { name: "Bob" });
    const { state } = await startA;
    await once(b, "game:start");

    // Alice locks in; Bob should learn she is ready but not what she played.
    const bSees = once<{ state: ClientGameState }>(b, "game:state");
    a.emit("game:submit", { card: pick(state.you.legalMoves) });
    const { state: bView } = await bSees;
    expect(bView.opponent.hasSelected).toBe(true);
    expect(bView.opponent.selected).toBeNull();
  });

  it("plays a full game to a legal terminal state", async () => {
    const a = connect();
    const b = connect();
    a.emit("lobby:queue", { name: "Alice" });
    b.emit("lobby:queue", { name: "Bob" });

    const final = await new Promise<ClientGameState>((resolve) => {
      let done = false;
      const finish = (s: ClientGameState) => {
        if (!done) {
          done = true;
          resolve(s);
        }
      };
      for (const sock of [a, b]) {
        const step = (state: ClientGameState) => {
          if (state.phase === "SELECTING") sock.emit("game:submit", { card: pick(state.you.legalMoves) });
        };
        sock.on("game:start", ({ state }: { state: ClientGameState }) => step(state));
        sock.on("game:reveal", ({ state }: { state: ClientGameState }) => step(state));
        sock.on("game:over", ({ state }: { state: ClientGameState }) => finish(state));
      }
    });

    expect(final.phase).toBe("FINISHED");
    const decided = final.winnerId !== null || final.draw === true;
    expect(decided).toBe(true);
    // At least one player must be out of hearts at the end of a fought game.
    expect(Math.min(final.you.hearts, final.opponent.hearts)).toBe(0);
  });

  it("connects two players through a private room code", async () => {
    const host = connect();
    const guest = connect();

    const created = once<{ roomCode: string }>(host, "lobby:room_created");
    host.emit("lobby:create_room", { name: "Host" });
    const { roomCode } = await created;
    expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);

    const startHost = once<{ state: ClientGameState }>(host, "game:start");
    const startGuest = once<{ state: ClientGameState }>(guest, "game:start");
    guest.emit("lobby:join_room", { roomCode, name: "Guest" });

    const [{ state: hostView }, { state: guestView }] = await Promise.all([startHost, startGuest]);
    expect(hostView.opponent.name).toBe("Guest");
    expect(guestView.opponent.name).toBe("Host");
  });

  it("rejects joining an unknown room code", async () => {
    const guest = connect();
    const err = once<{ message: string }>(guest, "lobby:error");
    guest.emit("lobby:join_room", { roomCode: "ZZZZ", name: "Lost" });
    const { message } = await err;
    expect(message).toMatch(/no open room/i);
  });
});
