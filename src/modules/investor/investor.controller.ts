import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateInvestorUseCase } from '@/use-cases/investor/create-investor.useCase';
import { ListInvestorsUseCase } from '@/use-cases/investor/list-investors.useCase';
import { GetInvestorByIdUseCase } from '@/use-cases/investor/get-investor-by-id.useCase';
import { UpdateInvestorUseCase } from '@/use-cases/investor/update-investor.useCase';
import { DeleteInvestorUseCase } from '@/use-cases/investor/delete-investor.useCase';

@Controller('investors')
export class InvestorController {
  constructor(
    private readonly createInvestorUseCase: CreateInvestorUseCase,
    private readonly listInvestorsUseCase: ListInvestorsUseCase,
    private readonly getInvestorByIdUseCase: GetInvestorByIdUseCase,
    private readonly updateInvestorUseCase: UpdateInvestorUseCase,
    private readonly deleteInvestorUseCase: DeleteInvestorUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createInvestorUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.listInvestorsUseCase.execute(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getInvestorByIdUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateInvestorUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteInvestorUseCase.execute(id, req.user);
  }
}
