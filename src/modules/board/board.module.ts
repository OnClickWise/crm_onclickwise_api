import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardService } from './services/board.service';
import { DatabaseModule } from '../../shared/database/database.module';
import { CreateBoardUseCase } from '@/use-cases/board/create-board.useCase';
import { ListBoardsUseCase } from '@/use-cases/board/list-boards.useCase';
import { GetBoardByIdUseCase } from '@/use-cases/board/get-board-by-id.useCase';
import { UpdateBoardUseCase } from '@/use-cases/board/update-board.useCase';
import { DeleteBoardUseCase } from '@/use-cases/board/delete-board.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [BoardController],
  providers: [
    BoardService,
    CreateBoardUseCase,
    ListBoardsUseCase,
    GetBoardByIdUseCase,
    UpdateBoardUseCase,
    DeleteBoardUseCase,
  ],
  exports: [BoardService],
})
export class BoardModule {}