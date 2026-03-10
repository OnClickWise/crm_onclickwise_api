import { Injectable } from '@nestjs/common';
import { ListService } from '@/modules/list/services/list.service';

@Injectable()
export class CreateListUseCase {
  constructor(private readonly listService: ListService) {}

  async execute(data: any, user: any) {
    return this.listService.createList(data, user);
  }
}
