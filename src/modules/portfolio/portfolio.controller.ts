import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreatePortfolioUseCase } from '@/use-cases/portfolio/create-portfolio.useCase';
import { ListPortfoliosUseCase } from '@/use-cases/portfolio/list-portfolios.useCase';
import { GetPortfolioByIdUseCase } from '@/use-cases/portfolio/get-portfolio-by-id.useCase';
import { UpdatePortfolioUseCase } from '@/use-cases/portfolio/update-portfolio.useCase';
import { DeletePortfolioUseCase } from '@/use-cases/portfolio/delete-portfolio.useCase';
import { DeletePortfolioCascadeUseCase } from '@/use-cases/portfolio/delete-portfolio-cascade.useCase';

@Controller('portfolios')
export class PortfolioController {
  constructor(
    private readonly createPortfolioUseCase: CreatePortfolioUseCase,
    private readonly listPortfoliosUseCase: ListPortfoliosUseCase,
    private readonly getPortfolioByIdUseCase: GetPortfolioByIdUseCase,
    private readonly updatePortfolioUseCase: UpdatePortfolioUseCase,
    private readonly deletePortfolioUseCase: DeletePortfolioUseCase,
    private readonly deletePortfolioCascadeUseCase: DeletePortfolioCascadeUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createPortfolioUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('investorId') investorId: string, @Request() req: any) {
    return this.listPortfoliosUseCase.execute(investorId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.getPortfolioByIdUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updatePortfolioUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/cascade')
  async deleteCascade(@Param('id') id: string, @Request() req: any) {
    return this.deletePortfolioCascadeUseCase.execute(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Query('cascade') cascade: string, @Request() req: any) {
    if (cascade === 'true') {
      return this.deletePortfolioCascadeUseCase.execute(id, req.user);
    }
    return this.deletePortfolioUseCase.execute(id, req.user);
  }
}
