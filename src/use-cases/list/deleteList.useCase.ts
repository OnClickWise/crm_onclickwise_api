import { Injectable } from '@nestjs/common';
import { ListService } from '@/modules/list/services/list.service';

@Injectable()
export class DeleteListUseCase {
  constructor(private readonly listService: ListService) {}

  async execute(id: string, user: any) {
    return this.listService.deleteList(id, user);
  }
}

