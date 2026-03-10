import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardService } from './services/board.service';
import { DatabaseModule } from '../../shared/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [BoardController],
  providers: [BoardService],
  exports: [BoardService],
})
export class BoardModule {}