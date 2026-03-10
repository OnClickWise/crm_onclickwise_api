import { Module } from '@nestjs/common';
import { ListController } from './list.controller';
import { ListService } from './services/list.service';
import { CreateListUseCase } from '@/use-cases/list/createList.useCase';
import { ListListsUseCase } from '@/use-cases/list/listLists.useCase';
import { GetListByIdUseCase } from '@/use-cases/list/getListById.useCase';
import { UpdateListUseCase } from '@/use-cases/list/updateList.useCase';
import { DeleteListUseCase } from '@/use-cases/list/deleteList.useCase';
import { DatabaseModule } from '@/shared/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ListController],
  providers: [
    ListService,
    CreateListUseCase,
    ListListsUseCase,
    GetListByIdUseCase,
    UpdateListUseCase,
    DeleteListUseCase,
  ],
})
export class ListModule {}
