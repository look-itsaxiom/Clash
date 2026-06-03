import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Move } from "@clash/shared";
import { GameService } from "./game/game.service";
import type { GameServer, GameSocket } from "./game/game.service";

/**
 * Thin Socket.IO adapter. Every handler simply forwards the event to
 * {@link GameService}, which owns all rooms, timers, and game state. Keeping the
 * transport and the logic separated makes the service unit-testable without a
 * live socket and keeps this file a readable map of the wire protocol.
 */
@WebSocketGateway({
  cors: { origin: "*" }, // tighten to the deployed client origin before launch
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: GameServer;

  constructor(private readonly games: GameService) {}

  afterInit(server: GameServer): void {
    this.games.bind(server);
  }

  handleConnection(socket: GameSocket): void {
    this.games.handleConnect(socket);
  }

  handleDisconnect(socket: GameSocket): void {
    this.games.handleDisconnect(socket);
  }

  @SubscribeMessage("lobby:queue")
  onQueue(@ConnectedSocket() socket: GameSocket, @MessageBody() data: { name?: string }): void {
    this.games.queueRandom(socket, data?.name);
  }

  @SubscribeMessage("lobby:cancel")
  onCancel(@ConnectedSocket() socket: GameSocket): void {
    this.games.cancelQueue(socket);
  }

  @SubscribeMessage("lobby:create_room")
  onCreateRoom(@ConnectedSocket() socket: GameSocket, @MessageBody() data: { name?: string }): void {
    this.games.createRoom(socket, data?.name);
  }

  @SubscribeMessage("lobby:join_room")
  onJoinRoom(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() data: { roomCode: string; name?: string },
  ): void {
    this.games.joinRoom(socket, data.roomCode, data?.name);
  }

  @SubscribeMessage("game:submit")
  onSubmit(@ConnectedSocket() socket: GameSocket, @MessageBody() data: { card: Move }): void {
    this.games.submitMove(socket, data.card);
  }

  @SubscribeMessage("game:rematch")
  onRematch(@ConnectedSocket() socket: GameSocket): void {
    this.games.rematchVote(socket);
  }

  @SubscribeMessage("game:leave")
  onLeave(@ConnectedSocket() socket: GameSocket): void {
    this.games.leaveGame(socket);
  }

  @SubscribeMessage("game:resume")
  onResume(@ConnectedSocket() socket: GameSocket, @MessageBody() data: { token: string }): void {
    this.games.resume(socket, data.token);
  }
}
