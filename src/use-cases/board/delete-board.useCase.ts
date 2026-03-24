import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class DeleteBoardUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(id: string, user: any) {
    return this.boardService.deleteBoard(id, user);
  }
}
