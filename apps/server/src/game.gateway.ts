import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClashGameState, CardType } from '@clash/shared';

@WebSocketGateway({
  cors: { origin: '*' }, // later restrict to itch.io origin
})
export class GameGateway {
  @WebSocketServer()
  server: Server;

  // in-memory maps (fine for v1)
  private matchmakingQueue: string[] = [];
  private games = new Map<string, ClashGameState>();
  private socketToPlayer = new Map<string, { playerId: string; gameId?: string }>();

  handleConnection(socket: Socket) {
    // later attach auth info
    console.log(`Client connected: ${socket.id}`);
  }

  @SubscribeMessage('queue_random')
  handleQueue(@ConnectedSocket() socket: Socket) {
    // add to queue, if 2 players, create game, emit game start to both
    console.log(`Player queued for random match: ${socket.id}`);
  }

  @SubscribeMessage('join_private')
  handleJoinPrivate(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomCode: string; create?: boolean }) {
    // implement password style room matching
    console.log(`Player joining private match: ${socket.id} - ${data.roomCode}`);
  }

  @SubscribeMessage('submit_card')
  handleSubmitCard(@ConnectedSocket() socket: Socket, @MessageBody() data: { card: CardType }) {
    // lookup game by socket, call game logic, emit updated game state to both players
    console.log(`Player submitted card: ${socket.id} - ${data.card}`);
  }
}
