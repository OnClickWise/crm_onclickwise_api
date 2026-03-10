import { Injectable } from '@nestjs/common';
import { ListService } from '@/modules/list/services/list.service';

@Injectable()
export class ListListsUseCase {
  constructor(private readonly listService: ListService) {}

  async execute(boardId: string, user: any) {
    return this.listService.listLists(boardId, user);
  }
}

