import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateFinancialFlowUseCase } from '@/use-cases/financial-flow/create-financial-flow.useCase';
import { ListFinancialFlowsUseCase } from '@/use-cases/financial-flow/list-financial-flows.useCase';
import { UpdateFinancialFlowUseCase } from '@/use-cases/financial-flow/update-financial-flow.useCase';
import { DeleteFinancialFlowUseCase } from '@/use-cases/financial-flow/delete-financial-flow.useCase';

@Controller('financial-flows')
export class FinancialFlowController {
  constructor(
    private readonly createFinancialFlowUseCase: CreateFinancialFlowUseCase,
    private readonly listFinancialFlowsUseCase: ListFinancialFlowsUseCase,
    private readonly updateFinancialFlowUseCase: UpdateFinancialFlowUseCase,
    private readonly deleteFinancialFlowUseCase: DeleteFinancialFlowUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createFinancialFlowUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.listFinancialFlowsUseCase.execute(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateFinancialFlowUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteFinancialFlowUseCase.execute(id, req.user);
  }
}