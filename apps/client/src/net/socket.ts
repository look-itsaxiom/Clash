import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@clash/shared";

/**
 * A Socket.IO client typed with the *server's* event maps. Because the emit and
 * listen generics are swapped relative to the server, the same shared protocol
 * gives us end-to-end type safety: a typo in an event name or payload is a
 * compile error on both ends of the wire.
 */
export type ClashSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:3000";

export function createSocket(): ClashSocket {
  return io(SERVER_URL, { transports: ["websocket"], autoConnect: true });
}
