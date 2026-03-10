import { Controller, Post, Get, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { CreateListUseCase } from '@/use-cases/list/createList.useCase';
import { ListListsUseCase } from '@/use-cases/list/listLists.useCase';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { GetListByIdUseCase } from '@/use-cases/list/getListById.useCase';
import { UpdateListUseCase } from '@/use-cases/list/updateList.useCase';
import { DeleteListUseCase } from '@/use-cases/list/deleteList.useCase';

@Controller('lists')
export class ListController {
  constructor(
    private createList: CreateListUseCase,
    private listLists: ListListsUseCase,
    private getListById: GetListByIdUseCase,
    private updateList: UpdateListUseCase,
    private deleteList: DeleteListUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getListById.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateList.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteList.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createList.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('boardId') boardId: string, @Request() req: any) {
    return this.listLists.execute(boardId, req.user);
  }
}
