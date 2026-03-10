import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class UpdateBoardUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(id: string, data: any, user: any) {
    return this.boardService.updateBoard(id, data, user);
  }
}
