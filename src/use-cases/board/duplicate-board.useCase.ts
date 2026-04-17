import { Injectable } from '@nestjs/common';
import { BoardService } from '@/modules/board/services/board.service';

@Injectable()
export class DuplicateBoardUseCase {
  constructor(private readonly boardService: BoardService) {}

  async execute(id: string, user: any) {
    return this.boardService.duplicateBoard(id, user);
  }
}