import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class GetBoardByIdUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(id: string, user: any) {
    return this.boardService.getBoardById(id, user);
  }
}
