import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientGameState, Move, TurnResult } from "@clash/shared";
import { createSocket, type ClashSocket } from "../net/socket";
import { EventBus } from "../game/EventBus";
import { ClashEvent } from "../game/events";

export type Screen = "lobby" | "searching" | "game";

export interface Banner {
  text: string;
  tone: "info" | "good" | "bad";
}

export interface ClashApi {
  screen: Screen;
  connected: boolean;
  view: ClientGameState | null;
  banner: Banner | null;
  roomCode: string | null;
  deadline: number | null;
  lastResult: TurnResult | null;
  rematchPending: boolean;
  name: string;
  setName: (name: string) => void;
  queue: () => void;
  cancel: () => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  rematch: () => void;
  leave: () => void;
}

const NAME_KEY = "clash:name";
const TOKEN_KEY = "clash:token";

/**
 * The single owner of the socket connection and all lobby/game state. The board
 * is rendered by Phaser, but every authoritative update flows through here and
 * is forwarded to the scene over the {@link EventBus}; the scene's player input
 * comes back the same way and is relayed to the server.
 */
export function useClash(): ClashApi {
  const socketRef = useRef<ClashSocket | null>(null);
  const viewRef = useRef<ClientGameState | null>(null);

  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [view, setView] = useState<ClientGameState | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<TurnResult | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [name, setNameState] = useState<string>(() => localStorage.getItem(NAME_KEY) ?? "");

  const applyView = useCallback((next: ClientGameState) => {
    viewRef.current = next;
    setView(next);
    localStorage.setItem(TOKEN_KEY, next.you.id);
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    localStorage.setItem(NAME_KEY, value);
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) socket.emit("game:resume", { token });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("lobby:queued", ({ position }) => {
      setScreen("searching");
      setBanner({ text: `Searching for an opponent… (queue position ${position})`, tone: "info" });
    });
    socket.on("lobby:room_created", ({ roomCode: code }) => setRoomCode(code));
    socket.on("lobby:waiting", ({ roomCode: code }) => {
      setScreen("searching");
      setBanner({ text: `Share code ${code} — waiting for a friend to join…`, tone: "info" });
    });
    socket.on("lobby:error", ({ message }) => {
      // A failed resume just means the old game is gone — fall back to the lobby.
      localStorage.removeItem(TOKEN_KEY);
      setBanner({ text: message, tone: "bad" });
      setScreen((s) => (s === "game" ? "lobby" : s));
    });

    const startBoard = (state: ClientGameState) => {
      setScreen("game");
      setRoomCode(null);
      setRematchPending(false);
      setLastResult(null);
      setBanner(null);
      applyView(state);
      EventBus.emit(ClashEvent.View, state);
    };

    socket.on("game:start", ({ state }) => startBoard(state));
    socket.on("game:state", ({ state }) => {
      applyView(state);
      EventBus.emit(ClashEvent.View, state);
    });
    socket.on("game:reveal", ({ state, result }) => {
      applyView(state);
      setLastResult(result);
      EventBus.emit(ClashEvent.Reveal, { state, result });
    });
    socket.on("game:over", ({ state }) => {
      applyView(state);
      EventBus.emit(ClashEvent.View, state);
    });
    socket.on("game:timer", ({ deadline: d }) => setDeadline(d));

    socket.on("game:opponent_disconnected", ({ name: who }) =>
      setBanner({ text: `${who} disconnected — waiting for them to return…`, tone: "bad" }),
    );
    socket.on("game:opponent_reconnected", ({ name: who }) =>
      setBanner({ text: `${who} reconnected.`, tone: "good" }),
    );
    socket.on("game:opponent_left", ({ name: who }) =>
      setBanner({ text: `${who} left the match.`, tone: "bad" }),
    );

    // Phaser → React relays.
    const onReady = () => {
      if (viewRef.current) EventBus.emit(ClashEvent.View, viewRef.current);
    };
    const onPlay = (move: Move) => socket.emit("game:submit", { card: move });
    EventBus.on(ClashEvent.Ready, onReady);
    EventBus.on(ClashEvent.Play, onPlay);

    return () => {
      EventBus.off(ClashEvent.Ready, onReady);
      EventBus.off(ClashEvent.Play, onPlay);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyView]);

  const queue = useCallback(() => {
    socketRef.current?.emit("lobby:queue", { name });
    setScreen("searching");
    setBanner({ text: "Searching for an opponent…", tone: "info" });
  }, [name]);

  const cancel = useCallback(() => {
    socketRef.current?.emit("lobby:cancel");
    setScreen("lobby");
    setRoomCode(null);
    setBanner(null);
  }, []);

  const createRoom = useCallback(() => {
    socketRef.current?.emit("lobby:create_room", { name });
  }, [name]);

  const joinRoom = useCallback(
    (code: string) => {
      socketRef.current?.emit("lobby:join_room", { roomCode: code, name });
    },
    [name],
  );

  const rematch = useCallback(() => {
    socketRef.current?.emit("game:rematch");
    setRematchPending(true);
  }, []);

  const leave = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    viewRef.current = null;
    setView(null);
    setScreen("lobby");
    setBanner(null);
    setRoomCode(null);
    setDeadline(null);
    setLastResult(null);
    EventBus.emit(ClashEvent.Reset);
  }, []);

  return {
    screen,
    connected,
    view,
    banner,
    roomCode,
    deadline,
    lastResult,
    rematchPending,
    name,
    setName,
    queue,
    cancel,
    createRoom,
    joinRoom,
    rematch,
    leave,
  };
}
