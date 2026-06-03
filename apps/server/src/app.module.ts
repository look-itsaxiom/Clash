import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game/game.service';

@Module({
  imports: [],
  providers: [GameGateway, GameService],
})
export class AppModule {}
