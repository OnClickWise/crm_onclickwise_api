import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class CreateBoardUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(data: any, user: any) {
    return this.boardService.createBoard(data, user);
  }
}
