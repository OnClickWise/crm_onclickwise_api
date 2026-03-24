import { Controller, Post, Get, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { CreateBoardUseCase } from '@/use-cases/board/create-board.useCase';
import { ListBoardsUseCase } from '@/use-cases/board/list-boards.useCase';
import { GetBoardByIdUseCase } from '@/use-cases/board/get-board-by-id.useCase';
import { UpdateBoardUseCase } from '@/use-cases/board/update-board.useCase';
import { DeleteBoardUseCase } from '@/use-cases/board/delete-board.useCase';

@Controller('boards')
export class BoardController {
  constructor(
    private readonly createBoardUseCase: CreateBoardUseCase,
    private readonly listBoardsUseCase: ListBoardsUseCase,
    private readonly getBoardByIdUseCase: GetBoardByIdUseCase,
    private readonly updateBoardUseCase: UpdateBoardUseCase,
    private readonly deleteBoardUseCase: DeleteBoardUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getBoardByIdUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateBoardUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteBoardUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createBoardUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('projectId') projectId: string, @Request() req: any) {
    return this.listBoardsUseCase.execute(projectId, req.user);
  }
}
