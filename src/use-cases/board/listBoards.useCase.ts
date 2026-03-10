import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class ListBoardsUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(projectId: string, user: any) {
    return this.boardService.listBoards(projectId, user);
  }
}
