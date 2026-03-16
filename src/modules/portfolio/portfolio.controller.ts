import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { PortfolioService } from './services/portfolio.service';

@Controller('portfolios')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.portfolioService.createPortfolio(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('investorId') investorId: string, @Request() req: any) {
    return this.portfolioService.listPortfolios(investorId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.portfolioService.getPortfolioById(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.portfolioService.updatePortfolio(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.portfolioService.deletePortfolio(id, req.user);
  }
}
