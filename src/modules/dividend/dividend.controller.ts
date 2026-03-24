import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateDividendUseCase } from '@/use-cases/dividend/create-dividend.useCase';
import { ListDividendsUseCase } from '@/use-cases/dividend/list-dividends.useCase';
import { UpdateDividendUseCase } from '@/use-cases/dividend/update-dividend.useCase';
import { DeleteDividendUseCase } from '@/use-cases/dividend/delete-dividend.useCase';

@Controller('dividends')
export class DividendController {
  constructor(
    private readonly createDividendUseCase: CreateDividendUseCase,
    private readonly listDividendsUseCase: ListDividendsUseCase,
    private readonly updateDividendUseCase: UpdateDividendUseCase,
    private readonly deleteDividendUseCase: DeleteDividendUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createDividendUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.listDividendsUseCase.execute(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateDividendUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteDividendUseCase.execute(id, req.user);
  }
}