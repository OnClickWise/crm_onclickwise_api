import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateContributionUseCase } from '@/use-cases/contribution/create-contribution.useCase';
import { ListContributionsUseCase } from '@/use-cases/contribution/list-contributions.useCase';
import { UpdateContributionUseCase } from '@/use-cases/contribution/update-contribution.useCase';
import { DeleteContributionUseCase } from '@/use-cases/contribution/delete-contribution.useCase';

@Controller('contributions')
export class ContributionController {
  constructor(
    private readonly createContributionUseCase: CreateContributionUseCase,
    private readonly listContributionsUseCase: ListContributionsUseCase,
    private readonly updateContributionUseCase: UpdateContributionUseCase,
    private readonly deleteContributionUseCase: DeleteContributionUseCase,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.createContributionUseCase.execute(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('portfolioId') portfolioId: string, @Request() req: any) {
    return this.listContributionsUseCase.execute(portfolioId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.updateContributionUseCase.execute(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.deleteContributionUseCase.execute(id, req.user);
  }
}