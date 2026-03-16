import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { InvestmentService } from './services/investment.service';

@Controller('investments')
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.investmentService.createInvestment(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('portfolioId') portfolioId: string, @Request() req: any) {
    return this.investmentService.listInvestments(portfolioId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.investmentService.getInvestmentById(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.investmentService.updateInvestment(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.investmentService.deleteInvestment(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh-prices')
  async refreshPrices(@Request() req: any) {
    return this.investmentService.refreshPrices(req.user);
  }
}
