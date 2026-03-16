import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ContributionService } from './services/contribution.service';

@Controller('contributions')
export class ContributionController {
  constructor(private readonly contributionService: ContributionService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.contributionService.createContribution(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('portfolioId') portfolioId: string, @Request() req: any) {
    return this.contributionService.listContributions(portfolioId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.contributionService.updateContribution(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.contributionService.deleteContribution(id, req.user);
  }
}