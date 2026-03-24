import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateInvestmentUseCase } from '@/use-cases/investment/create-investment.useCase';
import { ListInvestmentsUseCase } from '@/use-cases/investment/list-investments.useCase';
import { GetInvestmentByIdUseCase } from '@/use-cases/investment/get-investment-by-id.useCase';
import { UpdateInvestmentUseCase } from '@/use-cases/investment/update-investment.useCase';
import { DeleteInvestmentUseCase } from '@/use-cases/investment/delete-investment.useCase';
import { RefreshInvestmentPricesUseCase } from '@/use-cases/investment/refresh-investment-prices.useCase';

@Controller('investments')
export class InvestmentController {
  constructor(
    private readonly createInvestmentUseCase: CreateInvestmentUseCase,
    private readonly listInvestmentsUseCase: ListInvestmentsUseCase,
    private readonly getInvestmentByIdUseCase: GetInvestmentByIdUseCase,
    private readonly updateInvestmentUseCase: UpdateInvestmentUseCase,
    private readonly deleteInvestmentUseCase: DeleteInvestmentUseCase,
    private readonly refreshInvestmentPricesUseCase: RefreshInvestmentPricesUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createInvestmentUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('portfolioId') portfolioId: string, @Request() req: any) {
    return this.listInvestmentsUseCase.execute(portfolioId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getInvestmentByIdUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateInvestmentUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteInvestmentUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh-prices')
  async refreshPrices(@Request() req: any) {
    return this.refreshInvestmentPricesUseCase.execute(req.user);
  }
}
