import { Injectable } from '@nestjs/common';
import { ListService } from '@/modules/list/services/list.service';

@Injectable()
export class UpdateListUseCase {
  constructor(private readonly listService: ListService) {}

  async execute(id: string, data: any, user: any) {
    return this.listService.updateList(id, data, user);
  }
}

